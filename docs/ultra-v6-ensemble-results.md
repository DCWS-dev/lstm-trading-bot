# ULTRA v6 Ensemble Results (XGBoost + LightGBM + CatBoost)

Generated: 2025-11-29 09:20:42

## Configuration
- **Models**: XGBoost + LightGBM + CatBoost (Voting - Average Probabilities)
- **Features**: 7 proven basic indicators (r1, r5, r10, ma5, ma10, ma_ratio, vol, std5)
- **Validation**: Walk-forward (5k windows, 1k step)
- **Params**: Manual tuning, no Optuna for simplicity/speed

## Results

**OVERALL: 27.27% WR (42/154)**
Pairs > 50%: 0/29

| Rank | Pair | Trades | Wins | Win Rate | Status |
|------|------|--------|------|----------|--------|
|  1 | BNBUSDT      |     32 |     9 |  28.12% | ⚠️ |
|  2 | ETHUSDT      |    122 |    33 |  27.05% | ⚠️ |
|  3 | BTCUSDT      |      0 |     0 |   0.00% | ⚠️ |
