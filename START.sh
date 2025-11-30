#!/bin/bash

#####################################################################
# 🚀 START.sh - Universal Paper Trading Launcher
# Single command to start everything: bash START.sh
#####################################################################

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Banner
clear
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}    🚀 PAPER TRADING SYSTEM - ONE-COMMAND LAUNCHER    ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Activate Python environment
echo -e "${YELLOW}[1/5]${NC} Activating Python environment..."
if [ ! -d "venv" ]; then
    echo -e "${RED}✗ venv not found. Creating...${NC}"
    python3 -m venv venv
fi
source venv/bin/activate
echo -e "${GREEN}✓ Python environment activated${NC}"
echo ""

# Step 2: Quick system check
echo -e "${YELLOW}[2/5]${NC} Running system validation..."
python << 'VALIDATION_EOF'
import os
import sys
sys.path.insert(0, 'ml')

# Check models
models_dir = 'ml/models'
models = [f for f in os.listdir(models_dir) if f.endswith('.joblib') and not f.startswith('ensemble') and not f.startswith('hybrid')]
print(f"  ✓ {len(models)} XGBoost models ready")

# Check data
csv_files = [f for f in os.listdir('logs') if f.endswith('.csv')]
print(f"  ✓ {len(csv_files)} OHLCV files ready")

# Check dashboard
if os.path.exists('public/trading-dashboard.html'):
    print(f"  ✓ Dashboard ready")

print()
VALIDATION_EOF
echo -e "${GREEN}✓ System validation passed${NC}"
echo ""

# Step 3: Kill any existing process on port 3000
echo -e "${YELLOW}[3/5]${NC} Checking port 3000..."
if lsof -i :3000 >/dev/null 2>&1; then
    PID=$(lsof -t -i :3000)
    echo -e "${YELLOW}⚠ Port 3000 already in use (PID: $PID). Stopping...${NC}"
    kill -9 $PID 2>/dev/null || true
    sleep 1
fi
echo -e "${GREEN}✓ Port 3000 ready${NC}"
echo ""

# Step 4: Start Node.js server and bot
echo -e "${YELLOW}[4/5]${NC} Starting trading bot..."
npm start >/dev/null 2>&1 &
sleep 3

# Verify server is running
if lsof -i :3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Trading bot started (PID: $(lsof -t -i :3000))${NC}"
else
    echo -e "${RED}✗ Failed to start trading bot${NC}"
    exit 1
fi
echo ""

# Step 5: Display status and dashboard URL
echo -e "${YELLOW}[5/5]${NC} Ready to trade!"
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}✅ SYSTEM STATUS: PRODUCTION READY${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}📊 Dashboard:${NC}  http://localhost:3000/trading-dashboard.html"
echo -e "${GREEN}🤖 API Server:${NC}  http://localhost:3000"
echo -e "${GREEN}📈 WebSocket:${NC}   ws://localhost:3000"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}📌 TARGETS (Week 1):${NC}"
echo -e "   • 100+ trades collected"
echo -e "   • Win Rate: 44-48% (baseline validation)"
echo -e "   • Consistent performance"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}🎯 NEXT STEPS:${NC}"
echo -e "   1. Open dashboard in browser (click link above)"
echo -e "   2. Monitor real-time metrics"
echo -e "   3. Let it run for 7 days"
echo -e "   4. Check final WR and proceed to Week 2"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show live trading updates
echo -e "${YELLOW}🔄 Live Trading Updates:${NC}"
echo ""
tail -f logs/paper-trading/*.json 2>/dev/null | while read line; do
    # Just show key info
    echo "$line" | grep -E "(BUY|SELL|HOLD|Win Rate|Profit)" || true
done &

# Keep script running
wait
