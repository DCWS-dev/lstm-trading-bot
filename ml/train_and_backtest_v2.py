#!/usr/bin/env python3
"""
ml/train_and_backtest_v2.py

Train per-pair XGBoost classifiers with SELECTIVE features (15 best indicators).
Label: next N samples return > threshold => 1 (win) else 0.
Walk-forward validation with Optuna HPO.

Usage:
  python ml/train_and_backtest_v2.py --pairs=BTCUSDT,ETHUSDT

Outputs:
  - models: ml/models/<PAIR>.joblib
  - results: logs/ml-<PAIR>-walkforward-<ts>.json
  - summary: docs/ultra-v6-ml-results.md
"""

import os
import sys
import argparse
import json
import time
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score
import xgboost as xgb
from joblib import dump
from optuna_hpo_utils import run_optuna_hpo
from selective_features import build_selective_features


def load_price_csv(pair):
    """Load OHLCV data for pair."""
    p = os.path.join('logs', f'{pair}.csv')
    if not os.path.exists(p):
        return None
    df = pd.read_csv(p, parse_dates=['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    return df


def make_features(df, window=50):
    """Build 15 selective features (8 basic + 6 advanced + 1 derived)."""
    return build_selective_features(df, window)


def make_labels(df, horizon=5, threshold=0.003):
    """Create binary labels: 1 if future return > threshold."""
    price = df['close'] if 'close' in df.columns else df['price']
    fut = price.shift(-horizon)
    ret = (fut - price) / price
    y = (ret > threshold).astype(int)
    y.iloc[-horizon:] = 0
    return y


def find_best_threshold(y_true, y_proba, df, min_trades=10):
    """Find probability threshold that maximizes win rate."""
    best = {'threshold': 0.6, 'win_rate': 0.0, 'trades': 0, 'wins': 0}
    price_col = 'close' if 'close' in df.columns else 'price'
    
    for thr in np.linspace(0.5, 0.95, 10):
        trades = 0
        wins = 0
        for idx, prob in enumerate(y_proba):
            if prob > thr:
                trades += 1
                # Check if label indicates win
                if y_true[idx] == 1:
                    wins += 1
        
        if trades >= min_trades:
            wr = wins / trades if trades > 0 else 0
            if wr > best['win_rate']:
                best = {
                    'threshold': float(thr),
                    'win_rate': float(wr),
                    'trades': int(trades),
                    'wins': int(wins)
                }
    
    return best


def walk_forward_train_pair(pair, window_size=5000, step_size=1000, hpo_trials=30):
    """Train pair with walk-forward validation and Optuna HPO."""
    df = load_price_csv(pair)
    if df is None or len(df) < window_size:
        print(f"  ⚠️ No/insufficient data for {pair}")
        return None

    results = []
    window_num = 0
    
    for start in range(0, len(df) - window_size, step_size):
        window_num += 1
        df_window = df.iloc[start:start+window_size].copy().reset_index(drop=True)
        
        # Build features
        X = make_features(df_window)
        y = make_labels(df_window, horizon=5, threshold=0.003)
        
        # Remove NaN rows
        valid = ~y.isna()
        X = X[valid].copy().reset_index(drop=True)
        y = y[valid].copy().reset_index(drop=True)
        
        if len(X) < 100:
            continue
        
        # Train/val split (80/20, no shuffle for time series)
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, shuffle=False
        )
        
        # Optuna HPO
        best_params, best_score = run_optuna_hpo(
            X_train, y_train, X_val, y_val, n_trials=hpo_trials
        )
        
        # Train final model
        clf = xgb.XGBClassifier(**best_params)
        clf.fit(X_train, y_train)
        
        # Evaluate
        y_pred = clf.predict(X_val)
        y_proba = clf.predict_proba(X_val)[:, 1]
        
        acc = accuracy_score(y_val, y_pred)
        prec = precision_score(y_val, y_pred, zero_division=0)
        rec = recall_score(y_val, y_pred, zero_division=0)
        
        # Threshold optimization
        best = find_best_threshold(y_val.values, y_proba, df_window, min_trades=10)
        
        result = {
            'window_num': int(window_num),
            'window_start': int(start),
            'window_end': int(start + window_size),
            'acc': float(acc),
            'precision': float(prec),
            'recall': float(rec),
            'trades': int(best['trades']),
            'wins': int(best['wins']),
            'losses': int(best['trades'] - best['wins']),
            'win_rate': float(best['win_rate'] * 100),
            'threshold': float(best['threshold']),
            'best_params': best_params,
            'best_score': float(best_score)
        }
        results.append(result)
    
    # Save model (last window)
    if results:
        os.makedirs('ml/models', exist_ok=True)
        model_path = f'ml/models/{pair}.joblib'
        dump(clf, model_path)
    
    # Save results
    ts = int(time.time())
    os.makedirs('logs', exist_ok=True)
    with open(f'logs/ml-{pair}-walkforward-{ts}.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pairs', type=str, required=True)
    args = parser.parse_args()

    pairs = [p.strip() for p in args.pairs.split(',') if p.strip()]
    
    print(f"\n{'='*70}")
    print(f"TRAINING WITH SELECTIVE FEATURES (15 indicators: 8 basic + 6 advanced)")
    print(f"{'='*70}\n")
    
    all_results = {}
    
    for pair in pairs:
        print(f"  Training {pair}...")
        result = walk_forward_train_pair(pair, window_size=5000, step_size=1000, hpo_trials=30)
        if result:
            # Aggregate metrics
            total_trades = sum(r['trades'] for r in result)
            total_wins = sum(r['wins'] for r in result)
            avg_wr = 100.0 * total_wins / total_trades if total_trades > 0 else 0
            
            all_results[pair] = {
                'windows': result,
                'overall_trades': total_trades,
                'overall_wins': total_wins,
                'overall_wr': avg_wr
            }
            print(f"    ✅ {pair:12} → Overall WR: {avg_wr:6.2f}% ({total_wins}/{total_trades})")
    
    # Write summary
    os.makedirs('docs', exist_ok=True)
    with open('docs/ultra-v6-selective-ml-results.md', 'w') as f:
        f.write('# ULTRA v6 ML Training - Selective Features (15 indicators)\n\n')
        f.write(f'Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}\n\n')
        f.write('## Features Used\n')
        f.write('- Basic (8): r1, r5, r10, ma5, ma10, ma_ratio, vol, std5\n')
        f.write('- Advanced (6): RSI(14), MACD, Bollinger Bands, ATR, Stochastic, ADX\n')
        f.write('- Derived (1): momentum, trend_strength\n\n')
        f.write('## Per-Pair Results\n\n')
        
        # Sort by WR
        sorted_pairs = sorted(
            all_results.items(),
            key=lambda x: x[1]['overall_wr'],
            reverse=True
        )
        
        overall_total_trades = sum(r['overall_trades'] for r in all_results.values())
        overall_total_wins = sum(r['overall_wins'] for r in all_results.values())
        overall_wr = 100.0 * overall_total_wins / overall_total_trades if overall_total_trades > 0 else 0
        
        f.write(f'**Overall: {overall_wr:.2f}% WR ({overall_total_wins}/{overall_total_trades})**\n\n')
        f.write('| Rank | Pair | Trades | Wins | Win Rate |\n')
        f.write('|------|------|--------|------|----------|\n')
        
        for i, (pair, data) in enumerate(sorted_pairs, 1):
            wr = data['overall_wr']
            trades = data['overall_trades']
            wins = data['overall_wins']
            status = '✅' if wr >= 50 else '⚠️'
            f.write(f'| {i:2} | {pair:12} | {trades:6} | {wins:5} | {wr:6.2f}% {status} |\n')
        
        f.write(f'\n\nFull results: {json.dumps(all_results, indent=2)}\n')
    
    print(f"\n{'='*70}")
    print(f"OVERALL: {overall_wr:.2f}% WR ({overall_total_wins}/{overall_total_trades})")
    print(f"Pairs > 50%: {sum(1 for r in all_results.values() if r['overall_wr'] >= 50)}/29")
    print(f"Results saved to: docs/ultra-v6-selective-ml-results.md")
    print(f"{'='*70}\n")


if __name__ == '__main__':
    main()
