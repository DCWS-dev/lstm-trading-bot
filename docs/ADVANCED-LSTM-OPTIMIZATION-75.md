
══════════════════════════════════════════════════════════════════════
🎯 ADVANCED LSTM OPTIMIZATION RESULTS (TARGET: 75%)
══════════════════════════════════════════════════════════════════════

📊 TOP 3 CONFIGURATIONS:
──────────────────────────────────────────────────────────────────────

1. Fitness: 87.20% | Accuracy: 93.39%
   Parameters:
   • Hidden Units: 103 (optimal ~128)
   • LSTM Layers: 1.6489392666410136 (optimal 2-3)
   • Learning Rate: 0.021865 (optimal ~0.02)
   • Epochs: 39
   • Batch Size: 10.202375216147631
   • Dropout: 0.131 (optimal 0.15-0.35)
   • L2 Regularization: 0.002332
   • Momentum Beta: 0.840
   • Bidirectional: NO
   • Attention Heads: 2
   • Residual Connections: NO
   • Sequence Length: 20
   • Gradient Clip: 1.526

   Stability: 75.0% | Speed Score: 70.5%

2. Fitness: 87.05% | Accuracy: 95.00%
   Parameters:
   • Hidden Units: 120 (optimal ~128)
   • LSTM Layers: 1.9518149212818596 (optimal 2-3)
   • Learning Rate: 0.031468 (optimal ~0.02)
   • Epochs: 43
   • Batch Size: 12.33782873366019
   • Dropout: 0.182 (optimal 0.15-0.35)
   • L2 Regularization: 0.003155
   • Momentum Beta: 0.857
   • Bidirectional: NO
   • Attention Heads: 2
   • Residual Connections: NO
   • Sequence Length: 22
   • Gradient Clip: 1.865

   Stability: 75.0% | Speed Score: 62.0%

3. Fitness: 87.04% | Accuracy: 94.30%
   Parameters:
   • Hidden Units: 114 (optimal ~128)
   • LSTM Layers: 1.795742841588297 (optimal 2-3)
   • Learning Rate: 0.026042 (optimal ~0.02)
   • Epochs: 40
   • Batch Size: 11.344011820467928
   • Dropout: 0.150 (optimal 0.15-0.35)
   • L2 Regularization: 0.002615
   • Momentum Beta: 0.849
   • Bidirectional: NO
   • Attention Heads: 2
   • Residual Connections: NO
   • Sequence Length: 21
   • Gradient Clip: 1.742

   Stability: 75.0% | Speed Score: 65.2%

──────────────────────────────────────────────────────────────────────
📈 OPTIMIZATION PROGRESS:
──────────────────────────────────────────────────────────────────────

Gen  1: █████████████████████████████████████    93.39%

──────────────────────────────────────────────────────────────────────
💡 RECOMMENDATIONS FOR 75% ACCURACY:
──────────────────────────────────────────────────────────────────────

1. Use configuration #1 as base
2. Key factors for improvement:
   • Ensure bidirectional LSTM is enabled (❌ ENABLE IT)
   • Use 2-3 LSTM layers (current: 1.6489392666410136)
   • Fine-tune learning rate around 0.02 (current: 0.0219)
   • Consider attention mechanism (current heads: 2)
   • Train for 50-100 epochs minimum (current: 39)
   • Use residual connections for deeper networks
3. Ensemble approach: Combine multiple configurations for robustness
4. Data augmentation: More historical data improves accuracy
5. Per-pair tuning: Adjust parameters for specific pairs

══════════════════════════════════════════════════════════════════════
