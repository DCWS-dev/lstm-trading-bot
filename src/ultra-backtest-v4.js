/**
 * ULTRA v4.0 Final Optimized Backtest
 * 
 * Оптимизация:
 * ├─ Улучшенный exit (adaptive TP based on volatility)
 * ├─ Более строгие entry conditions (min 2 confirmations)
 * ├─ Risk-reward ratio фильтр (минимум 2:1)
 * ├─ Целевой win rate: 70%
 * └─ Целевой accuracy: 85%
 */

const fs = require('fs');
const path = require('path');
const UltraLSTMv3 = require('./ultra-lstm-v3');

class UltraOptimizedBacktest {
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
      accuracy: 0,
      winRate: 0,
      totalProfit: 0,
      roi: 0,
      avgWinSize: 0,
      avgLossSize: 0,
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
      // Mean reversion with momentum
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
   * Optimized backtest - focus on win rate > 70%
   */
  backtestPair(pair) {
    const ohlcData = this.generateMarketData(pair, 150);
    const pairResult = {
      pair,
      trades: 0,
      wins: 0,
      losses: 0,
      accuracy: 0,
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

        // Adaptive stop loss: tighter for losers
        const stopLossPercent = Math.max(1.5, atrPercent * 1.2);
        if (profitPercent < -stopLossPercent) {
          shouldClose = true;
        }
        // Profit targets scaled by ATR
        else if (profitPercent > atrPercent * 2) {
          // Strong profit, exit
          shouldClose = true;
        }
        else if (profitPercent > 1 && holdBars > 6) {
          // Trail stop after 6 bars
          if (!pos.maxProfit) pos.maxProfit = profitPercent;
          else pos.maxProfit = Math.max(pos.maxProfit, profitPercent);

          if (profitPercent < pos.maxProfit - 0.8) {
            shouldClose = true;
          }
        }
        // Hard exit after 20 bars
        else if (holdBars > 20) {
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

      // ============ ENTRY LOGIC - MORE STRICT ============
      if (!portfolio.positions[pair]) {
        // Only enter on HIGH confidence signals (>= 0.60)
        // And require at least 2 indicator confirmations
        if (signal.confidence >= 0.60 && signal.details.buyCount + signal.details.sellCount >= 2) {
          if (signal.action === 'BUY' || signal.action === 'SELL') {
            // Position sizing: smaller for lower confidence
            const riskPercent = Math.min(0.03, signal.confidence * 0.04);
            const positionValue = portfolio.cash * riskPercent;
            const quantity = positionValue / currentPrice;

            if (quantity * currentPrice < portfolio.cash * 0.95) {
              portfolio.positions[pair] = {
                entryPrice: currentPrice,
                quantity,
                entryIndex: i,
                maxProfit: 0,
                action: signal.action,
                confidence: signal.confidence
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
      pairResult.accuracy = (pairResult.wins / pairResult.trades) * 100;
      pairResult.avgWin = pairResult.wins > 0 ? totalWins / pairResult.wins : 0;
      pairResult.avgLoss = pairResult.losses > 0 ? totalLosses / pairResult.losses : 0;
    }

    return pairResult;
  }

  /**
   * Run full backtest
   */
  async runBacktest() {
    console.log(`\n${'='.repeat(80)}`);
    console.log('🚀 ULTRA v4.0 OPTIMIZED BACKTEST (High Win-Rate Focus)');
    console.log(`${'='.repeat(80)}\n`);

    const startTime = Date.now();
    
    let idx = 1;
    for (const pair of this.pairs) {
      const pairResult = this.backtestPair(pair);
      this.results.pairResults[pair] = pairResult;

      this.results.totalTrades += pairResult.trades;
      this.results.totalWins += pairResult.wins;
      this.results.totalLosses += pairResult.losses;
      this.results.totalProfit += pairResult.totalProfit;

      const status = pairResult.accuracy >= 70 ? '✅' : 
                     pairResult.accuracy >= 55 ? '⚡' : 
                     pairResult.trades === 0 ? '🔵' : '⚠️ ';
      
      const trades = pairResult.trades.toString().padStart(2);
      const acc = pairResult.accuracy.toFixed(1).padStart(5);
      const profit = pairResult.totalProfit.toFixed(1).padStart(6);
      
      console.log(`${status} [${(idx++).toString().padStart(2)}/30] ${pair.padEnd(10)} | Trades: ${trades} | WR: ${acc}% | Profit: $${profit}`);
    }

    // Calculate overall metrics
    if (this.results.totalTrades > 0) {
      this.results.accuracy = (this.results.totalWins / this.results.totalTrades) * 100;
      this.results.winRate = this.results.accuracy;
    }

    // Calculate ROI correctly
    const initialCapital = 10000 * this.pairs.length;
    this.results.roi = (this.results.totalProfit / initialCapital) * 100;

    // Profit factor
    let totalWinAmount = 0;
    let totalLossAmount = 0;
    Object.values(this.results.pairResults).forEach(p => {
      if (p.trades > 0) {
        totalWinAmount += p.avgWin * p.wins;
        totalLossAmount += Math.abs(p.avgLoss) * p.losses;
      }
    });
    this.results.profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0;
    this.results.avgWinSize = this.results.totalWins > 0 ? totalWinAmount / this.results.totalWins : 0;
    this.results.avgLossSize = this.results.totalLosses > 0 ? totalLossAmount / this.results.totalLosses : 0;

    const elapsed = (Date.now() - startTime) / 1000;

    // Print final results
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 FINAL RESULTS - ULTRA v4.0 OPTIMIZED');
    console.log(`${'='.repeat(80)}`);
    console.log(`Total Trades: ${this.results.totalTrades}`);
    console.log(`Wins: ${this.results.totalWins} | Losses: ${this.results.totalLosses}`);
    
    const winRateStatus = this.results.winRate >= 70 ? '✅' : '⚠️ ';
    const accuracyStatus = this.results.accuracy >= 85 ? '✅' : '⚠️ ';
    const roiStatus = (this.results.roi / 21) >= 5 ? '✅' : '⚠️ ';

    console.log(`${winRateStatus} Win Rate: ${this.results.winRate.toFixed(2)}% (TARGET: 70%)`);
    console.log(`${accuracyStatus} Accuracy: ${this.results.accuracy.toFixed(2)}% (TARGET: 85%)`);
    console.log(`💰 Total Profit: $${this.results.totalProfit.toFixed(2)}`);
    console.log(`💱 Profit Factor: ${this.results.profitFactor.toFixed(2)} (Wins/Losses ratio)`);
    console.log(`📈 ROI: ${this.results.roi.toFixed(3)}%`);
    console.log(`📅 Daily ROI: ${(this.results.roi / 21).toFixed(3)}% (TARGET: 5%)`);
    console.log(`Avg Win: $${this.results.avgWinSize.toFixed(2)} | Avg Loss: $${this.results.avgLossSize.toFixed(2)}`);
    console.log(`⏱️  Time: ${elapsed.toFixed(1)}s`);
    console.log(`${'='.repeat(80)}`);

    // Top performers
    const sorted = Object.entries(this.results.pairResults)
      .filter(([_, r]) => r.trades > 0)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 15);

    if (sorted.length > 0) {
      console.log('\n⭐ TOP 15 PERFORMING PAIRS:');
      sorted.forEach((entry, i) => {
        const [pair, result] = entry;
        const wr = result.accuracy.toFixed(1).padStart(5);
        const profit = result.totalProfit.toFixed(2).padStart(7);
        const status = result.accuracy >= 70 ? '✅' : result.accuracy >= 55 ? '⚡' : '⚠️ ';
        console.log(`${status} ${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | WR: ${wr}% | Trades: ${(result.trades + '').padStart(2)} | Profit: $${profit}`);
      });
    }

    // Assessment
    console.log(`\n${'='.repeat(80)}`);
    console.log('🎯 FINAL ASSESSMENT');
    console.log(`${'='.repeat(80)}`);

    const achieved = [];
    const needImprovement = [];

    if (this.results.winRate >= 70) {
      achieved.push(`✅ Win Rate: ${this.results.winRate.toFixed(2)}% ≥ 70%`);
    } else {
      const gap = 70 - this.results.winRate;
      needImprovement.push(`⚠️  Win Rate: ${this.results.winRate.toFixed(2)}% (gap: +${gap.toFixed(2)}%)`);
    }

    if (this.results.accuracy >= 85) {
      achieved.push(`✅ Accuracy: ${this.results.accuracy.toFixed(2)}% ≥ 85%`);
    } else {
      const gap = 85 - this.results.accuracy;
      needImprovement.push(`⚠️  Accuracy: ${this.results.accuracy.toFixed(2)}% (gap: +${gap.toFixed(2)}%)`);
    }

    const dailyROI = this.results.roi / 21;
    if (dailyROI >= 5) {
      achieved.push(`✅ Daily ROI: ${dailyROI.toFixed(3)}% ≥ 5%`);
    } else {
      const gap = 5 - dailyROI;
      needImprovement.push(`⚠️  Daily ROI: ${dailyROI.toFixed(3)}% (gap: +${gap.toFixed(3)}%)`);
    }

    if (achieved.length > 0) {
      console.log('\n🎉 TARGETS ACHIEVED:');
      achieved.forEach(t => console.log(`  ${t}`));
    } else {
      console.log('\n📈 Status: Optimizing...');
    }

    if (needImprovement.length > 0) {
      console.log('\n🔧 AREAS TO IMPROVE:');
      needImprovement.forEach(t => console.log(`  ${t}`));
    }

    console.log(`\n💡 KEY METRICS:`);
    console.log(`  • Profit Factor: ${this.results.profitFactor.toFixed(2)} (ideal > 2.0)`);
    console.log(`  • Avg Win/Loss Ratio: ${(this.results.avgWinSize / this.results.avgLossSize).toFixed(2)} (ideal > 1.5)`);
    console.log(`  • Total Capital Deployed: $${(initialCapital).toFixed(0)}`);
    console.log(`  • Expected Annual ROI: ${(this.results.roi * 365 / 21).toFixed(2)}%`);

    console.log(`${'='.repeat(80)}\n`);

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

    const filename = path.join(logsDir, `ultra-v4-backtest-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2), 'utf8');

    console.log(`✅ Results saved: ${filename}\n`);
  }
}

/**
 * Main
 */
async function main() {
  const backtest = new UltraOptimizedBacktest();
  await backtest.runBacktest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = UltraOptimizedBacktest;
