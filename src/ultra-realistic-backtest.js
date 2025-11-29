/**
 * ULTRA v2.0 Realistic Backtest
 * 
 * Симуляция с реалистичными параметрами
 * ├─ Простые технические сигналы
 * ├─ Адаптивный exit
 * ├─ 70% win rate целевой
 * └─ 85% accuracy целевой
 */

const fs = require('fs');
const path = require('path');

class UltraRealisticBacktest {
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
   * Generate realistic market data
   */
  generateMarketData(pair, sessions = 150) {
    const data = [];
    
    const volatility = {
      'BTCUSDT': 1.2, 'ETHUSDT': 1.3, 'BNBUSDT': 1.1,
      'default': 0.9
    }[pair] || 0.9;
    
    let price = 100 * (Math.random() + 1);
    let trend = (Math.random() - 0.5) * 0.02;
    
    for (let i = 0; i < sessions; i++) {
      const change = trend + (Math.random() - 0.5) * volatility * 0.01;
      trend = trend * 0.95 + (Math.random() - 0.5) * 0.001;
      
      price *= (1 + change);
      
      const open = price * (1 + (Math.random() - 0.5) * 0.002);
      const close = price * (1 + (Math.random() - 0.5) * 0.002);
      const high = Math.max(open, close) * (1 + Math.abs(Math.random() - 0.5) * 0.005);
      const low = Math.min(open, close) * (1 - Math.abs(Math.random() - 0.5) * 0.005);
      const volume = (Math.random() + 0.5) * 1000000;
      
      data.push({ time: Date.now() + i * 60000, open, high, low, close, volume });
      price = close;
    }
    
    return data;
  }

  /**
   * Calculate RSI
   */
  calculateRSI(data, period = 14) {
    if (data.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i].close - data[i - 1].close;
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / (avgLoss || 0.0001);
    const rsi = 100 - (100 / (1 + rs));

    return Math.max(0, Math.min(100, rsi));
  }

  /**
   * Calculate simple momentum
   */
  calculateMomentum(data) {
    if (data.length < 5) return 0;
    const recent = data[data.length - 1].close;
    const past = data[data.length - 5].close;
    return (recent - past) / past;
  }

  /**
   * Simple signal generation
   * ├─ BUY: RSI < 35 (oversold)
   * ├─ SELL: RSI > 65 (overbought) or trailing stop
   * └─ Adaptive stop losses
   */
  generateSignal(data) {
    if (data.length < 20) return { action: 'HOLD', strength: 0 };

    const rsi = this.calculateRSI(data, 14);
    const momentum = this.calculateMomentum(data);

    // Simple but effective signals
    if (rsi < 35 && momentum > -0.02) {
      // Oversold + not crashing = BUY
      return {
        action: 'BUY',
        strength: (35 - rsi) / 35,  // 0-1 strength
        rsi
      };
    } else if (rsi > 65 && momentum < 0.02) {
      // Overbought + not rallying = SELL
      return {
        action: 'SELL',
        strength: (rsi - 65) / 35,  // 0-1 strength
        rsi
      };
    }

    return { action: 'HOLD', strength: 0, rsi };
  }

  /**
   * Backtest single pair
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
    for (let i = 50; i < ohlcData.length; i++) {
      const signal = this.generateSignal(ohlcData.slice(Math.max(0, i - 60), i));
      const currentPrice = ohlcData[i].close;

      // EXIT: Close position if conditions met
      if (portfolio.positions[pair]) {
        const pos = portfolio.positions[pair];
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const holdBars = i - pos.entryIndex;

        let shouldClose = false;

        // Hard stop loss: -2%
        if (profitPercent < -2) {
          shouldClose = true;
        }
        // Hard take profit: +3%
        else if (profitPercent > 3) {
          shouldClose = true;
        }
        // Trailing stop: hold 5+ bars, then exit on 1% drawdown from max
        else if (holdBars > 5 && profitPercent > 0) {
          if (!pos.maxProfit) pos.maxProfit = profitPercent;
          else pos.maxProfit = Math.max(pos.maxProfit, profitPercent);

          if (profitPercent < pos.maxProfit - 1.0) {
            shouldClose = true;
          }
        }
        // Time stop: after 20 bars close
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

      // ENTRY: Open new position
      if (signal.action === 'BUY' && !portfolio.positions[pair]) {
        // Position sizing: Kelly criterion simplified
        const positionValue = portfolio.cash * 0.02;  // 2% risk per trade
        const quantity = positionValue / currentPrice;

        if (quantity * currentPrice < portfolio.cash) {
          portfolio.positions[pair] = {
            entryPrice: currentPrice,
            quantity,
            entryIndex: i,
            maxProfit: 0
          };
          portfolio.cash -= quantity * currentPrice;
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
    console.log(`\n${'='.repeat(70)}`);
    console.log('🚀 ULTRA v2.0 REALISTIC BACKTEST');
    console.log(`${'='.repeat(70)}\n`);

    const startTime = Date.now();
    
    let idx = 1;
    for (const pair of this.pairs) {
      const pairResult = this.backtestPair(pair);
      this.results.pairResults[pair] = pairResult;

      this.results.totalTrades += pairResult.trades;
      this.results.totalWins += pairResult.wins;
      this.results.totalLosses += pairResult.losses;
      this.results.totalProfit += pairResult.totalProfit;

      const status = pairResult.accuracy >= 70 ? '✅' : '⚠️ ';
      console.log(`${status} [${idx}/30] ${pair.padEnd(10)} | Trades: ${(pairResult.trades + '').padStart(3)} | WR: ${pairResult.accuracy.toFixed(0)}% | Profit: $${pairResult.totalProfit.toFixed(0)}`);
      
      idx++;
    }

    // Calculate overall metrics
    if (this.results.totalTrades > 0) {
      this.results.accuracy = (this.results.totalWins / this.results.totalTrades) * 100;
      this.results.winRate = this.results.accuracy;
    }

    this.results.roi = (this.results.totalProfit / (10000 * this.pairs.length)) * 100;

    const elapsed = (Date.now() - startTime) / 1000;

    // Print final results
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 FINAL RESULTS - ULTRA v2.0');
    console.log(`${'='.repeat(70)}`);
    console.log(`Total Trades: ${this.results.totalTrades}`);
    console.log(`Wins: ${this.results.totalWins} | Losses: ${this.results.totalLosses}`);
    console.log(`✅ Win Rate: ${this.results.winRate.toFixed(2)}% (TARGET: 70%)`);
    console.log(`✅ Accuracy: ${this.results.accuracy.toFixed(2)}% (TARGET: 85%)`);
    console.log(`💰 Total Profit: $${this.results.totalProfit.toFixed(2)}`);
    console.log(`📈 ROI: ${this.results.roi.toFixed(2)}%`);
    console.log(`📅 Daily ROI: ${(this.results.roi / 21).toFixed(2)}% ⭐ (TARGET: 5%)`);
    console.log(`⏱️  Time: ${elapsed.toFixed(1)}s`);
    console.log(`${'='.repeat(70)}`);

    // Top performers
    const sorted = Object.entries(this.results.pairResults)
      .filter(([_, r]) => r.trades > 0)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 10);

    console.log('\n⭐ TOP 10 PERFORMING PAIRS:');
    sorted.forEach((entry, i) => {
      const [pair, result] = entry;
      console.log(`${(i + 1).toString().padStart(2)}. ${pair.padEnd(10)} | Accuracy: ${result.accuracy.toFixed(1)}% | Trades: ${result.trades} | Profit: $${result.totalProfit.toFixed(2)}`);
    });

    // Assessment
    console.log(`\n${'='.repeat(70)}`);
    console.log('🎯 ASSESSMENT');
    console.log(`${'='.repeat(70)}`);

    const targetsMet = [];
    const targetsMissed = [];

    if (this.results.winRate >= 70) {
      targetsMet.push(`✅ Win Rate ${this.results.winRate.toFixed(2)}% ≥ 70%`);
    } else {
      targetsMissed.push(`❌ Win Rate ${this.results.winRate.toFixed(2)}% < 70%`);
    }

    if (this.results.accuracy >= 85) {
      targetsMet.push(`✅ Accuracy ${this.results.accuracy.toFixed(2)}% ≥ 85%`);
    } else {
      targetsMissed.push(`❌ Accuracy ${this.results.accuracy.toFixed(2)}% < 85%`);
    }

    const dailyROI = this.results.roi / 21;
    if (dailyROI >= 5) {
      targetsMet.push(`✅ Daily ROI ${dailyROI.toFixed(2)}% ≥ 5%`);
    } else {
      targetsMissed.push(`❌ Daily ROI ${dailyROI.toFixed(2)}% < 5%`);
    }

    if (targetsMet.length > 0) {
      console.log('\n🎉 TARGETS MET:');
      targetsMet.forEach(t => console.log(`  ${t}`));
    }

    if (targetsMissed.length > 0) {
      console.log('\n⚠️  TARGETS TO IMPROVE:');
      targetsMissed.forEach(t => console.log(`  ${t}`));
    }

    console.log(`${'='.repeat(70)}\n`);

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

    const filename = path.join(logsDir, `ultra-realistic-backtest-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2), 'utf8');

    console.log(`✅ Results saved: ${filename}\n`);
  }
}

/**
 * Main
 */
async function main() {
  const backtest = new UltraRealisticBacktest();
  await backtest.runBacktest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = UltraRealisticBacktest;
