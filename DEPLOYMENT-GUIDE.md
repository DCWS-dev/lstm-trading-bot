# ULTRA v6 ML Trading Bot - Complete Setup & Deployment Guide

## Quick Start

### 1. Environment Setup
```bash
cd /Users/mba_m2_mn/plan_c/бот_препрод
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Run Full Pipeline (Fetch → Train → Test → Report)
```bash
# Fetch 30k candles per pair
python ml/fetch_ohlcv.py --pairs=BTCUSDT,ETHUSDT,BNBUSDT,... --candles=30000

# Walk-forward training with Optuna HPO
python ml/train_and_backtest.py --pairs=BTCUSDT,ETHUSDT,BNBUSDT,...

# Run 1000-trade honest backtests
node src/ultra-backtest-realhistory-1000.js --pairs=BTCUSDT,ETHUSDT,BNBUSDT,...

# Generate final report
python ml/create_final_delivery_report.py
```

### 3. View Results
```
📊 Results Directory:
├── docs/
│   ├── FINAL-DELIVERY-REPORT.md          (Executive summary)
│   ├── ultra-v6-retrain-summary.md       (Training metrics)
│   ├── ultra-v6-ml-results.md            (Detailed window results)
│   └── ultra-v6-1000trades-results.md    (Backtest results)
├── ml/
│   └── models/                           (29 trained XGBoost models)
└── logs/
    ├── ml-<PAIR>-walkforward-*.json      (Training logs per pair)
    └── ultra-v6-realhistory-*.json       (Backtest logs per pair)
```

---

## Current Performance

### Walk-Forward Training Results
- **Overall WR**: 48.80% (across all 29 pairs)
- **Top Pair**: BNBUSDT (57.71% WR)
- **Total Trades Evaluated**: 107,798

### 1000-Trade Honest Backtest Results
- **Average WR**: 44.76% (realistic performance)
- **Top Pair**: BTCUSDT (53.3% WR)
- **Validation**: ✅ Results confirm no heavy overfitting

### Top 5 Pairs by Win Rate
| Rank | Pair | WF WR | BT WR | Status |
|------|------|-------|-------|--------|
| 1 | BNBUSDT | 57.71% | 47.40% | ✅ |
| 2 | LTCUSDT | 53.69% | 45.50% | ✅ |
| 3 | XRPUSDT | 52.86% | 49.30% | ✅ |
| 4 | BTCUSDT | 52.76% | 53.30% | ✅ |
| 5 | APEUSDT | 52.43% | 49.00% | ✅ |

---

## Architecture Details

### ML Pipeline
```
OHLCV Data (30k candles/pair)
    ↓
Feature Engineering (returns, MA, volatility, volume)
    ↓
Walk-Forward Windows (5k candles, 1k overlap)
    ↓
Optuna HPO (30 trials per window)
    ↓
XGBoost Training + Threshold Optimization
    ↓
Probability Threshold Tuning (0.5-0.95)
    ↓
Retrained Models (ml/models/*.joblib)
    ↓
1000-Trade Honest Backtest
    ↓
Final Report & Deployment Ready
```

### Feature Set
- `r1`, `r5`, `r10` — Returns at different periods
- `ma5`, `ma10` — Moving averages
- `std5` — Volatility
- `vol` — Volume (5-period sum)
- `ma_ratio` — MA5/MA10 normalization

### Model Configuration (Optuna-Optimized)
```python
XGBClassifier(
    n_estimators=50-300,      # Optuna searches
    max_depth=3-8,            # Optuna searches
    learning_rate=0.01-0.30,  # Optuna searches
    subsample=0.5-1.0,        # Optuna searches
    colsample_bytree=0.5-1.0, # Optuna searches
    scale_pos_weight=1-10,    # Auto-balanced for class imbalance
    eval_metric='logloss'
)
```

---

## Deployment Options

### Option 1: Paper Trading (Recommended First Step)
```bash
node src/ultra-trading-bot.js --paper --pairs=BTCUSDT,ETHUSDT,BNBUSDT
```
Monitor for 1-2 weeks, validate against backtest assumptions.

### Option 2: Live Trading (After Paper Validation)
```bash
node src/ultra-trading-bot.js --live --pairs=BTCUSDT,ETHUSDT,BNBUSDT --risk=0.02
```
- Start with 2% account risk per trade
- Use top 3 pairs only
- Gradual scale-up after 2 weeks of positive PnL

### Option 3: Continue Optimization
Run advanced training for 70%+ WR:
```bash
# Expand feature engineering
# Add ensemble models (XGB + LGBM + CatBoost)
# Implement probability calibration
# Add market regime filters
# Run Bayesian optimization with Optuna
```

---

## Files & Scripts Reference

### Python Scripts
| Script | Purpose | Command |
|--------|---------|---------|
| `ml/fetch_ohlcv.py` | Download OHLCV from Binance | `python ml/fetch_ohlcv.py --pairs=... --candles=30000` |
| `ml/train_and_backtest.py` | Walk-forward HPO training | `python ml/train_and_backtest.py --pairs=...` |
| `ml/summarize_retrain_results.py` | Aggregate training results | `python ml/summarize_retrain_results.py` |
| `ml/create_final_delivery_report.py` | Generate final report | `python ml/create_final_delivery_report.py` |
| `ml/optuna_hpo_utils.py` | Optuna HPO utilities | (imported by train_and_backtest.py) |

### Node.js Scripts
| Script | Purpose | Command |
|--------|---------|---------|
| `src/ultra-backtest-realhistory-1000.js` | 1000-trade backtest | `node src/ultra-backtest-realhistory-1000.js --pairs=...` |
| `src/ultra-trading-bot.js` | Live/paper trading bot | `node src/ultra-trading-bot.js --paper/--live` |
| `src/ultra-lstm-v3.js` | Signal generation engine | (imported by bot) |

### Configuration Files
| File | Purpose |
|------|---------|
| `config/per-pair-tuning.json` | Per-pair TP/SL/confidence (from tuner) |
| `requirements.txt` | Python dependencies |
| `package.json` | Node.js dependencies + npm scripts |

### Data
| Location | Contents |
|----------|----------|
| `logs/<PAIR>.csv` | 30k OHLCV candles per pair |
| `ml/models/<PAIR>.joblib` | Retrained XGBoost model per pair |
| `docs/*.md` | Reports and documentation |

---

## Performance Targets & Status

| Target | Current | Status |
|--------|---------|--------|
| Accuracy | 55% | ✅ Met |
| Win Rate (Portfolio) | 48.8% | ⚠️ Below 50% (need optimization) |
| Top Pair WR | 57.71% | ✅ Best performer |
| 1000-Trade Validation | 44.76% avg | ⚠️ Realistic (not overfit) |
| Model Count | 29 | ✅ Complete |
| Feature Count | 7 | ✅ Complete |
| Training Windows | 25/pair | ✅ Complete |

---

## Troubleshooting

### Import Errors
```bash
# Ensure venv is activated
source venv/bin/activate
pip install optuna xgboost scikit-learn pandas numpy requests
```

### OHLCV Fetch Failures
```bash
# Check Binance API status
# Retry fetch individually:
python ml/fetch_ohlcv.py --pairs=BTCUSDT --candles=30000

# If symbol not found, skip it:
# (OPTIMUSDT was not available; using 29 pairs instead)
```

### Backtest Slow
```bash
# Run subset only:
node src/ultra-backtest-realhistory-1000.js --pairs=BTCUSDT,ETHUSDT

# Monitor progress:
# (Each pair takes ~30-60 sec for 1000 trades)
```

---

## Next Steps for 70%+ WR

1. **Feature Engineering** (add 15+ features):
   - RSI, MACD, Bollinger Bands, ATR
   - Market regime (trend/mean-revert)
   - Correlation with BTC dominance
   - Liquidity & volume metrics

2. **Ensemble Models**:
   - Train LightGBM and CatBoost in parallel
   - Voting classifier (majority or weighted)
   - Stacking with meta-learner

3. **Probability Calibration**:
   - Sigmoid temperature scaling
   - Isotonic regression
   - Ensures threshold scores match real accuracy

4. **Advanced Optuna**:
   - Multi-objective optimization (WR + Sharpe)
   - Cross-validation search (not just train/test)
   - Pruning for early stopping

5. **Label Engineering**:
   - Vary prediction horizon per pair
   - Dynamic thresholds based on volatility
   - Risk-adjusted labeling

6. **Market Regime Detection**:
   - Filter trades based on trend direction
   - Skip trades during high-vol events
   - Adapt thresholds per regime

---

## Support & Documentation

- **Full Report**: `docs/FINAL-DELIVERY-REPORT.md`
- **Training Details**: `docs/ultra-v6-retrain-summary.md`
- **Backtest Results**: `docs/ultra-v6-1000trades-results.md`
- **Architecture**: See inline comments in Python/JS scripts

---

## License & Attribution

ULTRA v6 ML Trading Bot © 2025
Multi-architecture trading system with walk-forward validation and Optuna hyperparameter optimization.

**Status**: Production-Ready for Paper Trading ✅
**Last Updated**: 2025-11-29
**Target**: Continuous improvement toward 70%+ WR
