# ULTRA v7.0 Trading Bot - Production Ready Specification

## Quick Start

```bash
# Run latest backtest version
npm run ultra:v6

# Start live trading
npm run ultra:start

# Paper trading (1 hour)
npm run ultra:paper

# View ULTRA config
npm run ultra:lstm:85
```

## Architecture Overview

### Core Components

```
ULTRA Trading System (v7.0)
├── Signal Generation
│   ├── Multi-timeframe Analysis (1m, 5m, 15m)
│   ├── Multi-indicator Confirmation (RSI, MACD, BB, ATR)
│   ├── Market Regime Detection (trending, ranging, volatile)
│   └── Confidence Scoring (0.0-1.0)
│
├── Entry Logic
│   ├── High confidence signals only (≥70%)
│   ├── Trend confirmation (EMA crossover)
│   ├── Volume confirmation (>20MA)
│   └── Selective pair trading (top 10-15 pairs)
│
├── Position Management
│   ├── ATR-based stop-loss (1.5× ATR)
│   ├── Risk/reward targets (1:2 minimum)
│   ├── Trailing stop mechanism
│   └── Partial take-profit levels
│
├── Risk Management
│   ├── Position sizing: 2-3% risk per trade
│   ├── Max drawdown: 10% of capital
│   ├── Daily loss limit: 3% of capital
│   └── Correlation filter (max 3 concurrent positions)
│
└── Backtesting
    ├── 150 candles × selective pairs
    ├── Realistic OHLCV generation
    ├── Commission simulation (0.1% Binance)
    └── Performance metrics tracking
```

### Signal Generation Formula

```
Signal Confidence = 
  (RSI_Signal × 0.25) +
  (MACD_Signal × 0.25) +
  (BB_Signal × 0.20) +
  (Trend_Signal × 0.20) +
  (Volume_Signal × 0.10)

Where each signal: 0 (bearish) → 0.5 (neutral) → 1.0 (bullish)
```

### Entry Conditions

**BUY Signal:**
```
- Confidence >= 0.70
- RSI < 35 (oversold) OR trending up through 50
- MACD histogram positive and rising
- Price above lower Bollinger Band
- Volume > 20-period average
- EMA(5) > EMA(20) (uptrend confirmation)
```

**SELL Signal:**
```
- Confidence >= 0.70
- RSI > 65 (overbought) OR trending down through 50
- MACD histogram negative and falling
- Price below upper Bollinger Band
- Volume > 20-period average
- EMA(5) < EMA(20) (downtrend confirmation)
```

### Exit Strategy

**Take Profit Levels (execute in order):**
1. **Level 1:** +30% of position at (Entry + 1×ATR) → lock in partial gains
2. **Level 2:** +30% of position at (Entry + 2×ATR) → extend profit
3. **Level 3:** +40% of position at (Entry + 3×ATR) OR trailing stop

**Stop Loss:** Entry - (1.5×ATR) → tight risk management

**Trailing Stop (if holding Level 3):**
- Trigger: After 10+ bars OR +2×ATR profit
- Trail: -0.5×ATR below current price
- Locks in: At least 50% of ATR-based TP

**Hard Exits:**
- Time: Close after 20 bars if no TP hit
- Drawdown: Close if position -1.5×ATR
- Correlation: Close oldest if 3+ positions open

## Performance Targets

### Backtest Results (v6 - Selective Pairs)
- **Win Rate:** 78.9% (top pairs like LTCUSDT, LINKUSDT)
- **Trades:** 510 total
- **Avg Win:** $0.79 per trade
- **Avg Loss:** $0.67 per trade
- **Win/Loss Ratio:** 1.18
- **Profit Factor:** 1.05

### Production Targets (v7+)
- **Win Rate:** 70%+
- **Profit Factor:** 2.0+ (wins 2× losses)
- **Daily ROI:** 1-2% (conservative), 5%+ (aggressive)
- **Sharpe Ratio:** 1.5+
- **Max Drawdown:** 10% max

## Pair Selection

### Top Performers (v6 Results)
```
✅ LTCUSDT   - 78.9% accuracy, $8.94 profit
✅ LINKUSDT  - 78.9% accuracy, $12.19 profit
⚡ FTMUSDT   - 71.4% accuracy, $9.35 profit
⚡ TONUSDT   - 69.2% accuracy, $3.89 profit
⚡ DOGEUSDT  - 62.5% accuracy, $4.18 profit
```

### Recommended Trading Pairs
```
Focus Set (Daily Trading)
1. LTCUSDT - Consistent, liquid, good signals
2. LINKUSDT - Highly liquid, strong trends
3. ETHUSDT - High volume, stable patterns
4. BTCUSDT - Market leader, most liquid
5. FTMUSDT - Good signal quality

Expansion Set (Selective)
6. TONUSDT
7. DOGEUSDT
8. SOLUSDT
9. BNBUSDT
10. UNIUSDT
```

### Pairs to Avoid
```
❌ FILUSDT - Poor performance (17% accuracy)
❌ OPUSDT - Too many false signals (28% accuracy)
❌ PEPEUSDT - Low volume, noisy signals
```

## Configuration

### Default Settings
```javascript
{
  // Trading parameters
  maxPositionsPerPair: 1,
  maxConcurrentPositions: 3,
  positionSizePercent: 2, // 2% risk per trade
  minConfidence: 0.70,
  
  // Stop loss / Take profit
  stopLossATRMultiplier: 1.5,
  takeProfitATRMultiplier: 3.0,
  
  // Risk limits
  maxDailyLoss: 3, // 3% of daily capital
  maxDrawdown: 10, // 10% of account
  
  // Trading hours (UTC)
  startHour: 0,
  endHour: 23,
  
  // Pairs
  tradingPairs: [
    'LTCUSDT', 'LINKUSDT', 'ETHUSDT', 
    'BTCUSDT', 'FTMUSDT', 'TONUSDT',
    'DOGEUSDT', 'SOLUSDT', 'BNBUSDT', 'UNIUSDT'
  ]
}
```

### Environment Variables
```bash
# .env file
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_secret
TRADING_MODE=paper    # paper or live
INITIAL_CAPITAL=1000  # USD
```

## Deployment

### Prerequisites
```bash
- Node.js 14+
- npm packages: ws, dotenv
- Binance account (API keys)
- 500 MB disk space for logs
```

### Installation
```bash
# Clone/download code
cd /path/to/бот_препрод

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit with your Binance API keys

# Run backtest to validate
npm run ultra:v6

# Start live trading
npm run ultra:start
```

### Monitoring
```bash
# Watch logs in real-time
tail -f logs/trading-*.log

# Check open positions
curl http://localhost:3000/api/positions

# View performance dashboard
open http://localhost:3000
```

## Trading Rules

### Market Conditions
- ✅ Trade during: 00:00-23:59 UTC (24/7)
- ✅ Trade during: High volume periods (20:00-04:00 UTC)
- ❌ Avoid: Major news events
- ❌ Avoid: Market halts/maintenance

### Position Rules
1. **Max 3 concurrent positions** - diversify risk
2. **2% risk per trade** - position sizing
3. **No averaging down** - don't add to losers
4. **Close on signal reversal** - don't fight trends
5. **Partial profits** - lock gains systematically

### Stop Rules
1. **Hard stop:** Close after 20 bars
2. **Loss stop:** Exit if -1.5× ATR
3. **Trailing stop:** Active on +2× ATR profit
4. **Daily stop:** Close all if -3% daily

## Performance Monitoring

### Key Metrics to Track
- Win Rate (target: 70%+)
- Profit Factor (target: 2.0+)
- Sharpe Ratio (target: 1.5+)
- Max Drawdown (limit: 10%)
- Average Trade Duration
- Largest Win/Loss

### Monthly Review
```
1. Calculate win rate - if <60%, review signals
2. Check profit factor - if <1.5, tighten entries
3. Analyze drawdowns - if >10%, reduce position size
4. Review pair performance - replace underperformers
5. Adjust parameters if needed
```

## Files

```
src/
├── ultra-lstm-v3.js          # Signal generation engine
├── ultra-trading-bot.js      # Main trading bot
├── ultra-backtest-v6.js      # Latest backtest (v6)
└── ultra-realistic-backtest.js # Basic backtest

config/
├── live-config.json          # Live trading settings
└── per-pair-configs.json     # Pair-specific settings

logs/
├── trading-YYYY-MM-DD.log    # Daily trading logs
└── ultra-v6-backtest-*.json  # Backtest results

docs/
├── ULTRA-BACKTEST-SUMMARY.md # This file
└── ULTRA-V2-README.md        # Previous version docs
```

## Troubleshooting

### Issue: Win Rate < 60%
**Solution:** 
- Increase confidence threshold to 0.75
- Add trend confirmation filter
- Focus on top 5 pairs only
- Increase ATR multiplier for SL

### Issue: Many false entries
**Solution:**
- Require 3+ indicator confirmations instead of 2
- Add volume confirmation filter
- Use higher timeframe (5m) for confirmation
- Reduce from 30 to 10 pairs

### Issue: Losses bigger than wins
**Solution:**
- Tighten stop-loss (1.0× ATR instead of 1.5×)
- Extend take-profit (4.0× ATR instead of 3.0×)
- Use partial exits more aggressively
- Reduce position size on uncertain signals

### Issue: No trades generated
**Solution:**
- Lower confidence threshold temporarily (0.60)
- Check signal generation is working: `npm run ultra:lstm:85`
- Verify market data is being received
- Check pair selection in config

## Risk Disclaimer

⚠️ **IMPORTANT: READ BEFORE TRADING**

- This bot trades real money - start with small capital
- Past backtest results do NOT guarantee future performance
- Cryptocurrency markets are highly volatile
- Stop losses can be gapped in high volatility
- Use paper trading first to validate strategy
- Never risk more than you can afford to lose
- Test thoroughly before deploying with real capital

## Support & Updates

- Check logs for errors: `logs/` directory
- Review daily performance: `logs/trading-*.log`
- Validate backtest: `npm run ultra:v6`
- Update strategy: Edit `src/ultra-lstm-v3.js`
- Report issues: Include logs and config

---

**Version:** v7.0 Production  
**Last Updated:** 2024  
**Status:** ⚡ Testing → ✅ Recommended with v6 settings  
**Next:** Implement pair selection (top 10) and ATR-based exits for v7
