#!/usr/bin/env python3
"""
summarize_retrain_results.py

Aggregate walk-forward retrain results and create final report.
"""
import os
import json
import pandas as pd
from pathlib import Path

def summarize_results():
    results_file = 'docs/ultra-v6-ml-results.md'
    if not os.path.exists(results_file):
        print(f"No results file found at {results_file}")
        return
    
    with open(results_file, 'r') as f:
        content = f.read()
    
    # Parse JSON from markdown
    json_start = content.find('{')
    json_str = content[json_start:]
    try:
        data = json.loads(json_str)
    except:
        print("Failed to parse JSON from results file")
        return
    
    # Aggregate per-pair
    summary = {}
    for pair, windows in data.items():
        if not isinstance(windows, list):
            continue
        
        total_trades = sum(w.get('trades', 0) for w in windows)
        total_wins = sum(w.get('wins', 0) for w in windows)
        total_losses = sum(w.get('losses', 0) for w in windows)
        avg_acc = sum(w.get('acc', 0) for w in windows) / len(windows) if windows else 0
        avg_prec = sum(w.get('precision', 0) for w in windows) / len(windows) if windows else 0
        
        win_rate = (total_wins / total_trades * 100) if total_trades > 0 else 0
        profit_windows = [w for w in windows if w.get('trades', 0) > 0]
        num_windows = len(windows)
        
        summary[pair] = {
            'total_trades': total_trades,
            'total_wins': total_wins,
            'total_losses': total_losses,
            'win_rate': win_rate,
            'avg_accuracy': avg_acc,
            'avg_precision': avg_prec,
            'num_windows': num_windows,
            'profitable_windows': len(profit_windows)
        }
    
    # Sort by win_rate
    sorted_pairs = sorted(summary.items(), key=lambda x: x[1]['win_rate'], reverse=True)
    
    # Create report
    report = "# ULTRA v6 ML Retrain Summary (Walk-Forward + Optuna HPO)\n\n"
    report += f"## Per-Pair Results (sorted by Win Rate)\n\n"
    report += "| Pair | Total Trades | Wins | Losses | Win Rate | Avg Acc | Avg Prec | Windows |\n"
    report += "|------|--------------|------|--------|----------|---------|----------|----------|\n"
    
    for pair, stats in sorted_pairs:
        report += f"| {pair} | {stats['total_trades']} | {stats['total_wins']} | {stats['total_losses']} | "
        report += f"{stats['win_rate']:.2f}% | {stats['avg_accuracy']:.3f} | {stats['avg_precision']:.3f} | "
        report += f"{stats['num_windows']} |\n"
    
    # Top performers
    report += "\n## Top Performers (Win Rate > 50%)\n\n"
    top = [p for p, s in sorted_pairs if s['win_rate'] > 50]
    if top:
        for pair in top[:10]:
            stats = summary[pair]
            report += f"- **{pair}**: WR={stats['win_rate']:.2f}% ({stats['total_wins']}/{stats['total_trades']} trades)\n"
    else:
        report += "- None (all pairs below 50% WR in walk-forward test)\n"
    
    # Overall stats
    total_all = sum(s['total_trades'] for s in summary.values())
    wins_all = sum(s['total_wins'] for s in summary.values())
    overall_wr = (wins_all / total_all * 100) if total_all > 0 else 0
    
    report += f"\n## Overall Portfolio Stats\n\n"
    report += f"- **Total Trades**: {total_all}\n"
    report += f"- **Total Wins**: {wins_all}\n"
    report += f"- **Overall Win Rate**: {overall_wr:.2f}%\n"
    report += f"- **Pairs Trained**: {len(summary)}\n"
    
    report += f"\n## Recommendations\n\n"
    if overall_wr > 50:
        report += f"✅ Overall win rate {overall_wr:.2f}% is above 50% breakeven.\n"
    else:
        report += f"⚠️ Overall win rate {overall_wr:.2f}% is below 50% breakeven. May need further tuning.\n"
    
    report += f"- Next steps: use top performers for live/paper trading\n"
    report += f"- Consider ensemble or further label engineering to boost WR\n"
    report += f"- Validate on out-of-sample data before live deployment\n"
    
    # Save report
    os.makedirs('docs', exist_ok=True)
    with open('docs/ultra-v6-retrain-summary.md', 'w') as f:
        f.write(report)
    
    print("✅ Summary report written to docs/ultra-v6-retrain-summary.md")
    print(f"\n📊 Key Metrics:")
    print(f"   Overall WR: {overall_wr:.2f}%")
    print(f"   Total Trades: {total_all}")
    print(f"   Top Pair: {sorted_pairs[0][0]} ({sorted_pairs[0][1]['win_rate']:.2f}% WR)")

if __name__ == '__main__':
    summarize_results()
