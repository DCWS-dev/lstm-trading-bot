/**
 * ULTRA v3.0 Advanced Backtest
 * 
 * Улучшенная версия с:
 * ├─ Лучшая генерация сигналов (multi-indicator)
 * ├─ Умный exit (trailing stop + adaptive TP)
 * ├─ Целевой win rate: 70%
 * └─ Целевой accuracy: 85%
 */

const fs = require('fs');
const path = require('path');
const UltraLSTMv3 = require('./ultra-lstm-v3');

class UltraAdvancedBacktest {
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
      pairResults: {},
      tradeDetails: []
    };
  }

  /**
   * Generate realistic market data with realistic patterns
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
      // Mean reversion tendency
      const meanReversionForce = -trend * 0.05;
      
      // Random walk component
      const randomComponent = (Math.random() - 0.5) * volatility * 0.01;
      
      // Trend component with decay
      trend = trend * 0.95 + (Math.random() - 0.5) * 0.002;
      
      const change = meanReversionForce + randomComponent + trend;
      price *= (1 + change);
      
      // Generate OHLC from price
      const open = price * (1 + (Math.random() - 0.5) * 0.002);
      const close = price * (1 + (Math.random() - 0.5) * 0.002);
      const high = Math.max(open, close) * (1 + Math.abs(Math.random() - 0.5) * 0.004);
      const low = Math.min(open, close) * (1 - Math.abs(Math.random() - 0.5) * 0.004);
      const volume = (Math.random() + 0.5) * 1000000;
      
      data.push({ 
        time: Date.now() + i * 60000, 
        open, high, low, close, volume 
      });
      
      price = close;
    }
    
    return data;
  }

  /**
   * Advanced backtest for single pair
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
      avgLoss: 0,
      maxProfit: 0,
      maxLoss: 0
    };
    
    let portfolio = {
      cash: 10000,
      positions: {}
    };
    
    let totalWins = 0;
    let totalLosses = 0;

    // Trading loop - use at least 30 candles for indicators
    for (let i = 30; i < ohlcData.length; i++) {
      const historicalData = ohlcData.slice(Math.max(0, i - 60), i + 1);
      const signal = UltraLSTMv3.generateSignal(historicalData);
      const currentPrice = ohlcData[i].close;
      const atr = UltraLSTMv3.calculateATR(historicalData, 14);

      // ============ EXIT LOGIC ============
      if (portfolio.positions[pair]) {
        const pos = portfolio.positions[pair];
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const holdBars = i - pos.entryIndex;
        const atrPercent = (atr / currentPrice) * 100;

        let shouldClose = false;
        let closeReason = '';

        // Hard stop loss: 2% or 1.5x ATR (whichever is larger)
        const stopLossPercent = Math.max(2, atrPercent * 1.5);
        if (profitPercent < -stopLossPercent) {
          shouldClose = true;
          closeReason = 'StopLoss';
        }
        // Take profit levels: partial closes at different levels
        else if (profitPercent > 5) {
          shouldClose = true;
          closeReason = 'TakeProfit-5%';
        }
        else if (profitPercent > 2 && holdBars > 8) {
          // Exit half at +2% after 8 bars
          if (!pos.partialClosed) {
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
            pos.partialClosed = true;
            continue; // Don't close completely
          }
        }
        // Trailing stop: hold profit, exit on 1.2% drawdown from max
        else if (profitPercent > 1 && holdBars > 5) {
          if (!pos.maxProfit) pos.maxProfit = profitPercent;
          else pos.maxProfit = Math.max(pos.maxProfit, profitPercent);

          if (profitPercent < pos.maxProfit - 1.2) {
            shouldClose = true;
            closeReason = 'TrailingStop';
          }
        }
        // Time stop: after 25 bars close
        else if (holdBars > 25) {
          shouldClose = true;
          closeReason = 'TimeStop';
        }

        if (shouldClose) {
          const profit = (currentPrice - pos.entryPrice) * pos.quantity;
          pairResult.trades++;
          
          if (profit > 0) {
            pairResult.wins++;
            totalWins += profit;
            pairResult.maxProfit = Math.max(pairResult.maxProfit, profit);
          } else {
            pairResult.losses++;
            totalLosses += Math.abs(profit);
            pairResult.maxLoss = Math.min(pairResult.maxLoss, profit);
          }

          pairResult.totalProfit += profit;
          portfolio.cash += currentPrice * pos.quantity;
          delete portfolio.positions[pair];
        }
      }

      // ============ ENTRY LOGIC ============
      if (!portfolio.positions[pair] && signal.confidence > 0.5) {
        // Only enter on clear signals
        if ((signal.action === 'BUY' && signal.confidence > 0.55) ||
            (signal.action === 'SELL' && signal.confidence > 0.55)) {
          
          // Position sizing based on confidence and account size
          const riskPercent = signal.confidence * 0.03; // 0-3% risk based on confidence
          const positionValue = portfolio.cash * riskPercent;
          const quantity = positionValue / currentPrice;

          if (quantity * currentPrice < portfolio.cash * 0.95) {
            portfolio.positions[pair] = {
              entryPrice: currentPrice,
              quantity,
              entryIndex: i,
              maxProfit: 0,
              partialClosed: false,
              action: signal.action,
              signal: signal.confidence
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
        pairResult.maxProfit = Math.max(pairResult.maxProfit, profit);
      } else {
        pairResult.losses++;
        totalLosses += Math.abs(profit);
        pairResult.maxLoss = Math.min(pairResult.maxLoss, profit);
      }
      pairResult.totalProfit += profit;
    }

    // Calculate accuracy
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
    console.log(`\n${'='.repeat(75)}`);
    console.log('🚀 ULTRA v3.0 ADVANCED BACKTEST (Multi-Indicator Confirmation)');
    console.log(`${'='.repeat(75)}\n`);

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
                     pairResult.accuracy >= 50 ? '⚡' : '⚠️ ';
      console.log(`${status} [${(idx++).toString().padStart(2)}/30] ${pair.padEnd(10)} | Trades: ${(pairResult.trades + '').padStart(3)} | WR: ${(pairResult.accuracy.toFixed(0) + '%').padStart(4)} | Profit: $${pairResult.totalProfit.toFixed(0).padStart(5)}`);
    }

    // Calculate overall metrics
    if (this.results.totalTrades > 0) {
      this.results.accuracy = (this.results.totalWins / this.results.totalTrades) * 100;
      this.results.winRate = this.results.accuracy;
    }

    this.results.roi = (this.results.totalProfit / (10000 * this.pairs.length)) * 100;

    const elapsed = (Date.now() - startTime) / 1000;

    // Print final results
    console.log(`\n${'='.repeat(75)}`);
    console.log('📊 FINAL RESULTS - ULTRA v3.0 ADVANCED');
    console.log(`${'='.repeat(75)}`);
    console.log(`Total Trades: ${this.results.totalTrades}`);
    console.log(`Wins: ${this.results.totalWins} | Losses: ${this.results.totalLosses}`);
    
    const winRateStatus = this.results.winRate >= 70 ? '✅' : '⚠️ ';
    const accuracyStatus = this.results.accuracy >= 85 ? '✅' : '⚠️ ';
    const roiStatus = (this.results.roi / 21) >= 5 ? '✅' : '⚠️ ';

    console.log(`${winRateStatus} Win Rate: ${this.results.winRate.toFixed(2)}% (TARGET: 70%)`);
    console.log(`${accuracyStatus} Accuracy: ${this.results.accuracy.toFixed(2)}% (TARGET: 85%)`);
    console.log(`💰 Total Profit: $${this.results.totalProfit.toFixed(2)}`);
    console.log(`${roiStatus} ROI: ${this.results.roi.toFixed(2)}%`);
    console.log(`📅 Daily ROI: ${(this.results.roi / 21).toFixed(2)}% (TARGET: 5%)`);
    console.log(`⏱️  Time: ${elapsed.toFixed(1)}s`);
    console.log(`${'='.repeat(75)}`);

    // Top performers
    const sorted = Object.entries(this.results.pairResults)
      .filter(([_, r]) => r.trades > 0)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 15);

    console.log('\n⭐ TOP 15 PERFORMING PAIRS:');
    sorted.forEach((entry, i) => {
      const [pair, result] = entry;
      const wr = result.accuracy.toFixed(1);
      const profit = result.totalProfit.toFixed(2);
      const status = result.accuracy >= 70 ? '✅' : result.accuracy >= 50 ? '⚡' : '⚠️ ';
      console.log(`${status} ${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | WR: ${wr.padStart(5)}% | Trades: ${(result.trades + '').padStart(2)} | Profit: $${profit.padStart(6)}`);
    });

    // Assessment
    console.log(`\n${'='.repeat(75)}`);
    console.log('🎯 ASSESSMENT & NEXT STEPS');
    console.log(`${'='.repeat(75)}`);

    const targetsMet = [];
    const targetsMissed = [];

    if (this.results.winRate >= 70) {
      targetsMet.push(`✅ Win Rate: ${this.results.winRate.toFixed(2)}% ≥ 70%`);
    } else {
      const diff = (70 - this.results.winRate).toFixed(2);
      targetsMissed.push(`❌ Win Rate: ${this.results.winRate.toFixed(2)}% (need +${diff}%)`);
    }

    if (this.results.accuracy >= 85) {
      targetsMet.push(`✅ Accuracy: ${this.results.accuracy.toFixed(2)}% ≥ 85%`);
    } else {
      const diff = (85 - this.results.accuracy).toFixed(2);
      targetsMissed.push(`❌ Accuracy: ${this.results.accuracy.toFixed(2)}% (need +${diff}%)`);
    }

    const dailyROI = this.results.roi / 21;
    if (dailyROI >= 5) {
      targetsMet.push(`✅ Daily ROI: ${dailyROI.toFixed(2)}% ≥ 5%`);
    } else {
      const diff = (5 - dailyROI).toFixed(2);
      targetsMissed.push(`❌ Daily ROI: ${dailyROI.toFixed(2)}% (need +${diff}%)`);
    }

    if (targetsMet.length > 0) {
      console.log('\n🎉 TARGETS MET:');
      targetsMet.forEach(t => console.log(`  ${t}`));
    }

    if (targetsMissed.length > 0) {
      console.log('\n⚡ TARGETS TO IMPROVE:');
      targetsMissed.forEach(t => console.log(`  ${t}`));
      console.log('\n💡 RECOMMENDATIONS:');
      if (this.results.winRate < 70) {
        console.log('  • Improve exit strategy (tighter stop-loss or better profit-taking)');
        console.log('  • Add more confirmation signals (confluence zones)');
        console.log('  • Filter out low-probability setups');
      }
      if (this.results.roi / 21 < 5) {
        console.log('  • Increase position sizing on high-confidence signals');
        console.log('  • Extend profit targets based on ATR');
        console.log('  • Add trending pairs that allow larger moves');
      }
    }

    console.log(`${'='.repeat(75)}\n`);

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

    const filename = path.join(logsDir, `ultra-v3-backtest-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2), 'utf8');

    console.log(`✅ Results saved: ${filename}\n`);
  }
}

/**
 * Main
 */
async function main() {
  const backtest = new UltraAdvancedBacktest();
  await backtest.runBacktest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = UltraAdvancedBacktest;
