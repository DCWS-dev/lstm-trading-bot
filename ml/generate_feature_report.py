#!/usr/bin/env python3
"""
Create comprehensive feature comparison report.
Shows baseline (7 features) vs. advanced (30+ features) performance.
"""

import json
import os
from pathlib import Path
from datetime import datetime

def load_historical_metrics():
    """Load baseline metrics from previous runs."""
    # These are from the previous training session (7 basic features)
    baseline_data = {
        "method": "Walk-Forward with 7 Basic Features",
        "date": "2025-11-29 08:00",
        "overall_wr": 48.43,
        "total_trades": 107798,
        "total_wins": 52203,
        "pairs_above_50": 8,
        "top_5": [
            ("BNBUSDT", 57.71),
            ("LTCUSDT", 53.69),
            ("XRPUSDT", 52.86),
            ("BTCUSDT", 52.76),
            ("APEUSDT", 52.43)
        ],
        "notes": "7 basic features: r1, r5, r10, ma5, ma10, ma_ratio, vol, std5"
    }
    return baseline_data

def get_latest_results_by_pair():
    """Get latest walk-forward results for each pair (newest file)."""
    results = {}
    log_dir = "logs"
    
    # Group files by pair
    pair_files = {}
    for file in os.listdir(log_dir):
        if file.startswith("ml-") and file.endswith(".json") and "walkforward" in file:
            # Extract pair name: ml-PAIR-walkforward-TIMESTAMP.json
            parts = file.replace("ml-", "").replace(".json", "").split("-walkforward-")
            if len(parts) == 2:
                pair = parts[0]
                timestamp = int(parts[1])
                
                if pair not in pair_files or timestamp > pair_files[pair][0]:
                    pair_files[pair] = (timestamp, file)
    
    # Load latest file for each pair
    for pair, (ts, filename) in pair_files.items():
        filepath = os.path.join(log_dir, filename)
        try:
            with open(filepath, 'r') as f:
                results[pair] = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load {filename}: {e}")
    
    return results

def calculate_pair_metrics(pair_results):
    """Calculate aggregated metrics for a pair from walk-forward windows."""
    total_wins = 0
    total_trades = 0
    
    # pair_results is a list of window results
    if isinstance(pair_results, list):
        windows = pair_results
    else:
        windows = pair_results.get("windows", [])
    
    for window in windows:
        if isinstance(window, dict):
            total_trades += window.get("trades", 0)
            total_wins += window.get("wins", 0)
    
    wr = 100.0 * total_wins / total_trades if total_trades > 0 else 0
    return {"trades": total_trades, "wins": total_wins, "wr": wr}

def create_feature_comparison_report():
    """Generate comprehensive feature comparison report."""
    
    # Load baseline
    baseline = load_historical_metrics()
    
    # Load current advanced features results
    current_results = get_latest_results_by_pair()
    
    if not current_results:
        print("⚠️  No advanced feature results found yet. Still training?")
        return
    
    # Calculate current metrics
    pair_metrics = {}
    total_trades = 0
    total_wins = 0
    
    for pair, data in current_results.items():
        metrics = calculate_pair_metrics(data)
        pair_metrics[pair] = metrics
        total_trades += metrics["trades"]
        total_wins += metrics["wins"]
    
    current_wr = 100.0 * total_wins / total_trades if total_trades > 0 else 0
    
    # Generate report
    report = []
    report.append("# Feature Engineering Comparison Report\n")
    report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    report.append("\n---\n")
    
    # Comparison table
    report.append("## Performance Comparison\n\n")
    report.append("| Metric | 7 Basic Features | 30+ Advanced Features | Change |\n")
    report.append("|--------|------------------|----------------------|--------|\n")
    
    wr_change = current_wr - baseline["overall_wr"]
    wr_pct_change = (wr_change / baseline["overall_wr"]) * 100 if baseline["overall_wr"] > 0 else 0
    
    report.append(f"| Win Rate | {baseline['overall_wr']:.2f}% | {current_wr:.2f}% | **{wr_change:+.2f}%** ({wr_pct_change:+.1f}%) |\n")
    report.append(f"| Total Trades | {baseline['total_trades']:,} | {total_trades:,} | {total_trades - baseline['total_trades']:+,} |\n")
    report.append(f"| Pairs > 50% WR | {baseline['pairs_above_50']} | {sum(1 for m in pair_metrics.values() if m['wr'] >= 50)} | {sum(1 for m in pair_metrics.values() if m['wr'] >= 50) - baseline['pairs_above_50']:+d} |\n\n")
    
    # Detailed results
    report.append("## Detailed Per-Pair Analysis\n\n")
    
    sorted_pairs = sorted(pair_metrics.items(), key=lambda x: x[1]["wr"], reverse=True)
    
    report.append("### Top 15 Performers\n\n")
    report.append("| Rank | Pair | Trades | Wins | Win Rate | Status |\n")
    report.append("|------|------|--------|------|----------|--------|\n")
    
    for i, (pair, metrics) in enumerate(sorted_pairs[:15], 1):
        status = "✅" if metrics["wr"] >= 50 else "⚠️"
        report.append(f"| {i:2} | {pair:12} | {metrics['trades']:6} | {metrics['wins']:5} | {metrics['wr']:6.2f}% | {status} |\n")
    
    report.append("\n### Bottom 5 Performers\n\n")
    report.append("| Rank | Pair | Trades | Wins | Win Rate |\n")
    report.append("|------|------|--------|------|----------|\n")
    
    for i, (pair, metrics) in enumerate(sorted_pairs[-5:], 1):
        rank = 29 - i + 1
        report.append(f"| {rank:2} | {pair:12} | {metrics['trades']:6} | {metrics['wins']:5} | {metrics['wr']:6.2f}% |\n")
    
    report.append("\n---\n")
    
    # Summary
    report.append("## Analysis Summary\n\n")
    
    if wr_change >= 3:
        impact = "✅ **EXCELLENT** - Advanced features showing strong positive impact!"
    elif wr_change >= 1:
        impact = "✓ **GOOD** - Advanced features contributing to performance improvement"
    elif wr_change >= -1:
        impact = "⚠️ **MARGINAL** - Similar to baseline, needs further optimization"
    else:
        impact = "❌ **NEGATIVE** - Baseline features performing better, consider reverting"
    
    report.append(f"### Feature Impact: {impact}\n\n")
    
    report.append(f"- **Absolute Improvement**: {wr_change:+.2f}% ({wr_pct_change:+.1f}%)\n")
    report.append(f"- **Current Overall Win Rate**: {current_wr:.2f}%\n")
    report.append(f"- **Pairs Achieving >50% WR**: {sum(1 for m in pair_metrics.values() if m['wr'] >= 50)} out of 29\n")
    report.append(f"- **Total Backtested Trades**: {total_trades:,}\n\n")
    
    # Features used
    report.append("### Features Comparison\n\n")
    report.append("**7 Basic Features:**\n")
    report.append("- Return metrics: r1, r5, r10\n")
    report.append("- Moving averages: ma5, ma10, ma_ratio\n")
    report.append("- Volatility: vol, std5\n\n")
    
    report.append("**30+ Advanced Features:**\n")
    report.append("- RSI (periods: 7, 14)\n")
    report.append("- MACD (line, signal, histogram)\n")
    report.append("- Bollinger Bands (upper, middle, lower, bandwidth, position)\n")
    report.append("- ATR (14), Stochastic (K, D), CCI (20), Williams %R (14)\n")
    report.append("- ROC (12), Momentum (10), ADX (14), OBV\n")
    report.append("- Price position, trend indicators, normalized close\n")
    report.append("- Returns, moving averages, volatility metrics\n\n")
    
    # Recommendations
    report.append("### Recommended Next Steps\n\n")
    
    if current_wr >= 50:
        report.append("1. **Implement Ensemble Models**: Combine XGBoost with LightGBM and CatBoost\n")
        report.append("2. **Add Market Regime Detection**: Bullish/bearish/ranging filters\n")
        report.append("3. **Probability Calibration**: Apply temperature scaling\n")
        report.append("4. **Deploy for Paper Trading**: Test on real-time data\n\n")
    elif current_wr >= 48:
        report.append("1. **Analyze Feature Importance**: Determine which indicators drive decisions\n")
        report.append("2. **Label Engineering**: Vary prediction horizon and return thresholds\n")
        report.append("3. **Ensemble Methods**: Combine multiple models for robustness\n")
        report.append("4. **Hyperparameter Refinement**: Increase Optuna trials\n\n")
    else:
        report.append("1. **Revisit Feature Selection**: Some advanced features may be noisy\n")
        report.append("2. **Test Hybrid Approach**: Combine best of both feature sets\n")
        report.append("3. **Increase Training Data**: Fetch more historical candles\n")
        report.append("4. **Market Filtering**: Focus on stable pairs\n\n")
    
    # Footer
    report.append(f"---\n")
    report.append(f"*Report generated automatically. Baseline from {baseline['date']}*\n")
    
    # Write report
    report_path = "docs/FEATURE-COMPARISON-REPORT.md"
    with open(report_path, 'w') as f:
        f.writelines(report)
    
    print(f"✅ Feature comparison report created: {report_path}")
    print(f"\n📊 QUICK SUMMARY:")
    print(f"   Baseline (7 features):   {baseline['overall_wr']:.2f}% WR")
    print(f"   Advanced (30+ features): {current_wr:.2f}% WR")
    print(f"   Improvement:             {wr_change:+.2f}% ({wr_pct_change:+.1f}%)")
    print(f"   Pairs > 50% WR:          {sum(1 for m in pair_metrics.values() if m['wr'] >= 50)} / 29")

if __name__ == "__main__":
    create_feature_comparison_report()
