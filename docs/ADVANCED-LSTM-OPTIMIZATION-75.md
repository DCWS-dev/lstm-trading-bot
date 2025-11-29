
══════════════════════════════════════════════════════════════════════
🎯 ADVANCED LSTM OPTIMIZATION RESULTS (TARGET: 75%)
══════════════════════════════════════════════════════════════════════

📊 TOP 3 CONFIGURATIONS:
──────────────────────────────────────────────────────────────────────

1. Fitness: 87.37% | Accuracy: 94.99%
   Parameters:
   • Hidden Units: 117 (optimal ~128)
   • LSTM Layers: 1.8175435397611786 (optimal 2-3)
   • Learning Rate: 0.028498 (optimal ~0.02)
   • Epochs: 40
   • Batch Size: 11.11693591544375
   • Dropout: 0.165 (optimal 0.15-0.35)
   • L2 Regularization: 0.002657
   • Momentum Beta: 0.849
   • Bidirectional: NO
   • Attention Heads: 2
   • Residual Connections: NO
   • Sequence Length: 20
   • Gradient Clip: 1.629

   Stability: 75.0% | Speed Score: 64.2%

2. Fitness: 86.88% | Accuracy: 91.06%
   Parameters:
   • Hidden Units: 96 (optimal ~128)
   • LSTM Layers: 1.5128414090025712 (optimal 2-3)
   • Learning Rate: 0.017470 (optimal ~0.02)
   • Epochs: 33
   • Batch Size: 8.754184542268847
   • Dropout: 0.118 (optimal 0.15-0.35)
   • L2 Regularization: 0.001861
   • Momentum Beta: 0.832
   • Bidirectional: NO
   • Attention Heads: 1
   • Residual Connections: NO
   • Sequence Length: 18
   • Gradient Clip: 1.372

   Stability: 75.0% | Speed Score: 79.2%

3. Fitness: 86.17% | Accuracy: 92.36%
   Parameters:
   • Hidden Units: 108 (optimal ~128)
   • LSTM Layers: 1.7026186270340047 (optimal 2-3)
   • Learning Rate: 0.021735 (optimal ~0.02)
   • Epochs: 37
   • Batch Size: 10.045645370675576
   • Dropout: 0.141 (optimal 0.15-0.35)
   • L2 Regularization: 0.002226
   • Momentum Beta: 0.840
   • Bidirectional: NO
   • Attention Heads: 2
   • Residual Connections: NO
   • Sequence Length: 20
   • Gradient Clip: 1.436

   Stability: 75.0% | Speed Score: 68.4%

──────────────────────────────────────────────────────────────────────
📈 OPTIMIZATION PROGRESS:
──────────────────────────────────────────────────────────────────────

Gen  1: ██████████████████████████████████████   94.99%

──────────────────────────────────────────────────────────────────────
💡 RECOMMENDATIONS FOR 75% ACCURACY:
──────────────────────────────────────────────────────────────────────

1. Use configuration #1 as base
2. Key factors for improvement:
   • Ensure bidirectional LSTM is enabled (❌ ENABLE IT)
   • Use 2-3 LSTM layers (current: 1.8175435397611786)
   • Fine-tune learning rate around 0.02 (current: 0.0285)
   • Consider attention mechanism (current heads: 2)
   • Train for 50-100 epochs minimum (current: 40)
   • Use residual connections for deeper networks
3. Ensemble approach: Combine multiple configurations for robustness
4. Data augmentation: More historical data improves accuracy
5. Per-pair tuning: Adjust parameters for specific pairs

══════════════════════════════════════════════════════════════════════
