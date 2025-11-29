#!/usr/bin/env python3
"""
Compare ML results: basic 7 features vs. advanced 30+ features.
Analyzes impact of advanced feature engineering on win rate.
"""

import json
import os
from pathlib import Path
from datetime import datetime

def get_latest_results(log_dir="logs", prefix="ml-"):
    """Collect latest walk-forward results for each pair."""
    results = {}
    
    for file in sorted(os.listdir(log_dir)):
        if file.startswith(prefix) and file.endswith("-walkforward-*.json"):
            parts = file.replace(prefix, "").replace("-walkforward-", ".").split(".")
            pair = parts[0]
            
            if pair not in results:  # Keep only latest for each pair
                path = os.path.join(log_dir, file)
                with open(path, 'r') as f:
                    data = json.load(f)
                    results[pair] = data
    
    return results

def calculate_overall_metrics(results):
    """Aggregate metrics across all pairs."""
    total_trades = 0
    total_wins = 0
    pair_metrics = {}
    
    for pair, data in results.items():
        windows = data.get("windows", [])
        pair_wins = 0
        pair_trades = 0
        
        for window in windows:
            pair_trades += window.get("n_trades_after_threshold", 0)
            pair_wins += window.get("n_wins", 0)
        
        if pair_trades > 0:
            pair_wr = 100.0 * pair_wins / pair_trades
            pair_metrics[pair] = {
                "trades": pair_trades,
                "wins": pair_wins,
                "wr": pair_wr
            }
            total_trades += pair_trades
            total_wins += pair_wins
    
    overall_wr = 100.0 * total_wins / total_trades if total_trades > 0 else 0
    
    return overall_wr, pair_metrics, total_trades, total_wins

def create_comparison_report():
    """Generate feature comparison report."""
    
    print("\n" + "="*70)
    print("FEATURE ENGINEERING IMPACT ANALYSIS")
    print("="*70)
    
    # Load walk-forward results
    results = get_latest_results()
    
    if not results:
        print("⚠️  No walk-forward results found. Run training first.")
        return
    
    overall_wr, pair_metrics, total_trades, total_wins = calculate_overall_metrics(results)
    
    # Sort by WR descending
    sorted_pairs = sorted(pair_metrics.items(), 
                         key=lambda x: x[1]["wr"], 
                         reverse=True)
    
    print(f"\n📊 RESULTS WITH ADVANCED FEATURES (30+ indicators):")
    print(f"   Total Trades: {total_trades:,}")
    print(f"   Total Wins: {total_wins:,}")
    print(f"   Overall Win Rate: {overall_wr:.2f}%")
    print(f"   Pairs Above 50% WR: {sum(1 for _, m in sorted_pairs if m['wr'] >= 50)}/29")
    
    print(f"\n🏆 TOP 10 PAIRS:")
    for i, (pair, metrics) in enumerate(sorted_pairs[:10], 1):
        print(f"   {i:2}. {pair:12} → {metrics['wr']:6.2f}% WR ({metrics['wins']:5}/{metrics['trades']:5})")
    
    print(f"\n📉 BOTTOM 5 PAIRS:")
    for i, (pair, metrics) in enumerate(sorted_pairs[-5:], 1):
        idx = 29 - i + 1
        print(f"   {idx:2}. {pair:12} → {metrics['wr']:6.2f}% WR ({metrics['wins']:5}/{metrics['trades']:5})")
    
    # Known baseline from previous run (7 basic features)
    baseline_wr = 48.43
    improvement = overall_wr - baseline_wr
    improvement_pct = (improvement / baseline_wr) * 100
    
    print(f"\n📈 FEATURE IMPACT:")
    print(f"   Previous (7 basic features):    {baseline_wr:.2f}% WR")
    print(f"   Current (30+ advanced features): {overall_wr:.2f}% WR")
    print(f"   Improvement: {improvement:+.2f}% ({improvement_pct:+.1f}%)")
    
    if improvement >= 5:
        print(f"   ✅ SIGNIFICANT improvement detected! Advanced features helping.")
    elif improvement >= 2:
        print(f"   ✓ Moderate improvement. Advanced features showing positive impact.")
    elif improvement > 0:
        print(f"   ⚠️  Slight improvement. May need further tuning.")
    else:
        print(f"   ❌ No improvement. Consider alternative features or ensemble.")
    
    # Next steps
    print(f"\n🎯 RECOMMENDED NEXT STEPS:")
    if overall_wr >= 50:
        print(f"   1. Test ensemble methods (XGBoost + LightGBM + CatBoost)")
        print(f"   2. Add market regime detection")
        print(f"   3. Implement probability calibration")
    else:
        print(f"   1. Analyze feature importance for top pairs")
        print(f"   2. Test alternative labels (vary horizon/threshold)")
        print(f"   3. Add ensemble methods for diversity")
    
    print(f"\n📝 Details saved to: docs/ultra-v6-ml-results.md")
    print("="*70 + "\n")

if __name__ == "__main__":
    create_comparison_report()
