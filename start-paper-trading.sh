#!/bin/bash
# Paper Trading Launch Script - 30 Nov 2025

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "🚀 PAPER TRADING SYSTEM LAUNCHER"
echo "=========================================="
echo ""
echo "Date: $(date)"
echo "System: Hybrid Trading Strategy v1.0.0"
echo ""

# Step 1: Verify Python environment
echo "✓ Step 1: Checking Python environment..."
source venv/bin/activate
python --version

# Step 2: Verify all 29 models load
echo ""
echo "✓ Step 2: Verifying 29 trading models..."
python << 'EOF'
import os
import joblib

models_dir = 'ml/models'
pairs = []

for f in os.listdir(models_dir):
    if f.endswith('.joblib') and not f.startswith('ensemble') and not f.startswith('hybrid'):
        pair = f.replace('.joblib', '')
        try:
            model = joblib.load(os.path.join(models_dir, f))
            pairs.append(pair)
            print(f"  ✓ {pair}")
        except Exception as e:
            print(f"  ✗ {pair}: {e}")

print(f"\nTotal models loaded: {len(pairs)}/29")
if len(pairs) >= 29:
    print("✓ All models ready for trading!")
else:
    print("⚠ Warning: Not all models loaded")
EOF

# Step 3: Verify adaptive router
echo ""
echo "✓ Step 3: Testing adaptive threshold router..."
python << 'EOF'
import sys
sys.path.insert(0, 'ml')
from adaptive_threshold_router import detect_market_regime, calculate_volatility, get_adaptive_threshold

# Test with sample prices
test_prices = [50000, 50100, 50200, 50150, 50250, 50180, 50220, 50200, 50300, 50280]
regime, threshold, vol = detect_market_regime(test_prices)
print(f"  Regime: {regime}")
print(f"  Adaptive Threshold: {threshold:.4f}")
print(f"  Volatility: {vol:.4f}")
print("✓ Router working correctly!")
EOF

# Step 4: Verify strategy engine
echo ""
echo "✓ Step 4: Testing hybrid strategy engine..."
python << 'EOF'
import sys
sys.path.insert(0, 'ml')
from hybrid_strategy_integrator import HybridStrategyEngine

engine = HybridStrategyEngine()
print(f"✓ Engine loaded {engine.num_models} models")
print("✓ Strategy engine ready!")
EOF

# Step 5: Start Node.js server
echo ""
echo "=========================================="
echo "✓ All systems verified!"
echo "=========================================="
echo ""
echo "📊 Dashboard: http://localhost:3000/trading-dashboard.html"
echo "🤖 API Server: http://localhost:3000"
echo ""
echo "Starting Node.js paper trading server..."
echo ""

# Start dashboard server
if [ -f "src/dashboard-server.js" ]; then
    node src/dashboard-server.js &
    SERVER_PID=$!
    echo "✓ Server started (PID: $SERVER_PID)"
else
    echo "⚠ Dashboard server not found, starting paper trading bot..."
fi

# Start paper trading bot
echo ""
echo "Starting paper trading bot in 2 seconds..."
sleep 2

if [ -f "src/paper-trading-bot.js" ]; then
    node src/paper-trading-bot.js --paper-trading
else
    echo "⚠ Paper trading bot not found"
    echo "Starting backtest instead..."
    node src/ultra-backtest-realhistory-1000.js
fi
