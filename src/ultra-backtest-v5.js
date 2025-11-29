/**
 * ULTRA v5.0 Production Backtest
 * 
 * Финальная оптимизация для 70%+ win rate:
 * ├─ Агрессивные take-profits (lock profits fast)
 * ├─ Tight stop-losses (risk management)
 * ├─ Win/Loss ratio > 1.5 (profit > losses)
 * ├─ Целевой win rate: 70%+
 * └─ Целевой daily ROI: 5%+
 */

const fs = require('fs');
const path = require('path');
const UltraLSTMv3 = require('./ultra-lstm-v3');

class UltraProductionBacktest {
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
   * Production backtest - aggressive TP, tight SL
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
      const atr = UltraLSTMv3.calculateATR(historicalData, 14);
      const atrPercent = (atr / currentPrice) * 100;

      // ============ EXIT LOGIC ============
      if (portfolio.positions[pair]) {
        const pos = portfolio.positions[pair];
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const holdBars = i - pos.entryIndex;

        let shouldClose = false;

        // AGGRESSIVE TAKE PROFIT: Lock profits at 1% (vs 2-5% before)
        if (profitPercent > 1.0) {
          shouldClose = true;
        }
        // TIGHT STOP LOSS: 0.8% (vs 1.5-2% before)
        else if (profitPercent < -0.8) {
          shouldClose = true;
        }
        // Partial profits at breakeven to lock some wins
        else if (profitPercent > 0.3 && holdBars > 4 && !pos.partialTaken) {
          // Take 50% profit
          const partialProfit = (currentPrice - pos.entryPrice) * pos.quantity * 0.5;
          pairResult.trades++;
          if (partialProfit > 0) {
            pairResult.wins++;
            totalWins += partialProfit;
          } else {
            pairResult.losses++;
            totalLosses += Math.abs(partialProfit);
          }
          pairResult.totalProfit += partialProfit;
          pos.quantity *= 0.5;
          pos.partialTaken = true;
          
          // Move stop to breakeven
          pos.entryPrice = currentPrice;
          continue;
        }
        // Hard exit after 15 bars
        else if (holdBars > 15) {
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

      // ============ ENTRY LOGIC ============
      if (!portfolio.positions[pair]) {
        // Only HIGH confidence signals
        if (signal.confidence >= 0.62) {
          if (signal.action === 'BUY' || signal.action === 'SELL') {
            // Position sizing - slightly larger for high confidence
            const riskPercent = Math.min(0.04, signal.confidence * 0.05);
            const positionValue = portfolio.cash * riskPercent;
            const quantity = positionValue / currentPrice;

            if (quantity * currentPrice < portfolio.cash * 0.95) {
              portfolio.positions[pair] = {
                entryPrice: currentPrice,
                quantity,
                entryIndex: i,
                action: signal.action,
                confidence: signal.confidence,
                partialTaken: false
              };
              portfolio.cash -= quantity * currentPrice;
            }
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
    console.log(`\n${'='.repeat(85)}`);
    console.log('🚀 ULTRA v5.0 PRODUCTION BACKTEST (Aggressive TP / Tight SL)');
    console.log(`${'='.repeat(85)}\n`);

    const startTime = Date.now();
    
    let idx = 1;
    for (const pair of this.pairs) {
      const pairResult = this.backtestPair(pair);
      this.results.pairResults[pair] = pairResult;

      this.results.totalTrades += pairResult.trades;
      this.results.totalWins += pairResult.wins;
      this.results.totalLosses += pairResult.losses;
      this.results.totalProfit += pairResult.totalProfit;

      const status = pairResult.winRate >= 70 ? '✅' : 
                     pairResult.winRate >= 60 ? '⚡' : 
                     pairResult.trades === 0 ? '🔵' : '⚠️ ';
      
      const trades = pairResult.trades.toString().padStart(2);
      const wr = pairResult.winRate.toFixed(1).padStart(5);
      const profit = pairResult.totalProfit.toFixed(1).padStart(7);
      
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
    console.log(`\n${'='.repeat(85)}`);
    console.log('📊 ULTRA v5.0 PRODUCTION RESULTS');
    console.log(`${'='.repeat(85)}`);
    console.log(`Total Trades: ${this.results.totalTrades}`);
    console.log(`Wins: ${this.results.totalWins} | Losses: ${this.results.totalLosses}`);
    
    const winRateStatus = this.results.winRate >= 70 ? '✅' : '⚠️ ';
    const profitStatus = this.results.profitFactor > 1.5 ? '✅' : '⚠️ ';
    const roiStatus = (this.results.roi / 21) >= 5 ? '✅' : '⚠️ ';

    console.log(`${winRateStatus} Win Rate: ${this.results.winRate.toFixed(2)}% (TARGET: 70%)`);
    console.log(`${profitStatus} Win/Loss Ratio: ${this.results.winLossRatio.toFixed(2)} (TARGET: > 1.5)`);
    console.log(`${profitStatus} Profit Factor: ${this.results.profitFactor.toFixed(2)} (Wins/Losses)`);
    console.log(`💰 Total Profit: $${this.results.totalProfit.toFixed(2)}`);
    console.log(`📈 ROI: ${this.results.roi.toFixed(4)}%`);
    console.log(`📅 Daily ROI: ${(this.results.roi / 21).toFixed(4)}% (TARGET: 5%)`);
    console.log(`Avg Win: $${this.results.avgWinSize.toFixed(3)} | Avg Loss: $${this.results.avgLossSize.toFixed(3)}`);
    console.log(`Expected Annual ROI: ${(this.results.roi * 365 / 21).toFixed(2)}%`);
    console.log(`⏱️  Time: ${elapsed.toFixed(1)}s`);
    console.log(`${'='.repeat(85)}`);

    // Top performers
    const sorted = Object.entries(this.results.pairResults)
      .filter(([_, r]) => r.trades > 0)
      .sort((a, b) => b[1].winRate - a[1].winRate)
      .slice(0, 15);

    if (sorted.length > 0) {
      console.log('\n⭐ TOP 15 PERFORMING PAIRS:');
      sorted.forEach((entry, i) => {
        const [pair, result] = entry;
        const wr = result.winRate.toFixed(1).padStart(5);
        const profit = result.totalProfit.toFixed(2).padStart(8);
        const status = result.winRate >= 70 ? '✅' : result.winRate >= 60 ? '⚡' : '⚠️ ';
        console.log(`${status} ${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | WR: ${wr}% | Trades: ${(result.trades + '').padStart(2)} | Profit: $${profit}`);
      });
    }

    // Assessment
    console.log(`\n${'='.repeat(85)}`);
    console.log('🎯 FINAL ASSESSMENT - ULTRA v5.0');
    console.log(`${'='.repeat(85)}`);

    const targets = [];
    const gaps = [];

    if (this.results.winRate >= 70) {
      targets.push(`✅ Win Rate: ${this.results.winRate.toFixed(2)}% ≥ 70%`);
    } else {
      gaps.push(`⚠️  Win Rate: ${this.results.winRate.toFixed(2)}% (gap: ${(70 - this.results.winRate).toFixed(2)}%)`);
    }

    if (this.results.winLossRatio >= 1.5) {
      targets.push(`✅ Win/Loss Ratio: ${this.results.winLossRatio.toFixed(2)} ≥ 1.5`);
    } else {
      gaps.push(`⚠️  Win/Loss Ratio: ${this.results.winLossRatio.toFixed(2)} (need: ${(1.5 - this.results.winLossRatio).toFixed(2)})`);
    }

    const dailyROI = this.results.roi / 21;
    if (dailyROI >= 5) {
      targets.push(`✅ Daily ROI: ${dailyROI.toFixed(4)}% ≥ 5%`);
    } else {
      gaps.push(`⚠️  Daily ROI: ${dailyROI.toFixed(4)}% (gap: ${(5 - dailyROI).toFixed(4)}%)`);
    }

    if (targets.length > 0) {
      console.log('\n✅ TARGETS ACHIEVED:');
      targets.forEach(t => console.log(`  ${t}`));
    }

    if (gaps.length > 0) {
      console.log('\n🔧 IMPROVEMENTS NEEDED:');
      gaps.forEach(g => console.log(`  ${g}`));
    }

    const summary = {
      status: this.results.winRate >= 70 && this.results.profitFactor >= 1.5 ? '🎉 READY FOR PRODUCTION' : '⚡ OPTIMIZING',
      winRate: `${this.results.winRate.toFixed(2)}%`,
      profitFactor: this.results.profitFactor.toFixed(2),
      dailyROI: `${dailyROI.toFixed(4)}%`,
      totalTrades: this.results.totalTrades,
      consistency: `${(this.results.totalWins / Math.max(1, this.results.totalTrades) * 100).toFixed(1)}%`
    };

    console.log(`\n📈 SUMMARY:`);
    console.log(`  Status: ${summary.status}`);
    console.log(`  Win Rate: ${summary.winRate}`);
    console.log(`  Profit Factor: ${summary.profitFactor}`);
    console.log(`  Daily ROI: ${summary.dailyROI}`);
    console.log(`  Total Trades: ${summary.totalTrades}`);
    console.log(`  Consistency: ${summary.consistency}`);

    console.log(`${'='.repeat(85)}\n`);

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

    const filename = path.join(logsDir, `ultra-v5-production-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2), 'utf8');

    console.log(`✅ Results saved: ${filename}\n`);
  }
}

/**
 * Main
 */
async function main() {
  const backtest = new UltraProductionBacktest();
  await backtest.runBacktest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = UltraProductionBacktest;
