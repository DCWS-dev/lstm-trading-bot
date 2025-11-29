/**
 * ultra-tuner-v6.js
 *
 * Lightweight per-pair grid search tuner for ULTRA v6 conservative strategy.
 * - Runs a small parameter grid per pair (minConfidence, tpPct, slPct, maxHoldBars)
 * - Saves best parameters per pair to config/per-pair-tuning.json
 * - Optionally runs a final full backtest with tuned params (--test-all)
 */

const fs = require('fs');
const path = require('path');
const UltraLSTMv3 = require('./ultra-lstm-v3');

// Small, fast backtest using the same market generator as v6 but parametrized
function generateMarketData(pair, sessions = 120) {
  const data = [];
  const volatility = {
    'BTCUSDT': 0.8, 'ETHUSDT': 1.0, 'BNBUSDT': 0.9,
    'default': 0.7
  }[pair] || 0.7;

  let price = 100 * (Math.random() + 1);
  let trend = 0;

  for (let i = 0; i < sessions; i++) {
    const meanReversionForce = -trend * 0.05;
    const randomComponent = (Math.random() - 0.5) * volatility * 0.01;
    trend = trend * 0.95 + (Math.random() - 0.5) * 0.002;
    const change = meanReversionForce + randomComponent + trend;
    price *= (1 + change);
    const open = price * (1 + (Math.random() - 0.5) * 0.002);
    const close = price * (1 + (Math.random() - 0.5) * 0.002);
    const high = Math.max(open, close) * (1 + Math.abs(Math.random() - 0.5) * 0.004);
    const low = Math.min(open, close) * (1 - Math.abs(Math.random() - 0.5) * 0.004);
    const volume = (Math.random() + 0.5) * 1000000;
    data.push({ time: Date.now() + i * 60000, open, high, low, close, volume });
    price = close;
  }

  return data;
}

function backtestPairWithParams(pair, params) {
  const ohlcData = generateMarketData(pair, params.sessions || 120);
  let trades = 0, wins = 0, losses = 0, totalProfit = 0, totalWinAmt = 0, totalLossAmt = 0;
  const portfolio = { cash: 10000, positions: {} };

  for (let i = 30; i < ohlcData.length; i++) {
    const historical = ohlcData.slice(Math.max(0, i - 60), i + 1);
    const signal = UltraLSTMv3.generateSignal(historical);
    const price = ohlcData[i].close;

    // Exit
    if (portfolio.positions[pair]) {
      const pos = portfolio.positions[pair];
      const profitPercent = ((price - pos.entryPrice) / pos.entryPrice) * 100;
      const holdBars = i - pos.entryIndex;
      let shouldClose = false;
      if (profitPercent >= params.tpPct) shouldClose = true;
      else if (profitPercent <= -params.slPct) shouldClose = true;
      else if (holdBars >= params.maxHoldBars) shouldClose = true;

      if (shouldClose) {
        const profit = (price - pos.entryPrice) * pos.quantity;
        trades++;
        if (profit > 0) { wins++; totalWinAmt += profit; } else { losses++; totalLossAmt += Math.abs(profit); }
        totalProfit += profit;
        portfolio.cash += price * pos.quantity;
        delete portfolio.positions[pair];
      }
    }

    // Entry
    if (!portfolio.positions[pair]) {
      if ((signal.action === 'BUY' || signal.action === 'SELL') && signal.confidence >= params.minConfidence) {
        const riskPercent = Math.min(0.02, signal.confidence * 0.02);
        const positionValue = portfolio.cash * riskPercent;
        const quantity = positionValue / price;
        if (quantity * price < portfolio.cash * 0.95) {
          portfolio.positions[pair] = { entryPrice: price, quantity, entryIndex: i, action: signal.action };
          portfolio.cash -= quantity * price;
        }
      }
    }
  }

  // Close leftover
  if (portfolio.positions[pair]) {
    const pos = portfolio.positions[pair];
    const finalPrice = ohlcData[ohlcData.length - 1].close;
    const profit = (finalPrice - pos.entryPrice) * pos.quantity;
    trades++; if (profit > 0) { wins++; totalWinAmt += profit; } else { losses++; totalLossAmt += Math.abs(profit); }
    totalProfit += profit;
  }

  const winRate = trades > 0 ? (wins / trades) * 100 : 0;
  const avgWin = wins > 0 ? totalWinAmt / wins : 0;
  const avgLoss = losses > 0 ? totalLossAmt / losses : 0;

  return { pair, trades, wins, losses, winRate, totalProfit, avgWin, avgLoss };
}

async function runTuning(options = {}) {
  const pairs = [
    'BTCUSDT','ETHUSDT','BNBUSDT','XRPUSDT','ADAUSDT','SOLUSDT','DOGEUSDT','DOTUSDT','LTCUSDT','LINKUSDT',
    'MATICUSDT','AVAXUSDT','FTMUSDT','ATOMUSDT','UNIUSDT','ARBUSDT','OPUSDT','APEUSDT','LUNCUSDT','SHIBUSDT',
    'FLOKIUSDT','PEPEUSDT','SUIUSDT','TONUSDT','NEARUSDT','ALGOUSDT','FILUSDT','THETAUSDT','CHZUSDT','OPTIMUSDT'
  ];

  const grid = {
    minConfidence: options.quick ? [0.6, 0.7] : [0.6, 0.7, 0.8],
    tpPct: options.quick ? [0.3, 0.5] : [0.3, 0.5, 0.8],
    slPct: options.quick ? [0.35, 0.5] : [0.25, 0.35, 0.5],
    maxHoldBars: options.quick ? [3,5] : [3,5,8],
    sessions: options.quick ? 100 : 150
  };

  const results = {};

  for (const pair of pairs) {
    let best = null;
    for (const minConfidence of grid.minConfidence) {
      for (const tpPct of grid.tpPct) {
        for (const slPct of grid.slPct) {
          for (const maxHoldBars of grid.maxHoldBars) {
            const params = { minConfidence, tpPct, slPct, maxHoldBars, sessions: grid.sessions };
            const res = backtestPairWithParams(pair, params);
            // Primary objective: maximize winRate, secondary: profit
            const score = res.winRate * 1000 + res.totalProfit;
            if (!best || score > best.score) {
              best = { score, params, res };
            }
          }
        }
      }
    }

    results[pair] = { bestParams: best.params, metrics: best.res };
    console.log(`TUNED ${pair} -> WR:${best.res.winRate.toFixed(1)}% Trades:${best.res.trades} Profit:${best.res.totalProfit.toFixed(2)} Params:${JSON.stringify(best.params)}`);
    // save incremental to avoid losing progress
    fs.writeFileSync(path.join(__dirname, '../config/per-pair-tuning.json'), JSON.stringify(results, null, 2), 'utf8');
  }

  return results;
}

function summarizeResults(results) {
  const lines = ['# ULTRA v6 TUNING RESULTS\n'];
  Object.entries(results).forEach(([pair, v]) => {
    const m = v.metrics;
    lines.push(`- ${pair}: WR=${m.winRate.toFixed(1)}% Trades=${m.trades} Profit=${m.totalProfit.toFixed(2)} Params=${JSON.stringify(v.bestParams)}`);
  });
  fs.writeFileSync(path.join(__dirname, '../docs/ultra-v6-tuning-results.md'), lines.join('\n'), 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const testAll = args.includes('--test-all');

  console.log('🔧 ULTRA v6 TUNER - starting', quick ? '(quick mode)' : '');
  const results = await runTuning({ quick });
  summarizeResults(results);

  if (testAll) {
    console.log('\n🧪 Running full v6 test with tuned parameters (summary only)…');
    // Lightweight summary: run backtestPairWithParams once per pair with best params
    const finalSummary = { totalTrades: 0, totalWins: 0, totalLoss: 0, totalProfit: 0, pairs: {} };
    Object.entries(results).forEach(([pair, v]) => {
      const m = backtestPairWithParams(pair, Object.assign({ sessions: 150 }, v.bestParams));
      finalSummary.pairs[pair] = m;
      finalSummary.totalTrades += m.trades;
      finalSummary.totalWins += m.wins;
      finalSummary.totalLoss += m.losses;
      finalSummary.totalProfit += m.totalProfit;
    });
    const globalWR = finalSummary.totalTrades > 0 ? (finalSummary.totalWins / finalSummary.totalTrades) * 100 : 0;
    console.log(`\n🔔 Tuned Full Test -> Trades:${finalSummary.totalTrades} Wins:${finalSummary.totalWins} WR:${globalWR.toFixed(2)}% Profit:${finalSummary.totalProfit.toFixed(2)}`);
    fs.writeFileSync(path.join(__dirname, '../logs/ultra-v6-tuned-summary-' + Date.now() + '.json'), JSON.stringify(finalSummary, null, 2), 'utf8');
  }

  console.log('✅ TUNING COMPLETE. Results written to config/per-pair-tuning.json and docs/ultra-v6-tuning-results.md');
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
