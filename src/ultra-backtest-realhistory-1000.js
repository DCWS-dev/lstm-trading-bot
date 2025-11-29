/**
 * ultra-backtest-realhistory-1000.js
 *
 * Use real historical price logs (logs/<PAIR>.csv) to build minute OHLCV candles.
 * Replay the real history (sequential passes) until each pair reaches 1000 trades.
 * WARNING: This can take a long time. Use --pairs=LIST or --top to limit scope.
 */

const fs = require('fs');
const path = require('path');
const UltraLSTMv3 = require('./ultra-lstm-v3');

function loadPriceSeries(pair) {
  const csvPath = path.join(__dirname, `../logs/${pair}.csv`);
  if (!fs.existsSync(csvPath)) return null;
  const raw = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  // Expect header timestamp,price
  const lines = raw.slice(1);
  return lines.map(l => {
    const [ts, price] = l.split(',');
    return { time: new Date(ts), price: parseFloat(price) };
  });
}

function buildMinuteCandles(priceSeries) {
  const map = new Map();
  for (const p of priceSeries) {
    // key by minute
    const key = p.time.toISOString().slice(0,16); // YYYY-MM-DDTHH:MM
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p.price);
  }

  const candles = [];
  for (const [k, arr] of map.entries()) {
    const open = arr[0];
    const close = arr[arr.length - 1];
    const high = Math.max(...arr);
    const low = Math.min(...arr);
    const volume = arr.length; // proxy
    const time = new Date(k + ':00Z').getTime();
    candles.push({ time, open, high, low, close, volume });
  }
  // sort by time
  candles.sort((a,b) => a.time - b.time);
  return candles;
}

// If minute candles are too few (short history), fallback to per-sample pseudo-candles
function buildFallbackSampleCandles(priceSeries) {
  const candles = [];
  for (const p of priceSeries) {
    const t = p.time.getTime();
    candles.push({ time: t, open: p.price, high: p.price, low: p.price, close: p.price, volume: 1 });
  }
  return candles;
}

function runPairUntilTrades(pair, candles, tunedParams, targetTrades = 1000, maxPasses = 200) {
  const params = Object.assign({ minConfidence: 0.7, tpPct: 0.5, slPct: 0.35, maxHoldBars: 5 }, tunedParams || {});
  let trades = 0, wins = 0, losses = 0, totalProfit = 0, totalWinAmt = 0, totalLossAmt = 0;
  const portfolio = { cash: 10000, positions: {} };

  let pass = 0;
  while (trades < targetTrades && pass < maxPasses) {
    for (let i = 30; i < candles.length; i++) {
      const historical = candles.slice(Math.max(0, i - 60), i + 1);
      const signal = UltraLSTMv3.generateSignal(historical);
      const currentPrice = candles[i].close;

      // Exit
      if (portfolio.positions[pair]) {
        const pos = portfolio.positions[pair];
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const holdBars = i - pos.entryIndex;
        let shouldClose = false;
        if (profitPercent >= params.tpPct) shouldClose = true;
        else if (profitPercent <= -params.slPct) shouldClose = true;
        else if (holdBars > params.maxHoldBars) shouldClose = true;

        if (shouldClose) {
          const profit = (currentPrice - pos.entryPrice) * pos.quantity;
          trades++;
          if (profit > 0) { wins++; totalWinAmt += profit; } else { losses++; totalLossAmt += Math.abs(profit); }
          totalProfit += profit;
          portfolio.cash += currentPrice * pos.quantity;
          delete portfolio.positions[pair];
        }
      }

      // Entry
      if (!portfolio.positions[pair]) {
        if ((signal.action === 'BUY' || signal.action === 'SELL') && signal.confidence >= params.minConfidence) {
          const riskPercent = Math.min(0.02, signal.confidence * 0.02);
          const positionValue = portfolio.cash * riskPercent;
          const quantity = positionValue / currentPrice;
          if (quantity * currentPrice < portfolio.cash * 0.95) {
            portfolio.positions[pair] = { entryPrice: currentPrice, quantity, entryIndex: i, action: signal.action };
            portfolio.cash -= quantity * currentPrice;
          }
        }
      }

      if (trades >= targetTrades) break;
    }
    pass++;
    // if dataset small, continue next pass (replay real history sequentially)
  }

  const winRate = trades > 0 ? (wins / trades) * 100 : 0;
  const avgWin = wins > 0 ? totalWinAmt / wins : 0;
  const avgLoss = losses > 0 ? totalLossAmt / losses : 0;
  return { pair, trades, wins, losses, winRate, totalProfit, avgWin, avgLoss, passes: pass };
}

async function main() {
  const args = process.argv.slice(2);
  const pairsArg = args.find(a => a.startsWith('--pairs='));
  const topOnly = args.includes('--top');
  const allPairs = [ 'BTCUSDT','ETHUSDT','BNBUSDT','XRPUSDT','ADAUSDT','SOLUSDT','DOGEUSDT','DOTUSDT','LTCUSDT','LINKUSDT','MATICUSDT','AVAXUSDT','FTMUSDT','ATOMUSDT','UNIUSDT','ARBUSDT','OPUSDT','APEUSDT','LUNCUSDT','SHIBUSDT','FLOKIUSDT','PEPEUSDT','SUIUSDT','TONUSDT','NEARUSDT','ALGOUSDT','FILUSDT','THETAUSDT','CHZUSDT','OPTIMUSDT' ];

  let targetPairs = allPairs;
  if (pairsArg) {
    targetPairs = pairsArg.split('=')[1].split(',').map(s => s.trim());
  } else if (topOnly) {
    // default top 5 based on previous runs
    targetPairs = [ 'LTCUSDT','LINKUSDT','FTMUSDT','TONUSDT','DOGEUSDT' ];
  }

  // load tuning
  let tuning = {};
  try { tuning = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/per-pair-tuning.json'), 'utf8')); } catch (e) { tuning = {}; }

  const results = {};
  for (const pair of targetPairs) {
    console.log(`\n🔁 Starting pair ${pair} - building candles from real history`);
    const series = loadPriceSeries(pair);
    if (!series || series.length < 10) { console.warn(`  ✖ Not enough data for ${pair} (${series ? series.length : 0} samples). Skipping.`); continue; }
    let candles = buildMinuteCandles(series);
    if (!candles || candles.length < 30) {
      // fallback to per-sample pseudo-candles
      candles = buildFallbackSampleCandles(series);
      console.log(`  ▶ Minute candles too few, using per-sample pseudo-candles: ${candles.length}`);
    } else {
      console.log(`  ▶ Candles: ${candles.length}`);
    }
    const tuned = tuning[pair] && tuning[pair].bestParams ? tuning[pair].bestParams : null;
    const res = runPairUntilTrades(pair, candles, tuned, 1000, 500);
    console.log(`  ✅ Done ${pair}: Trades=${res.trades} WR=${res.winRate.toFixed(2)}% Passes=${res.passes} Profit=${res.totalProfit.toFixed(2)}`);
    results[pair] = res;
    fs.writeFileSync(path.join(__dirname, `../logs/ultra-v6-realhistory-${pair}-${Date.now()}.json`), JSON.stringify(res, null, 2), 'utf8');
  }

  // Save summary
  fs.writeFileSync(path.join(__dirname, '../docs/ultra-v6-1000trades-results.md'), '# ULTRA v6 1000-trades real-history results\n\n' + JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(path.join(__dirname, '../logs/ultra-v6-realhistory-summary-' + Date.now() + '.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\n🎯 All done. Results saved to docs/ultra-v6-1000trades-results.md and logs/*.json');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
