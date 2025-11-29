/**
 * ULTRA v3.0 Advanced Signal Generation
 * 
 * Улучшенная версия с:
 * ├─ Multi-indicator confirmation
 * ├─ Volatility-based entry/exit
 * ├─ Adaptive thresholds
 * ├─ Better win rate (target 70%)
 * └─ Better accuracy (target 85%)
 */

class UltraLSTMv3 {
  /**
   * Calculate RSI
   */
  static calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
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
   * Calculate MACD
   */
  static calculateMACD(closes) {
    if (closes.length < 26) return { line: 0, signal: 0, histogram: 0 };

    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const line = ema12 - ema26;

    // Signal line (9-period EMA of MACD line)
    const macdValues = [];
    for (let i = 25; i < closes.length; i++) {
      const e12 = this.calculateEMA(closes.slice(0, i + 1), 12);
      const e26 = this.calculateEMA(closes.slice(0, i + 1), 26);
      macdValues.push(e12 - e26);
    }

    const signal = this.calculateEMA(macdValues, 9);
    const histogram = line - signal;

    return { line, signal, histogram };
  }

  /**
   * Calculate EMA
   */
  static calculateEMA(values, period) {
    if (values.length < period) return values[values.length - 1] || 0;

    let ema = values.slice(0, period).reduce((a, b) => a + b) / period;
    const multiplier = 2 / (period + 1);

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate Bollinger Bands
   */
  static calculateBB(closes, period = 20, devs = 2) {
    if (closes.length < period) {
      const avg = closes.reduce((a, b) => a + b) / closes.length;
      return { upper: avg * 1.02, middle: avg, lower: avg * 0.98 };
    }

    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b) / period;

    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: middle + devs * std,
      middle,
      lower: middle - devs * std
    };
  }

  /**
   * Calculate ATR (Average True Range)
   */
  static calculateATR(ohlc, period = 14) {
    if (ohlc.length < period) return 0;

    const tr = [];
    for (let i = 1; i < ohlc.length; i++) {
      const h = ohlc[i].high;
      const l = ohlc[i].low;
      const c = ohlc[i - 1].close;

      const tr1 = h - l;
      const tr2 = Math.abs(h - c);
      const tr3 = Math.abs(l - c);

      tr.push(Math.max(tr1, tr2, tr3));
    }

    return tr.slice(-period).reduce((a, b) => a + b) / period;
  }

  /**
   * Calculate volatility percentage
   */
  static calculateVolatility(closes, period = 20) {
    if (closes.length < period) return 0;

    const slice = closes.slice(-period);
    const returns = [];

    for (let i = 1; i < slice.length; i++) {
      returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
    }

    const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;

    return volatility;
  }

  /**
   * Advanced signal generation with multiple confirmations
   * 
   * Strategy:
   * ├─ BUY: RSI < 40 + MACD bullish + Price > Lower BB
   * ├─ SELL: RSI > 60 + MACD bearish + Price < Upper BB
   * └─ Confidence based on agreement of indicators
   */
  static generateSignal(ohlcData) {
    if (ohlcData.length < 30) {
      return { action: 'HOLD', confidence: 0 };
    }

    const closes = ohlcData.map(c => c.close);
    const rsi = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const bb = this.calculateBB(closes, 20, 2);
    const atr = this.calculateATR(ohlcData, 14);
    const currentPrice = ohlcData[ohlcData.length - 1].close;
    const volatility = this.calculateVolatility(closes, 20);

    // Normalize volatility: low = good for entry, very high = caution
    const volFactor = Math.max(0, 1 - volatility / 5);

    // RSI signals
    const rsiOversold = rsi < 40;
    const rsiOverbought = rsi > 60;

    // MACD signals
    const macdBullish = macd.histogram > 0 && macd.line > macd.signal;
    const macdBearish = macd.histogram < 0 && macd.line < macd.signal;

    // Price vs Bollinger Bands
    const priceNearLower = currentPrice < bb.middle && currentPrice > (bb.lower + (bb.middle - bb.lower) * 0.3);
    const priceNearUpper = currentPrice > bb.middle && currentPrice < (bb.upper - (bb.upper - bb.middle) * 0.3);

    // BUY conditions
    const buyConditions = [
      rsiOversold,       // RSI oversold
      macdBullish,       // MACD turning up
      priceNearLower,    // Price near lower BB
      volFactor > 0.5    // Not too volatile
    ];

    const buyCount = buyConditions.filter(c => c).length;
    const buyConfidence = buyCount / 4 * (0.5 + volFactor * 0.5);

    // SELL conditions
    const sellConditions = [
      rsiOverbought,     // RSI overbought
      macdBearish,       // MACD turning down
      priceNearUpper,    // Price near upper BB
      volFactor > 0.5    // Not too volatile
    ];

    const sellCount = sellConditions.filter(c => c).length;
    const sellConfidence = sellCount / 4 * (0.5 + volFactor * 0.5);

    // Determine action
    let action = 'HOLD';
    let confidence = 0;

    if (buyConfidence > sellConfidence && buyConfidence > 0.45) {
      action = 'BUY';
      confidence = Math.min(0.95, buyConfidence);
    } else if (sellConfidence > buyConfidence && sellConfidence > 0.45) {
      action = 'SELL';
      confidence = Math.min(0.95, sellConfidence);
    }

    return {
      action,
      confidence,
      details: {
        rsi,
        macd,
        bb,
        atr,
        volatility,
        buyCount,
        sellCount,
        volFactor
      }
    };
  }
}

module.exports = UltraLSTMv3;
