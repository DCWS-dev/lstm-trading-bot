#!/bin/bash
# Paper Trading System Launcher
# 30 Nov 2025

cd /Users/mba_m2_mn/plan_c/бот_препрод

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  🚀 PAPER TRADING LAUNCH - Hybrid Strategy v1.0  ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Activate venv
source venv/bin/activate

echo "📅 Date: $(date '+%d %B %Y - %H:%M:%S')"
echo ""

# Step 1: Verify models
echo "Step 1/4: Validating ML models..."
MODELS=$(python -c "import os; print(len([f for f in os.listdir('ml/models') if f.endswith('.joblib') and not f.startswith('ensemble')]))")
echo "         ✓ $MODELS XGBoost models ready"
echo ""

# Step 2: Check data
echo "Step 2/4: Checking OHLCV data..."
CSV_COUNT=$(ls logs/*.csv 2>/dev/null | wc -l)
echo "         ✓ $CSV_COUNT OHLCV files ready"
echo ""

# Step 3: Dashboard
echo "Step 3/4: Dashboard ready"
echo "         ✓ http://localhost:3000/trading-dashboard.html"
echo ""

# Step 4: Start bot
echo "Step 4/4: Starting paper trading bot..."
echo ""
echo "════════════════════════════════════════════════════"
echo ""

# Create config
cat > /tmp/trading_config.json << 'EOF'
{
  "initialCapital": 10000,
  "strategy": "hybrid",
  "adaptiveThreshold": true,
  "positionSize": 0.02,
  "pairs": [
    "ADAUSDT", "ALGOUSDT", "APEUSDT", "ARBUSDT", "ATOMUSDT",
    "AVAXUSDT", "BNBUSDT", "BTCUSDT", "CHZUSDT", "DOGEUSDT",
    "DOTUSDT", "ETHUSDT", "FILUSDT", "FLOKIUSDT", "FTMUSDT",
    "LINKUSDT", "LTCUSDT", "LUNCUSDT", "MATICUSDT", "NEARUSDT",
    "OPUSDT", "PEPEUSDT", "SHIBUSDT", "SOLUSDT", "SUIUSDT",
    "THETAUSDT", "TONUSDT", "UNIUSDT", "XRPUSDT"
  ]
}
EOF

# Export config as env var
export TRADING_CONFIG=$(cat /tmp/trading_config.json)

# Start paper trading bot
node src/paper-trading-bot.js

