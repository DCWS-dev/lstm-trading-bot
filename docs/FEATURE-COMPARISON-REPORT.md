# Feature Engineering Comparison Report
Generated: 2025-11-29 08:59:52

---
## Performance Comparison

| Metric | 7 Basic Features | 30+ Advanced Features | Change |
|--------|------------------|----------------------|--------|
| Win Rate | 48.43% | 48.31% | **-0.12%** (-0.2%) |
| Total Trades | 107,798 | 106,303 | -1,495 |
| Pairs > 50% WR | 8 | 8 | +0 |

## Detailed Per-Pair Analysis

### Top 15 Performers

| Rank | Pair | Trades | Wins | Win Rate | Status |
|------|------|--------|------|----------|--------|
|  1 | BNBUSDT      |    345 |   198 |  57.39% | ✅ |
|  2 | XRPUSDT      |   2162 |  1146 |  53.01% | ✅ |
|  3 | BTCUSDT      |   1215 |   641 |  52.76% | ✅ |
|  4 | APEUSDT      |   3166 |  1660 |  52.43% | ✅ |
|  5 | CHZUSDT      |   1235 |   635 |  51.42% | ✅ |
|  6 | SOLUSDT      |   2278 |  1161 |  50.97% | ✅ |
|  7 | ETHUSDT      |   3367 |  1714 |  50.91% | ✅ |
|  8 | LTCUSDT      |   1624 |   823 |  50.68% | ✅ |
|  9 | SUIUSDT      |   5400 |  2697 |  49.94% | ⚠️ |
| 10 | ADAUSDT      |   3382 |  1688 |  49.91% | ⚠️ |
| 11 | FILUSDT      |   4422 |  2201 |  49.77% | ⚠️ |
| 12 | DOGEUSDT     |   1632 |   806 |  49.39% | ⚠️ |
| 13 | LUNCUSDT     |   4058 |  1979 |  48.77% | ⚠️ |
| 14 | MATICUSDT    |   3597 |  1749 |  48.62% | ⚠️ |
| 15 | DOTUSDT      |   4066 |  1976 |  48.60% | ⚠️ |

### Bottom 5 Performers

| Rank | Pair | Trades | Wins | Win Rate |
|------|------|--------|------|----------|
| 29 | AVAXUSDT     |   1788 |   821 |  45.92% |
| 28 | LINKUSDT     |   5809 |  2664 |  45.86% |
| 27 | PEPEUSDT     |   2393 |  1069 |  44.67% |
| 26 | SHIBUSDT     |   2882 |  1201 |  41.67% |
| 25 | THETAUSDT    |   1998 |   772 |  38.64% |

---
## Analysis Summary

### Feature Impact: ⚠️ **MARGINAL** - Similar to baseline, needs further optimization

- **Absolute Improvement**: -0.12% (-0.2%)
- **Current Overall Win Rate**: 48.31%
- **Pairs Achieving >50% WR**: 8 out of 29
- **Total Backtested Trades**: 106,303

### Features Comparison

**7 Basic Features:**
- Return metrics: r1, r5, r10
- Moving averages: ma5, ma10, ma_ratio
- Volatility: vol, std5

**30+ Advanced Features:**
- RSI (periods: 7, 14)
- MACD (line, signal, histogram)
- Bollinger Bands (upper, middle, lower, bandwidth, position)
- ATR (14), Stochastic (K, D), CCI (20), Williams %R (14)
- ROC (12), Momentum (10), ADX (14), OBV
- Price position, trend indicators, normalized close
- Returns, moving averages, volatility metrics

### Recommended Next Steps

1. **Analyze Feature Importance**: Determine which indicators drive decisions
2. **Label Engineering**: Vary prediction horizon and return thresholds
3. **Ensemble Methods**: Combine multiple models for robustness
4. **Hyperparameter Refinement**: Increase Optuna trials

---
*Report generated automatically. Baseline from 2025-11-29 08:00*
