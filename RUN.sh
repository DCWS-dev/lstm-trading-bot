#!/bin/bash

##############################################################################
# 🚀 RUN.sh - ГЛАВНАЯ КОМАНДА для запуска всей системы за один раз
# Использование: bash RUN.sh
##############################################################################

set -e
cd "$(dirname "$0")"

# 🎨 Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# ✨ Заголовок
clear
cat << "EOF"
╔════════════════════════════════════════════════════════════════════════╗
║                   🚀 PAPER TRADING LAUNCHER                           ║
║                                                                        ║
║              🤖 ML Trading Bot with Real-Time Dashboard              ║
║              💰 48.43% Win Rate | 29 Crypto Pairs                     ║
║              ⚡ ONE COMMAND TO RULE THEM ALL                          ║
╚════════════════════════════════════════════════════════════════════════╝
EOF
echo ""

# ========================================
# 1️⃣ SETUP PYTHON ENVIRONMENT
# ========================================
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}[1/4]${NC} ${CYAN}Setting up Python environment...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

if [ ! -d "venv" ]; then
    echo -e "  ${YELLOW}→${NC} Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
python3 -m pip install -q --upgrade pip setuptools 2>/dev/null || true

echo -e "  ${GREEN}✓${NC} Python environment ready"
echo ""

# ========================================
# 2️⃣ VALIDATE SYSTEM
# ========================================
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}[2/4]${NC} ${CYAN}Validating system components...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

python3 << 'PYTHON_CHECK'
import os
import sys

errors = []

# Check models
models = [f for f in os.listdir('ml/models') if f.endswith('.joblib')]
if len(models) >= 29:
    print(f"  ✓ {len(models)} ML models loaded")
else:
    errors.append(f"Only {len(models)} models found (need 29)")

# Check data
csv_files = [f for f in os.listdir('logs') if f.endswith('.csv')]
if len(csv_files) >= 29:
    print(f"  ✓ {len(csv_files)} OHLCV candle files ready")
else:
    errors.append(f"Only {len(csv_files)} OHLCV files (need 29)")

# Check dashboard
if os.path.exists('public/trading-dashboard.html'):
    print(f"  ✓ Real-time dashboard available")
else:
    errors.append("Dashboard not found")

# Check bot
if os.path.exists('src/paper-trading-bot.js'):
    print(f"  ✓ Paper trading bot ready")
else:
    errors.append("Trading bot not found")

if errors:
    print("\n  ✗ Errors found:")
    for err in errors:
        print(f"    - {err}")
    sys.exit(1)
else:
    print(f"\n  ✓ All systems validated and ready")

PYTHON_CHECK

echo ""

# ========================================
# 3️⃣ CLEANUP PORT 3000
# ========================================
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}[3/4]${NC} ${CYAN}Preparing network...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

# Check if port is in use and kill process
if lsof -i :3000 >/dev/null 2>&1; then
    OLD_PID=$(lsof -t -i :3000)
    echo -e "  ${YELLOW}→${NC} Stopping old process (PID: $OLD_PID)..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 1
fi

echo -e "  ${GREEN}✓${NC} Port 3000 is clear"
echo ""

# ========================================
# 4️⃣ START BOT & DASHBOARD
# ========================================
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}[4/4]${NC} ${CYAN}Starting paper trading system...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

# Start Node.js server in background
echo -e "  ${YELLOW}→${NC} Launching Node.js bot..."
npm start >/dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Check if server is running
if lsof -i :3000 >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Paper trading bot started (PID: $SERVER_PID)"
else
    echo -e "  ${RED}✗${NC} Failed to start bot"
    exit 1
fi

echo ""

# ========================================
# 🎉 SUCCESS - SHOW STATUS
# ========================================
cat << "EOF"
╔════════════════════════════════════════════════════════════════════════╗
║                  ✅ SYSTEM READY FOR TRADING                          ║
╠════════════════════════════════════════════════════════════════════════╣
EOF

echo -e "║ ${GREEN}📊 Dashboard URL:${NC}    http://localhost:3000/trading-dashboard.html    ${BLUE}║${NC}"
echo -e "║ ${GREEN}🤖 API Server:${NC}        http://localhost:3000                         ${BLUE}║${NC}"
echo -e "║ ${GREEN}📡 WebSocket:${NC}         ws://localhost:3000                           ${BLUE}║${NC}"

cat << "EOF"
╠════════════════════════════════════════════════════════════════════════╣
║                        📈 CURRENT SETTINGS                             ║
╠════════════════════════════════════════════════════════════════════════╣
EOF

echo -e "║ ${MAGENTA}💰 Initial Capital:${NC}     \$10,000                                       ${BLUE}║${NC}"
echo -e "║ ${MAGENTA}🎯 Trading Pairs:${NC}       29 Crypto Pairs (BTC, ETH, BNB, etc)       ${BLUE}║${NC}"
echo -e "║ ${MAGENTA}📊 Baseline WR:${NC}         48.43% (proven in backtest)                 ${BLUE}║${NC}"
echo -e "║ ${MAGENTA}🔐 Min Confidence:${NC}      50.2% (signal filter)                       ${BLUE}║${NC}"

cat << "EOF"
╠════════════════════════════════════════════════════════════════════════╣
║                      🎯 WEEK 1 TARGETS                                 ║
╠════════════════════════════════════════════════════════════════════════╣
EOF

echo -e "║ ${CYAN}✓ Collect 100+ trades${NC}                                               ${BLUE}║${NC}"
echo -e "║ ${CYAN}✓ Achieve 44-48% Win Rate${NC}                                          ${BLUE}║${NC}"
echo -e "║ ${CYAN}✓ Validate baseline performance${NC}                                    ${BLUE}║${NC}"
echo -e "║ ${CYAN}✓ Monitor real-time metrics${NC}                                        ${BLUE}║${NC}"

cat << "EOF"
╠════════════════════════════════════════════════════════════════════════╣
║                      📋 WHAT TO DO NOW                                 ║
╠════════════════════════════════════════════════════════════════════════╣
EOF

echo -e "║                                                                        ${BLUE}║${NC}"
echo -e "║ ${GREEN}1.${NC} Open dashboard: ${CYAN}http://localhost:3000/trading-dashboard.html${NC}        ${BLUE}║${NC}"
echo -e "║ ${GREEN}2.${NC} Watch real-time trades and metrics                             ${BLUE}║${NC}"
echo -e "║ ${GREEN}3.${NC} Let system run for 7 days (Week 1 validation)                  ${BLUE}║${NC}"
echo -e "║ ${GREEN}4.${NC} Check final results and proceed to Week 2                      ${BLUE}║${NC}"
echo -e "║                                                                        ${BLUE}║${NC}"

cat << "EOF"
╠════════════════════════════════════════════════════════════════════════╣
║                      ⚠️  IMPORTANT NOTES                               ║
╠════════════════════════════════════════════════════════════════════════╣
EOF

echo -e "║ ${YELLOW}•${NC} Dashboard auto-refreshes every 2 seconds                       ${BLUE}║${NC}"
echo -e "║ ${YELLOW}•${NC} Trades logged in ${CYAN}logs/paper-trading/${NC} directory             ${BLUE}║${NC}"
echo -e "║ ${YELLOW}•${NC} To stop: Press ${CYAN}Ctrl+C${NC} in terminal                          ${BLUE}║${NC}"
echo -e "║ ${YELLOW}•${NC} Server runs in background - dashboard stays open               ${BLUE}║${NC}"

cat << "EOF"
╚════════════════════════════════════════════════════════════════════════╝

🔄 System is running... Monitor your dashboard! 🚀

EOF

# Keep script running (can exit with Ctrl+C)
while true; do
    sleep 1
done
