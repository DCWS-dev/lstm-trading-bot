/**
 * ULTRA v6.0 CONSERVATIVE BACKTEST
 * 
 * Радикальный пересмотр:
 * ├─ Entry только на очень сильных сигналах (0.70+)
 * ├─ Tiny TP: 0.5% (lock profit very fast)
 * ├─ Micro SL: 0.35% (tight stops)
 * ├─ Win/Loss Ratio > 3:1 (больше выигрышей чем убытков)
 * └─ Целевой win rate: 75%+
 */

const fs = require('fs');
const path = require('path');
const UltraLSTMv3 = require('./ultra-lstm-v3');

class UltraConservativeBacktest {
  constructor() {
    this.pairs = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
      'SOLUSDT', 'DOGEUSDT', 'DOTUSDT', 'LTCUSDT', 'LINKUSDT',
      'MATICUSDT', 'AVAXUSDT', 'FTMUSDT', 'ATOMUSDT', 'UNIUSDT',
      'ARBUSDT', 'OPUSDT', 'APEUSDT', 'LUNCUSDT', 'SHIBUSDT',
      'FLOKIUSDT', 'PEPEUSDT', 'SUIUSDT', 'TONUSDT', 'NEARUSDT',
      'ALGOUSDT', 'FILUSDT', 'THETAUSDT', 'CHZUSDT', 'OPTIMUSDT'
    ];

    this.results = {
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      winRate: 0,
      totalProfit: 0,
      roi: 0,
      avgWinSize: 0,
      avgLossSize: 0,
      winLossRatio: 0,
      profitFactor: 0,
      pairResults: {}
    };
    // Load per-pair tuning if available
    try {
      const tuningPath = path.join(__dirname, '../config/per-pair-tuning.json');
      if (fs.existsSync(tuningPath)) {
        this.tuning = JSON.parse(fs.readFileSync(tuningPath, 'utf8'));
      } else {
        this.tuning = {};
      }
    } catch (e) {
      console.warn('Could not load per-pair tuning:', e.message);
      this.tuning = {};
    }
  }

  /**
   * Generate realistic market data
   */
  generateMarketData(pair, sessions = 150) {
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

  /**
   * Conservative backtest
   */
  backtestPair(pair) {
    const ohlcData = this.generateMarketData(pair, 150);
    const pairResult = {
      pair,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      avgWin: 0,
      avgLoss: 0
    };
    
    let portfolio = {
      cash: 10000,
      positions: {}
    };
    
    let totalWins = 0;
    let totalLosses = 0;

    // Trading loop
    for (let i = 30; i < ohlcData.length; i++) {
      const historicalData = ohlcData.slice(Math.max(0, i - 60), i + 1);
      const signal = UltraLSTMv3.generateSignal(historicalData);
      const currentPrice = ohlcData[i].close;

      // Determine tuned params for this pair (if any)
      const tuned = (this.tuning && this.tuning[pair] && this.tuning[pair].bestParams) ? this.tuning[pair].bestParams : null;
      const tpPct = tuned && tuned.tpPct !== undefined ? tuned.tpPct : 0.5; // percent
      const slPct = tuned && tuned.slPct !== undefined ? tuned.slPct : 0.35; // percent
      const maxHoldBars = tuned && tuned.maxHoldBars !== undefined ? tuned.maxHoldBars : 5;

      // ============ EXIT LOGIC ============
      if (portfolio.positions[pair]) {
        const pos = portfolio.positions[pair];
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const holdBars = i - pos.entryIndex;

        let shouldClose = false;
        // Take-profit per tuned param
        if (profitPercent >= tpPct) {
          shouldClose = true;
        }
        // Stop-loss per tuned param
        else if (profitPercent <= -slPct) {
          shouldClose = true;
        }
        // Hard exit after tuned maxHoldBars
        else if (holdBars > maxHoldBars) {
          shouldClose = true;
        }

        if (shouldClose) {
          const profit = (currentPrice - pos.entryPrice) * pos.quantity;
          pairResult.trades++;
          
          if (profit > 0) {
            pairResult.wins++;
            totalWins += profit;
          } else {
            pairResult.losses++;
            totalLosses += Math.abs(profit);
          }

          pairResult.totalProfit += profit;
          portfolio.cash += currentPrice * pos.quantity;
          delete portfolio.positions[pair];
        }
      }

      // ============ ENTRY LOGIC - possibly tuned per-pair ============
      if (!portfolio.positions[pair]) {
        const minConfidence = tuned && tuned.minConfidence !== undefined ? tuned.minConfidence : 0.70;
        // ONLY enter if signal meets tuned confidence threshold
        if (signal.confidence >= minConfidence && (signal.action === 'BUY' || signal.action === 'SELL')) {
          // Position sizing - conservative
          const riskPercent = signal.confidence * 0.02; // 0-2% risk
          const positionValue = portfolio.cash * riskPercent;
          const quantity = positionValue / currentPrice;

          if (quantity * currentPrice < portfolio.cash * 0.95) {
            portfolio.positions[pair] = {
              entryPrice: currentPrice,
              quantity,
              entryIndex: i,
              action: signal.action,
              confidence: signal.confidence
            };
            portfolio.cash -= quantity * currentPrice;
          }
        }
      }
    }

    // Close open positions at end
    if (portfolio.positions[pair]) {
      const pos = portfolio.positions[pair];
      const finalPrice = ohlcData[ohlcData.length - 1].close;
      const profit = (finalPrice - pos.entryPrice) * pos.quantity;

      pairResult.trades++;
      if (profit > 0) {
        pairResult.wins++;
        totalWins += profit;
      } else {
        pairResult.losses++;
        totalLosses += Math.abs(profit);
      }
      pairResult.totalProfit += profit;
    }

    // Calculate metrics
    if (pairResult.trades > 0) {
      pairResult.winRate = (pairResult.wins / pairResult.trades) * 100;
      pairResult.avgWin = pairResult.wins > 0 ? totalWins / pairResult.wins : 0;
      pairResult.avgLoss = pairResult.losses > 0 ? totalLosses / pairResult.losses : 0;
    }

    return pairResult;
  }

  /**
   * Run full backtest
   */
  async runBacktest() {
    console.log(`\n${'='.repeat(90)}`);
    console.log('🚀 ULTRA v6.0 CONSERVATIVE BACKTEST (Tiny TP 0.5% / Micro SL 0.35%)');
    console.log(`${'='.repeat(90)}\n`);

    const startTime = Date.now();
    
    let idx = 1;
    for (const pair of this.pairs) {
      const pairResult = this.backtestPair(pair);
      this.results.pairResults[pair] = pairResult;

      this.results.totalTrades += pairResult.trades;
      this.results.totalWins += pairResult.wins;
      this.results.totalLosses += pairResult.losses;
      this.results.totalProfit += pairResult.totalProfit;

      const status = pairResult.winRate >= 75 ? '✅' : 
                     pairResult.winRate >= 65 ? '⚡' : 
                     pairResult.trades === 0 ? '🔵' : '⚠️ ';
      
      const trades = pairResult.trades.toString().padStart(2);
      const wr = pairResult.winRate.toFixed(1).padStart(5);
      const profit = pairResult.totalProfit.toFixed(2).padStart(8);
      
      console.log(`${status} [${(idx++).toString().padStart(2)}/30] ${pair.padEnd(10)} | Trades: ${trades} | WR: ${wr}% | Profit: $${profit}`);
    }

    // Calculate overall metrics
    if (this.results.totalTrades > 0) {
      this.results.winRate = (this.results.totalWins / this.results.totalTrades) * 100;
    }

    const initialCapital = 10000 * this.pairs.length;
    this.results.roi = (this.results.totalProfit / initialCapital) * 100;

    // Calculate profit factor and win/loss ratio
    let totalWinAmount = 0;
    let totalLossAmount = 0;
    Object.values(this.results.pairResults).forEach(p => {
      if (p.trades > 0) {
        totalWinAmount += p.avgWin * p.wins;
        totalLossAmount += Math.abs(p.avgLoss) * p.losses;
      }
    });
    
    this.results.profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount;
    this.results.avgWinSize = this.results.totalWins > 0 ? totalWinAmount / this.results.totalWins : 0;
    this.results.avgLossSize = this.results.totalLosses > 0 ? totalLossAmount / this.results.totalLosses : 0;
    this.results.winLossRatio = this.results.avgLossSize > 0 ? this.results.avgWinSize / this.results.avgLossSize : 0;

    const elapsed = (Date.now() - startTime) / 1000;

    // Print final results
    console.log(`\n${'='.repeat(90)}`);
    console.log('📊 ULTRA v6.0 CONSERVATIVE RESULTS');
    console.log(`${'='.repeat(90)}`);
    console.log(`Total Trades: ${this.results.totalTrades}`);
    console.log(`Wins: ${this.results.totalWins} | Losses: ${this.results.totalLosses}`);
    
    const winRateStatus = this.results.winRate >= 75 ? '✅' : '⚠️ ';
    const profitStatus = this.results.profitFactor > 2.0 ? '✅' : '⚠️ ';
    const roiStatus = (this.results.roi / 21) >= 5 ? '✅' : '⚠️ ';

    console.log(`${winRateStatus} Win Rate: ${this.results.winRate.toFixed(2)}% (TARGET: 75%)`);
    console.log(`${profitStatus} Win/Loss Ratio: ${this.results.winLossRatio.toFixed(2)} (TARGET: > 2.0)`);
    console.log(`${profitStatus} Profit Factor: ${this.results.profitFactor.toFixed(2)}`);
    console.log(`💰 Total Profit: $${this.results.totalProfit.toFixed(2)}`);
    console.log(`📈 ROI: ${this.results.roi.toFixed(4)}%`);
    console.log(`📅 Daily ROI: ${(this.results.roi / 21).toFixed(4)}% (TARGET: 5%)`);
    console.log(`Avg Win: $${this.results.avgWinSize.toFixed(4)} | Avg Loss: $${this.results.avgLossSize.toFixed(4)}`);
    console.log(`Expected Annual ROI: ${(this.results.roi * 365 / 21).toFixed(2)}%`);
    console.log(`⏱️  Time: ${elapsed.toFixed(1)}s`);
    console.log(`${'='.repeat(90)}`);

    // Top performers
    const sorted = Object.entries(this.results.pairResults)
      .filter(([_, r]) => r.trades > 0)
      .sort((a, b) => b[1].winRate - a[1].winRate);

    if (sorted.length > 0) {
      console.log('\n⭐ PAIR PERFORMANCE SUMMARY:');
      const winners = sorted.filter(([_, r]) => r.winRate >= 75);
      const average = sorted.filter(([_, r]) => r.winRate >= 60 && r.winRate < 75);
      const losers = sorted.filter(([_, r]) => r.winRate < 60);

      if (winners.length > 0) {
        console.log(`\n✅ WINNERS (${winners.length} pairs with WR >= 75%)`);
        winners.slice(0, 10).forEach((entry, i) => {
          const [pair, result] = entry;
          const wr = result.winRate.toFixed(1).padStart(5);
          const profit = result.totalProfit.toFixed(2).padStart(8);
          console.log(`   ${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | WR: ${wr}% | Trades: ${(result.trades + '').padStart(2)} | Profit: $${profit}`);
        });
      }

      if (average.length > 0) {
        console.log(`\n⚡ AVERAGE (${average.length} pairs with 60% <= WR < 75%)`);
        average.slice(0, 10).forEach((entry, i) => {
          const [pair, result] = entry;
          const wr = result.winRate.toFixed(1).padStart(5);
          const profit = result.totalProfit.toFixed(2).padStart(8);
          console.log(`   ${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | WR: ${wr}% | Trades: ${(result.trades + '').padStart(2)} | Profit: $${profit}`);
        });
      }

      if (losers.length > 0) {
        console.log(`\n⚠️  LOSERS (${losers.length} pairs with WR < 60%)`);
        losers.slice(0, 5).forEach((entry, i) => {
          const [pair, result] = entry;
          const wr = result.winRate.toFixed(1).padStart(5);
          const profit = result.totalProfit.toFixed(2).padStart(8);
          console.log(`   ${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | WR: ${wr}% | Trades: ${(result.trades + '').padStart(2)} | Profit: $${profit}`);
        });
      }
    }

    // Assessment
    console.log(`\n${'='.repeat(90)}`);
    console.log('🎯 ASSESSMENT - ULTRA v6.0 CONSERVATIVE');
    console.log(`${'='.repeat(90)}`);

    const achieved = [];
    const gaps = [];

    if (this.results.winRate >= 75) {
      achieved.push(`✅ Win Rate: ${this.results.winRate.toFixed(2)}% ≥ 75%`);
    } else {
      gaps.push(`⚠️  Win Rate: ${this.results.winRate.toFixed(2)}% (gap: ${(75 - this.results.winRate).toFixed(2)}%)`);
    }

    if (this.results.winLossRatio >= 2.0) {
      achieved.push(`✅ Win/Loss Ratio: ${this.results.winLossRatio.toFixed(2)} ≥ 2.0`);
    } else {
      gaps.push(`⚠️  Win/Loss Ratio: ${this.results.winLossRatio.toFixed(2)} (need: ${(2.0 - this.results.winLossRatio).toFixed(2)})`);
    }

    const dailyROI = this.results.roi / 21;
    if (dailyROI >= 1.0) {
      achieved.push(`✅ Daily ROI: ${dailyROI.toFixed(4)}% ≥ 1%`);
    } else {
      gaps.push(`⚠️  Daily ROI: ${dailyROI.toFixed(4)}%`);
    }

    if (achieved.length > 0) {
      console.log('\n✅ TARGETS ACHIEVED:');
      achieved.forEach(t => console.log(`  ${t}`));
    }

    if (gaps.length > 0) {
      console.log('\n🔧 STATUS:');
      gaps.forEach(g => console.log(`  ${g}`));
    }

    const summary = {
      tradingStyle: 'Conservative Scalping',
      entryConfidence: 'Very High (70%+)',
      takeProfitTarget: '0.5%',
      stopLossTarget: '0.35%',
      riskRewardRatio: `1:${(0.5/0.35).toFixed(2)}`,
      status: this.results.winRate >= 75 && this.results.profitFactor >= 2.0 ? '🎉 EXCELLENT' : this.results.winRate >= 70 ? '✅ GOOD' : '⚡ TESTING'
    };

    console.log(`\n📈 TRADING PROFILE:`);
    console.log(`  Style: ${summary.tradingStyle}`);
    console.log(`  Entry Confidence: ${summary.entryConfidence}`);
    console.log(`  Take Profit: ${summary.takeProfitTarget}`);
    console.log(`  Stop Loss: ${summary.stopLossTarget}`);
    console.log(`  Risk/Reward Ratio: ${summary.riskRewardRatio}`);
    console.log(`  Status: ${summary.status}`);

    console.log(`${'='.repeat(90)}\n`);

    this.saveResults();
  }

  /**
   * Save results
   */
  saveResults() {
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const filename = path.join(logsDir, `ultra-v6-conservative-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2), 'utf8');

    console.log(`✅ Results saved: ${filename}\n`);
  }
}

/**
 * Main
 */
async function main() {
  const backtest = new UltraConservativeBacktest();
  await backtest.runBacktest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = UltraConservativeBacktest;
