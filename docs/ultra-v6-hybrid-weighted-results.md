# ULTRA v6 Hybrid Weighted Ensemble Results

Generated: 2025-11-29 09:25:41

## Configuration
- **Strategy**: Weighted Voting Ensemble (XGBoost + LightGBM + CatBoost)
- **Weight Learning**: Per-pair validation AUC-based
- **Features**: 7 proven basic indicators
- **Validation**: Walk-forward (5k windows, 1k step)
- **Goal**: Learn which model is best per pair, weight accordingly

## Results

**OVERALL: 28.57% WR (42/147)**
Pairs > 50%: 0/29

| Rank | Pair | Trades | Wins | Win Rate | XGB Wgt | LGB Wgt | CB Wgt | Status |
|------|------|--------|------|----------|---------|---------|--------|--------|
|  1 | BNBUSDT      |     21 |     7 |  33.33% | 0.328 | 0.328 | 0.343 | ⚠️ |
|  2 | ETHUSDT      |    126 |    35 |  27.78% | 0.329 | 0.332 | 0.339 | ⚠️ |
|  3 | BTCUSDT      |      0 |     0 |   0.00% | 0.327 | 0.330 | 0.343 | ⚠️ |

## Analysis

### Model Weight Distribution

Which models are most trusted per pair:
- BNBUSDT     : w_cb (0.343)
- BTCUSDT     : w_cb (0.343)
- ETHUSDT     : w_cb (0.339)
