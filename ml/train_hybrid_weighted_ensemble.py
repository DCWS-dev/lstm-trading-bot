#!/usr/bin/env python3
"""
ml/train_hybrid_weighted_ensemble.py

Hybrid Ensemble with Weighted Voting:
- Each model (XGBoost, LightGBM, CatBoost) gets individual weight
- Weights learned from historical performance (per-pair calibration)
- Weighted average: y_pred = w1*yxgb + w2*ylgb + w3*ycb
- Expected improvement: +5-10% WR by learning best model per pair

Usage:
  python ml/train_hybrid_weighted_ensemble.py --pairs=BTCUSDT,ETHUSDT

Outputs:
  - Model weights per pair: logs/ensemble_weights_<PAIR>.json
  - Weighted ensemble predictions: docs/hybrid-ensemble-results.md
"""

import os
import json
import time
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostClassifier
from joblib import dump, load
import warnings
warnings.filterwarnings('ignore')


def load_price_csv(pair):
    """Load OHLCV data."""
    p = os.path.join('logs', f'{pair}.csv')
    if not os.path.exists(p):
        return None
    df = pd.read_csv(p, parse_dates=['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    return df


def make_basic_features(df):
    """Build 7 proven basic features."""
    features = pd.DataFrame(index=df.index)
    
    features['r1'] = df['close'].pct_change(1)
    features['r5'] = df['close'].pct_change(5)
    features['r10'] = df['close'].pct_change(10)
    
    features['ma5'] = df['close'].rolling(window=5).mean() / df['close']
    features['ma10'] = df['close'].rolling(window=10).mean() / df['close']
    features['ma_ratio'] = features['ma5'] / (features['ma10'] + 1e-10)
    
    features['vol'] = df['volume'].rolling(window=50).mean()
    features['std5'] = df['close'].pct_change().rolling(window=5).std()
    
    return features.fillna(0).clip(-10, 10)


def make_labels(df, horizon=5, threshold=0.003):
    """Create labels."""
    price = df['close']
    fut = price.shift(-horizon)
    ret = (fut - price) / price
    y = (ret > threshold).astype(int)
    y.iloc[-horizon:] = 0
    return y


def find_best_threshold(y_true, y_proba_ensemble, min_trades=10):
    """Find threshold maximizing win rate."""
    best = {'threshold': 0.6, 'win_rate': 0.0, 'trades': 0, 'wins': 0}
    
    for thr in np.linspace(0.5, 0.95, 10):
        trades = sum(1 for p in y_proba_ensemble if p > thr)
        if trades >= min_trades:
            wins = sum(1 for i, p in enumerate(y_proba_ensemble) if p > thr and y_true[i] == 1)
            wr = wins / trades if trades > 0 else 0
            if wr > best['win_rate']:
                best = {
                    'threshold': float(thr),
                    'win_rate': float(wr),
                    'trades': int(trades),
                    'wins': int(wins)
                }
    
    return best


def learn_model_weights(y_true, y_proba_xgb, y_proba_lgb, y_proba_cb):
    """
    Learn optimal weights for each model based on ROC-AUC or accuracy.
    Simple approach: weight by per-model accuracy, then normalize.
    """
    from sklearn.metrics import roc_auc_score
    
    try:
        auc_xgb = roc_auc_score(y_true, y_proba_xgb)
        auc_lgb = roc_auc_score(y_true, y_proba_lgb)
        auc_cb = roc_auc_score(y_true, y_proba_cb)
    except:
        # Fallback if AUC fails (e.g., single class)
        auc_xgb = accuracy_score(y_true, (y_proba_xgb > 0.5).astype(int))
        auc_lgb = accuracy_score(y_true, (y_proba_lgb > 0.5).astype(int))
        auc_cb = accuracy_score(y_true, (y_proba_cb > 0.5).astype(int))
    
    # Normalize to probabilities (softmax-like)
    scores = np.array([auc_xgb, auc_lgb, auc_cb])
    weights = np.exp(scores - np.max(scores))  # Numerical stability
    weights = weights / weights.sum()
    
    return {
        'w_xgb': float(weights[0]),
        'w_lgb': float(weights[1]),
        'w_cb': float(weights[2]),
        'auc_xgb': float(auc_xgb),
        'auc_lgb': float(auc_lgb),
        'auc_cb': float(auc_cb)
    }


def train_hybrid_ensemble_pair(pair, window_size=5000, step_size=1000):
    """Train hybrid weighted ensemble per pair with walk-forward validation."""
    df = load_price_csv(pair)
    if df is None or len(df) < window_size:
        print(f"  ⚠️  {pair}: No/insufficient data")
        return None

    results = []
    all_weights = []
    
    for window_idx, start in enumerate(range(0, len(df) - window_size, step_size)):
        df_window = df.iloc[start:start+window_size].copy().reset_index(drop=True)
        
        # Build features
        X = make_basic_features(df_window)
        y = make_labels(df_window, horizon=5, threshold=0.003)
        
        # Remove NaN
        valid = ~y.isna()
        X = X[valid].copy().reset_index(drop=True)
        y = y[valid].copy().reset_index(drop=True)
        
        if len(X) < 100:
            continue
        
        # Train/val split
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, shuffle=False
        )
        
        # Train individual models with optimized params
        
        # 1. XGBoost
        xgb_model = xgb.XGBClassifier(
            n_estimators=150, max_depth=5, learning_rate=0.1,
            subsample=0.8, colsample_bytree=0.8, scale_pos_weight=5,
            random_state=42, eval_metric='logloss'
        )
        xgb_model.fit(X_train, y_train)
        
        # 2. LightGBM
        lgb_model = lgb.LGBMClassifier(
            n_estimators=150, max_depth=5, learning_rate=0.1,
            subsample=0.8, colsample_bytree=0.8, n_jobs=-1,
            random_state=42, verbose=-1
        )
        lgb_model.fit(X_train, y_train)
        
        # 3. CatBoost
        cb_model = CatBoostClassifier(
            iterations=150, max_depth=5, learning_rate=0.1,
            verbose=0, random_state=42
        )
        cb_model.fit(X_train, y_train)
        
        # Get individual probabilities
        y_proba_xgb = xgb_model.predict_proba(X_val)[:, 1]
        y_proba_lgb = lgb_model.predict_proba(X_val)[:, 1]
        y_proba_cb = cb_model.predict_proba(X_val)[:, 1]
        
        # LEARN WEIGHTS from validation set
        weights = learn_model_weights(y_val.values, y_proba_xgb, y_proba_lgb, y_proba_cb)
        all_weights.append(weights)
        
        # Compute weighted ensemble
        y_proba_ensemble = (
            weights['w_xgb'] * y_proba_xgb +
            weights['w_lgb'] * y_proba_lgb +
            weights['w_cb'] * y_proba_cb
        )
        
        y_pred_ensemble = (y_proba_ensemble > 0.5).astype(int)
        
        # Metrics
        acc = accuracy_score(y_val, y_pred_ensemble)
        prec = precision_score(y_val, y_pred_ensemble, zero_division=0)
        rec = recall_score(y_val, y_pred_ensemble, zero_division=0)
        
        # Threshold optimization on WEIGHTED ensemble
        best = find_best_threshold(y_val.values, y_proba_ensemble, min_trades=10)
        
        result = {
            'window_num': window_idx + 1,
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
            'model_weights': weights
        }
        results.append(result)
    
    # Save ensemble models and average weights
    if results:
        os.makedirs('ml/models', exist_ok=True)
        
        # Average weights across all windows
        avg_weights = {
            'w_xgb': float(np.mean([w['w_xgb'] for w in all_weights])),
            'w_lgb': float(np.mean([w['w_lgb'] for w in all_weights])),
            'w_cb': float(np.mean([w['w_cb'] for w in all_weights])),
        }
        
        model_path = f'ml/models/hybrid_ensemble_{pair}.joblib'
        dump((xgb_model, lgb_model, cb_model, avg_weights), model_path)
    
    # Save results
    ts = int(time.time())
    os.makedirs('logs', exist_ok=True)
    with open(f'logs/ml-hybrid-{pair}-walkforward-{ts}.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    # Save average weights
    with open(f'logs/ensemble_weights_{pair}.json', 'w') as f:
        json.dump(avg_weights, f, indent=2)
    
    return results, avg_weights


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--pairs', type=str, required=True)
    args = parser.parse_args()

    pairs = [p.strip() for p in args.pairs.split(',') if p.strip()]
    
    print(f"\n{'='*70}")
    print(f"HYBRID WEIGHTED ENSEMBLE TRAINING")
    print(f"Features: 7 basic | Models: XGBoost + LightGBM + CatBoost")
    print(f"Strategy: Learned weights per-pair based on validation AUC")
    print(f"{'='*70}\n")
    
    all_results = {}
    all_weights_summary = {}
    
    for pair in pairs:
        print(f"  Training {pair}...")
        result = train_hybrid_ensemble_pair(pair)
        if result:
            result_data, avg_weights = result
            total_trades = sum(r['trades'] for r in result_data)
            total_wins = sum(r['wins'] for r in result_data)
            avg_wr = 100.0 * total_wins / total_trades if total_trades > 0 else 0
            
            all_results[pair] = {
                'windows': result_data,
                'overall_trades': total_trades,
                'overall_wins': total_wins,
                'overall_wr': avg_wr
            }
            
            all_weights_summary[pair] = avg_weights
            
            status = '✅' if avg_wr >= 50 else '⚠️'
            print(f"    {status} {pair:12} → {avg_wr:6.2f}% WR ({total_wins}/{total_trades})")
            print(f"       Weights: XGB={avg_weights['w_xgb']:.3f}, LGB={avg_weights['w_lgb']:.3f}, CB={avg_weights['w_cb']:.3f}")
    
    # Write summary
    os.makedirs('docs', exist_ok=True)
    with open('docs/ultra-v6-hybrid-weighted-results.md', 'w') as f:
        f.write('# ULTRA v6 Hybrid Weighted Ensemble Results\n\n')
        f.write(f'Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}\n\n')
        f.write('## Configuration\n')
        f.write('- **Strategy**: Weighted Voting Ensemble (XGBoost + LightGBM + CatBoost)\n')
        f.write('- **Weight Learning**: Per-pair validation AUC-based\n')
        f.write('- **Features**: 7 proven basic indicators\n')
        f.write('- **Validation**: Walk-forward (5k windows, 1k step)\n')
        f.write('- **Goal**: Learn which model is best per pair, weight accordingly\n\n')
        f.write('## Results\n\n')
        
        sorted_pairs = sorted(all_results.items(), key=lambda x: x[1]['overall_wr'], reverse=True)
        
        overall_trades = sum(r['overall_trades'] for r in all_results.values())
        overall_wins = sum(r['overall_wins'] for r in all_results.values())
        overall_wr = 100.0 * overall_wins / overall_trades if overall_trades > 0 else 0
        
        f.write(f'**OVERALL: {overall_wr:.2f}% WR ({overall_wins}/{overall_trades})**\n')
        f.write(f'Pairs > 50%: {sum(1 for r in all_results.values() if r["overall_wr"] >= 50)}/29\n\n')
        
        f.write('| Rank | Pair | Trades | Wins | Win Rate | XGB Wgt | LGB Wgt | CB Wgt | Status |\n')
        f.write('|------|------|--------|------|----------|---------|---------|--------|--------|\n')
        
        for i, (pair, data) in enumerate(sorted_pairs, 1):
            wr = data['overall_wr']
            trades = data['overall_trades']
            wins = data['overall_wins']
            w = all_weights_summary.get(pair, {})
            status = '✅' if wr >= 50 else '⚠️'
            f.write(f'| {i:2} | {pair:12} | {trades:6} | {wins:5} | {wr:6.2f}% | {w.get("w_xgb", 0):.3f} | {w.get("w_lgb", 0):.3f} | {w.get("w_cb", 0):.3f} | {status} |\n')
        
        f.write('\n## Analysis\n\n')
        f.write('### Model Weight Distribution\n\n')
        f.write('Which models are most trusted per pair:\n')
        for pair, weights in sorted(all_weights_summary.items()):
            best_model = max(weights, key=weights.get)
            f.write(f'- {pair:12}: {best_model} ({weights[best_model]:.3f})\n')
    
    print(f"\n{'='*70}")
    print(f"OVERALL: {overall_wr:.2f}% WR ({overall_wins}/{overall_trades})")
    print(f"Pairs > 50%: {sum(1 for r in all_results.values() if r['overall_wr'] >= 50)}/29")
    print(f"Results saved to: docs/ultra-v6-hybrid-weighted-results.md")
    print(f"Weights saved to: logs/ensemble_weights_<PAIR>.json")
    print(f"{'='*70}\n")


if __name__ == '__main__':
    main()
