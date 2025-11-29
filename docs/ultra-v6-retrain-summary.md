# ULTRA v6 ML Retrain Summary (Walk-Forward + Optuna HPO)

## Per-Pair Results (sorted by Win Rate)

| Pair | Total Trades | Wins | Losses | Win Rate | Avg Acc | Avg Prec | Windows |
|------|--------------|------|--------|----------|---------|----------|----------|
| BNBUSDT | 603 | 348 | 255 | 57.71% | 0.877 | 0.206 | 25 |
| LTCUSDT | 1313 | 705 | 608 | 53.69% | 0.633 | 0.183 | 25 |
| XRPUSDT | 3710 | 1961 | 1749 | 52.86% | 0.609 | 0.212 | 25 |
| BTCUSDT | 1215 | 641 | 574 | 52.76% | 0.919 | 0.233 | 25 |
| APEUSDT | 3166 | 1660 | 1506 | 52.43% | 0.487 | 0.148 | 25 |
| CHZUSDT | 1235 | 635 | 600 | 51.42% | 0.701 | 0.252 | 25 |
| SOLUSDT | 2278 | 1161 | 1117 | 50.97% | 0.683 | 0.199 | 25 |
| ETHUSDT | 3367 | 1714 | 1653 | 50.91% | 0.699 | 0.163 | 25 |
| SUIUSDT | 5400 | 2697 | 2703 | 49.94% | 0.492 | 0.233 | 25 |
| ADAUSDT | 3382 | 1688 | 1694 | 49.91% | 0.659 | 0.244 | 25 |
| FILUSDT | 4422 | 2201 | 2221 | 49.77% | 0.290 | 0.190 | 25 |
| DOGEUSDT | 1632 | 806 | 826 | 49.39% | 0.701 | 0.190 | 25 |
| LUNCUSDT | 4058 | 1979 | 2079 | 48.77% | 0.478 | 0.152 | 25 |
| MATICUSDT | 3597 | 1749 | 1848 | 48.62% | 0.706 | 0.180 | 25 |
| DOTUSDT | 4066 | 1976 | 2090 | 48.60% | 0.483 | 0.162 | 25 |
| OPUSDT | 5380 | 2611 | 2769 | 48.53% | 0.400 | 0.168 | 25 |
| UNIUSDT | 8609 | 4168 | 4441 | 48.41% | 0.349 | 0.196 | 25 |
| FTMUSDT | 9797 | 4743 | 5054 | 48.41% | 0.360 | 0.178 | 25 |
| ARBUSDT | 4583 | 2217 | 2366 | 48.37% | 0.525 | 0.194 | 25 |
| FLOKIUSDT | 4934 | 2382 | 2552 | 48.28% | 0.533 | 0.272 | 25 |
| TONUSDT | 2550 | 1227 | 1323 | 48.12% | 0.612 | 0.191 | 25 |
| ATOMUSDT | 5052 | 2402 | 2650 | 47.55% | 0.491 | 0.215 | 25 |
| NEARUSDT | 5922 | 2777 | 3145 | 46.89% | 0.369 | 0.204 | 25 |
| ALGOUSDT | 2657 | 1228 | 1429 | 46.22% | 0.535 | 0.233 | 25 |
| AVAXUSDT | 1788 | 821 | 967 | 45.92% | 0.746 | 0.226 | 25 |
| LINKUSDT | 5809 | 2664 | 3145 | 45.86% | 0.435 | 0.180 | 25 |
| PEPEUSDT | 2393 | 1069 | 1324 | 44.67% | 0.373 | 0.191 | 25 |
| SHIBUSDT | 2882 | 1201 | 1681 | 41.67% | 0.598 | 0.168 | 25 |
| THETAUSDT | 1998 | 772 | 1226 | 38.64% | 0.587 | 0.190 | 25 |

## Top Performers (Win Rate > 50%)

- **BNBUSDT**: WR=57.71% (348/603 trades)
- **LTCUSDT**: WR=53.69% (705/1313 trades)
- **XRPUSDT**: WR=52.86% (1961/3710 trades)
- **BTCUSDT**: WR=52.76% (641/1215 trades)
- **APEUSDT**: WR=52.43% (1660/3166 trades)
- **CHZUSDT**: WR=51.42% (635/1235 trades)
- **SOLUSDT**: WR=50.97% (1161/2278 trades)
- **ETHUSDT**: WR=50.91% (1714/3367 trades)

## Overall Portfolio Stats

- **Total Trades**: 107798
- **Total Wins**: 52203
- **Overall Win Rate**: 48.43%
- **Pairs Trained**: 29

## Recommendations

⚠️ Overall win rate 48.43% is below 50% breakeven. May need further tuning.
- Next steps: use top performers for live/paper trading
- Consider ensemble or further label engineering to boost WR
- Validate on out-of-sample data before live deployment
