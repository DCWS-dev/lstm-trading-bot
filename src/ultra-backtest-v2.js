/**
 * ULTRA v2.0 Backtest (85% Accuracy Target)
 * 
 * Backtest на 30 парах с симуляцией рыночных данных
 * Целевые метрики:
 * ├─ Точность: 85%
 * ├─ Win Rate: 70%
 * └─ Daily ROI: 5%
 */

const fs = require('fs');
const path = require('path');
const UltraLSTM85 = require('./ultra-lstm-85');

class UltraBacktestV2 {
  constructor() {
    this.ultraLSTM = new UltraLSTM85();
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
   * Generate realistic market data for backtesting
   */
  generateMarketData(pair, sessions = 150) {
    const data = [];
    
    // Pair-specific volatility and trend
    const pairVolatility = {
      'BTCUSDT': 1.2,
      'ETHUSDT': 1.3,
      'BNBUSDT': 1.1,
      'default': 0.9
    };
    
    const volatility = pairVolatility[pair] || pairVolatility['default'];
    
    let price = 100 * (Math.random() + 1); // Random starting price
    let trend = (Math.random() - 0.5) * 0.02;
    
    for (let i = 0; i < sessions; i++) {
      // Random walk with trend
      const change = trend + (Math.random() - 0.5) * volatility * 0.01;
      trend = trend * 0.95 + (Math.random() - 0.5) * 0.001; // Mean revert trend
      
      price *= (1 + change);
      
      const open = price * (1 + (Math.random() - 0.5) * 0.002);
      const close = price * (1 + (Math.random() - 0.5) * 0.002);
      const high = Math.max(open, close) * (1 + Math.abs(Math.random() - 0.5) * 0.005);
      const low = Math.min(open, close) * (1 - Math.abs(Math.random() - 0.5) * 0.005);
      
      const volume = (Math.random() + 0.5) * 1000000;
      
      data.push({
        time: Date.now() + i * 60000,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseFloat(volume.toFixed(2))
      });
      
      price = close;
    }
    
    return data;
  }

  /**
   * Calculate indicators
   */
  calculateIndicators(ohlcData) {
    if (ohlcData.length < 14) return {};
    
    // RSI
    let gains = 0, losses = 0;
    for (let i = ohlcData.length - 14; i < ohlcData.length; i++) {
      const diff = ohlcData[i].close - ohlcData[i - 1].close;
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgGain / (avgLoss || 0.0001);
    const rsi = 100 - (100 / (1 + rs));
    
    // MACD
    const ema12 = this.calculateEMA(ohlcData, 12);
    const ema26 = this.calculateEMA(ohlcData, 26);
    const macdValue = ema12 - ema26;
    
    // Bollinger Bands
    const period = 20;
    const recent = ohlcData.slice(-period);
    const avg = recent.reduce((sum, c) => sum + c.close, 0) / period;
    const variance = recent.reduce((sum, c) => sum + Math.pow(c.close - avg, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    const upper = avg + std * 2;
    const lower = avg - std * 2;
    const current = ohlcData[ohlcData.length - 1].close;
    const bb = (current - lower) / (upper - lower);
    
    return {
      rsi: Math.max(0, Math.min(100, rsi)),
      macd: macdValue,
      bb: Math.max(0, Math.min(1, bb)),
      volume: ohlcData[ohlcData.length - 1].volume / (ohlcData[ohlcData.length - 2]?.volume || 1)
    };
  }

  /**
   * EMA calculation
   */
  calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1].close;
    const multiplier = 2 / (period + 1);
    let ema = data[0].close;
    for (let i = 1; i < data.length; i++) {
      ema = (data[i].close - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * Run backtest for single pair
   */
  backtestPair(pair) {
    console.log(`\n🔍 Backtesting ${pair}...`);
    
    const ohlcData = this.generateMarketData(pair, 150);
    const pairResult = {
      pair,
      trades: 0,
      wins: 0,
      losses: 0,
      accuracy: 0,
      totalProfit: 0,
      tradeDetails: []
    };
    
    let portfolio = {
      cash: 10000,
      positions: {},
      trades: []
    };
    
    // Simulate trading
    for (let i = 50; i < ohlcData.length; i++) {
      const currentCandle = ohlcData[i];
      const historicalData = ohlcData.slice(Math.max(0, i - 60), i);
      
      const indicators = this.calculateIndicators(historicalData);
      
      // Generate signal with ULTRA LSTM
      const signal = this.ultraLSTM.generateSignal(pair, historicalData, indicators);
      
      // Execute trade (lower confidence threshold for backtest)
      if (signal.action === 'BUY' && signal.confidence >= 0.60 && !portfolio.positions[pair]) {
        // Entry
        const positionSize = (portfolio.cash * 0.02) / currentCandle.close;
        portfolio.positions[pair] = {
          quantity: positionSize,
          entryPrice: currentCandle.close,
          entryIndex: i,
          maxProfit: 0
        };
        
      } else if (signal.action === 'SELL' && portfolio.positions[pair]) {
        // Exit
        const position = portfolio.positions[pair];
        const profit = (currentCandle.close - position.entryPrice) * position.quantity;
        const profitPercent = (profit / (position.entryPrice * position.quantity)) * 100;
        
        pairResult.trades++;
        if (profit > 0) {
          pairResult.wins++;
        } else {
          pairResult.losses++;
        }
        
        pairResult.totalProfit += profit;
        pairResult.tradeDetails.push({
          entryPrice: position.entryPrice,
          exitPrice: currentCandle.close,
          quantity: position.quantity,
          profit,
          profitPercent,
          holdBars: i - position.entryIndex
        });
        
        portfolio.cash += currentCandle.close * position.quantity;
        delete portfolio.positions[pair];
        
      } else if (portfolio.positions[pair]) {
        // Monitor position
        const position = portfolio.positions[pair];
        const currentProfit = ((currentCandle.close - position.entryPrice) / position.entryPrice) * 100;
        
        // Trailing stop: if profit decreased by 0.5% from max
        if (currentProfit > 0.5) {
          position.maxProfit = Math.max(position.maxProfit, currentProfit);
          
          if (currentProfit < position.maxProfit - 0.5) {
            // Close position
            const profit = (currentCandle.close - position.entryPrice) * position.quantity;
            pairResult.trades++;
            if (profit > 0) pairResult.wins++;
            else pairResult.losses++;
            
            pairResult.totalProfit += profit;
            pairResult.tradeDetails.push({
              entryPrice: position.entryPrice,
              exitPrice: currentCandle.close,
              quantity: position.quantity,
              profit,
              profitPercent: currentProfit,
              holdBars: i - position.entryIndex,
              exitReason: 'trailing_stop'
            });
            
            portfolio.cash += currentCandle.close * position.quantity;
            delete portfolio.positions[pair];
          }
        }
        
        // Hard stop loss: -1.5%
        if (currentProfit < -1.5) {
          const profit = (currentCandle.close - position.entryPrice) * position.quantity;
          pairResult.trades++;
          pairResult.losses++;
          
          pairResult.totalProfit += profit;
          pairResult.tradeDetails.push({
            entryPrice: position.entryPrice,
            exitPrice: currentCandle.close,
            quantity: position.quantity,
            profit,
            profitPercent: currentProfit,
            holdBars: i - position.entryIndex,
            exitReason: 'stop_loss'
          });
          
          portfolio.cash += currentCandle.close * position.quantity;
          delete portfolio.positions[pair];
        }
        
        // Hard take profit: +3%
        if (currentProfit > 3) {
          const profit = (currentCandle.close - position.entryPrice) * position.quantity;
          pairResult.trades++;
          pairResult.wins++;
          
          pairResult.totalProfit += profit;
          pairResult.tradeDetails.push({
            entryPrice: position.entryPrice,
            exitPrice: currentCandle.close,
            quantity: position.quantity,
            profit,
            profitPercent: currentProfit,
            holdBars: i - position.entryIndex,
            exitReason: 'take_profit'
          });
          
          portfolio.cash += currentCandle.close * position.quantity;
          delete portfolio.positions[pair];
        }
      }
    }
    
    // Close any open positions at last price
    if (portfolio.positions[pair]) {
      const position = portfolio.positions[pair];
      const lastPrice = ohlcData[ohlcData.length - 1].close;
      const profit = (lastPrice - position.entryPrice) * position.quantity;
      
      pairResult.trades++;
      if (profit > 0) pairResult.wins++;
      else pairResult.losses++;
      
      pairResult.totalProfit += profit;
    }
    
    // Calculate pair accuracy
    if (pairResult.trades > 0) {
      pairResult.accuracy = (pairResult.wins / pairResult.trades) * 100;
    }
    
    console.log(`  ✅ ${pair}: ${pairResult.trades} trades | WR: ${pairResult.accuracy.toFixed(1)}% | Profit: $${pairResult.totalProfit.toFixed(2)}`);
    
    return pairResult;
  }

  /**
   * Run full backtest
   */
  async runBacktest() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🚀 ULTRA v2.0 BACKTEST (85% Target)');
    console.log(`${'='.repeat(70)}`);
    console.log(`Pairs: ${this.pairs.length}`);
    console.log(`Trades per pair: 150`);
    console.log(`Total expected trades: ${this.pairs.length * 150}\n`);
    
    const startTime = Date.now();
    
    // Run backtest for each pair
    for (const pair of this.pairs) {
      const pairResult = this.backtestPair(pair);
      this.results.pairResults[pair] = pairResult;
      
      this.results.totalTrades += pairResult.trades;
      this.results.totalWins += pairResult.wins;
      this.results.totalLosses += pairResult.losses;
      this.results.totalProfit += pairResult.totalProfit;
    }
    
    // Calculate overall metrics
    if (this.results.totalTrades > 0) {
      this.results.accuracy = (this.results.totalWins / this.results.totalTrades) * 100;
      this.results.winRate = this.results.accuracy;
    }
    
    this.results.roi = (this.results.totalProfit / (10000 * this.pairs.length)) * 100;
    
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Print results
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 ULTRA v2.0 BACKTEST RESULTS');
    console.log(`${'='.repeat(70)}`);
    console.log(`Total Trades: ${this.results.totalTrades}`);
    console.log(`Wins: ${this.results.totalWins} | Losses: ${this.results.totalLosses}`);
    console.log(`Win Rate: ${this.results.winRate.toFixed(2)}% (TARGET: 70%)`);
    console.log(`Accuracy: ${this.results.accuracy.toFixed(2)}% (TARGET: 85%)`);
    console.log(`Total Profit: $${this.results.totalProfit.toFixed(2)}`);
    console.log(`ROI: ${this.results.roi.toFixed(2)}% (Daily: ${(this.results.roi / 21).toFixed(2)}%)`);
    console.log(`Time: ${elapsed.toFixed(1)}s`);
    console.log(`${'='.repeat(70)}`);
    
    // Top performers
    const sorted = Object.entries(this.results.pairResults)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 10);
    
    console.log('\n⭐ TOP 10 PAIRS:');
    sorted.forEach((entry, i) => {
      const [pair, result] = entry;
      console.log(`${i + 1}. ${pair.padEnd(10)} | ${result.accuracy.toFixed(1)}% | ${result.trades} trades | $${result.totalProfit.toFixed(2)}`);
    });
    
    // Save results
    this.saveResults();
  }

  /**
   * Save results to file
   */
  saveResults() {
    const resultsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const filename = path.join(resultsDir, `ultra-backtest-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2), 'utf8');
    
    console.log(`\n✅ Results saved: ${filename}\n`);
  }
}

/**
 * Main execution
 */
async function main() {
  const backtest = new UltraBacktestV2();
  await backtest.runBacktest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = UltraBacktestV2;
