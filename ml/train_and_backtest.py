#!/usr/bin/env python3
"""
ml/train_and_backtest.py

Train per-pair XGBoost classifiers on price series (logs/<PAIR>.csv).
Label: next N samples return > threshold => 1 (win) else 0.
Evaluate with holdout and simple backtest to compute win rate.

Usage:
  python ml/train_and_backtest.py --pairs LTCUSDT,LINKUSDT --quick

Outputs:
  - saved models: ml/models/<PAIR>.joblib
  - per-pair results JSON: logs/ml-<PAIR>-results-<ts>.json
  - summary: docs/ultra-v6-ml-results.md
"""

import os
import sys
import argparse
import glob
import json
import time
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score
import xgboost as xgb
from joblib import dump
from optuna_hpo_utils import run_optuna_hpo
from advanced_features import build_advanced_features
from selective_features import build_selective_features


def load_price_csv(pair):
    p = os.path.join('logs', f'{pair}.csv')
    if not os.path.exists(p):
        return None
    df = pd.read_csv(p, parse_dates=['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    return df


def make_features(df, window=10):
    # df: timestamp,price OR timestamp,open,high,low,close,volume
    return build_advanced_features(df, window)


def make_labels(df, horizon=1, threshold=0.0):
    # label=1 if future return over horizon > threshold
    price = df['close'] if 'close' in df.columns else df['price']
    fut = price.shift(-horizon)
    ret = (fut - price) / price
    y = (ret > threshold).astype(int)
    y.iloc[-horizon:] = 0
    return y


def find_best_threshold(y_true, y_proba, df, p_index_offset=0, min_trades=5):
    # Evaluate thresholds to maximize win rate while keeping reasonable trade counts
    best = {'threshold': 0.6, 'win_rate': 0.0, 'trades': 0}
    price_col = 'close' if 'close' in df.columns else 'price'
    for thr in np.linspace(0.5, 0.95, 10):
        trades = 0
        wins = 0
        for idx, prob in enumerate(y_proba):
            if prob > thr:
                trades += 1
                p = idx + p_index_offset
                future_idx = min(p + 5, len(df)-1)
                if future_idx < len(df) and p < len(df):
                    if (df.iloc[future_idx][price_col] - df.iloc[p][price_col]) > 0:
                        wins += 1
        if trades >= min_trades:
            wr = wins / trades if trades > 0 else 0
            if wr > best['win_rate']:
                best = {'threshold': float(thr), 'win_rate': float(wr), 'trades': int(trades)}
    return best


def walk_forward_train_pair(pair, quick=False, window_size=5000, step_size=1000, hpo_trials=30):
    df = load_price_csv(pair)
    if df is None or len(df) < window_size:
        print(f"No/insufficient data for {pair}")
        return None

    results = []
    for start in range(0, len(df) - window_size, step_size):
        df_window = df.iloc[start:start+window_size].copy().reset_index(drop=True)
        X = make_features(df_window)
        y = make_labels(df_window, horizon=5, threshold=0.003)
        valid = ~y.isna()
        X = X[valid].copy().reset_index(drop=True)
        y = y[valid].copy().reset_index(drop=True)
        if len(X) < 100: continue
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, shuffle=False)
        # HPO
        best_params, best_score = run_optuna_hpo(X_train, y_train, X_val, y_val, n_trials=hpo_trials)
        clf = xgb.XGBClassifier(**best_params)
        clf.fit(X_train, y_train)
        y_pred = clf.predict(X_val)
        y_proba = clf.predict_proba(X_val)[:,1]
        acc = accuracy_score(y_val, y_pred)
        prec = precision_score(y_val, y_pred, zero_division=0)
        rec = recall_score(y_val, y_pred, zero_division=0)
        df_val = df_window.iloc[X_val.index].copy()
        best = find_best_threshold(y_val.values, y_proba, df_val, p_index_offset=0, min_trades=10)
        trades = best['trades']
        wins = int(best['win_rate'] * trades) if trades > 0 else 0
        losses = trades - wins
        win_rate = best['win_rate'] * 100 if trades > 0 else 0.0
        chosen_threshold = best['threshold']
        results.append({
            'window_start': start,
            'window_end': start+window_size,
            'acc': float(acc),
            'precision': float(prec),
            'recall': float(rec),
            'trades': int(trades),
            'wins': int(wins),
            'losses': int(losses),
            'win_rate': float(win_rate),
            'threshold': float(chosen_threshold) if trades>0 else None,
            'best_params': best_params,
            'best_score': best_score
        })
    # Save last model
    if results:
        os.makedirs('ml/models', exist_ok=True)
        model_path = f'ml/models/{pair}.joblib'
        dump(clf, model_path)
    ts = int(time.time())
    os.makedirs('logs', exist_ok=True)
    with open(f'logs/ml-{pair}-walkforward-{ts}.json', 'w') as f:
        json.dump(results, f, indent=2)
    return results
    df = load_price_csv(pair)
    if df is None or len(df) < 50:
        print(f"No/insufficient data for {pair}")
        return None

    X = make_features(df)
    y = make_labels(df, horizon=5, threshold=0.003)

    # drop tail where labels=nan
    valid = ~y.isna()
    X = X[valid].copy()
    y = y[valid].copy()

    test_size = 0.2 if not quick else 0.4
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, shuffle=False)

    # simple xgboost classifier
    # handle class imbalance
    pos = int(y_train.sum())
    neg = len(y_train) - pos
    scale_pos_weight = 1.0
    if pos > 0:
        scale_pos_weight = max(1.0, neg / max(1.0, pos))

    clf = xgb.XGBClassifier(n_estimators=100 if not quick else 30, max_depth=4, use_label_encoder=False, eval_metric='logloss', scale_pos_weight=scale_pos_weight)
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)[:,1]

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)

    # simple backtest: search for a threshold that maximizes win rate (subject to minimum trades)
    df_test = df.iloc[X_test.index]
    best = find_best_threshold(y_test.values, y_proba, df, p_index_offset=0, min_trades=3)
    trades = best['trades']
    wins = int(best['win_rate'] * trades) if trades > 0 else 0
    losses = trades - wins
    win_rate = best['win_rate'] * 100 if trades > 0 else 0.0
    chosen_threshold = best['threshold']

    # save model
    os.makedirs('ml/models', exist_ok=True)
    model_path = f'ml/models/{pair}.joblib'
    dump(clf, model_path)

    res = {
        'pair': pair,
        'n_samples': len(df),
        'acc': float(acc),
        'precision': float(prec),
        'recall': float(rec),
        'trades': int(trades),
        'wins': int(wins),
        'losses': int(losses),
        'win_rate': float(win_rate),
        'threshold': float(chosen_threshold) if trades>0 else None,
        'model_path': model_path
    }

    # write per-pair result
    ts = int(time.time())
    os.makedirs('logs', exist_ok=True)
    with open(f'logs/ml-{pair}-results-{ts}.json', 'w') as f:
        json.dump(res, f, indent=2)

    return res


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pairs', type=str, default='LTCUSDT,LINKUSDT,FTMUSDT,TONUSDT,DOGEUSDT')
    parser.add_argument('--quick', action='store_true')
    parser.add_argument('--horizon', type=int, default=1, help='label horizon in samples (default 1)')
    parser.add_argument('--label-threshold', type=float, default=0.0, help='label threshold for positive class (default 0.0)')
    args = parser.parse_args()

    pairs = [p.strip() for p in args.pairs.split(',') if p.strip()]
    results = {}
    for pair in pairs:
        print(f'Walk-forward training & HPO for {pair}')
        r = walk_forward_train_pair(pair, quick=args.quick, window_size=5000, step_size=1000, hpo_trials=30)
        results[pair] = r

    # write summary
    os.makedirs('docs', exist_ok=True)
    with open('docs/ultra-v6-ml-results.md', 'w') as f:
        f.write('# ULTRA v6 ML per-pair results\n\n')
        f.write(json.dumps(results, indent=2))

    print('Done. Summary written to docs/ultra-v6-ml-results.md')


if __name__ == '__main__':
    main()
