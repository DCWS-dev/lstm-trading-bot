#!/bin/bash

##############################################################################
# 🚀 SIMPLE-START.sh - Самый надежный способ запустить систему
# Использование: bash SIMPLE-START.sh
##############################################################################

cd "$(dirname "$0")"

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║        🚀 PAPER TRADING SYSTEM LAUNCHER           ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Чистка
echo "[1/3] Cleaning up old processes..."
pkill -f "dashboard-server" 2>/dev/null || true
pkill -f "paper-trading-bot" 2>/dev/null || true
sleep 2

# Dashboard
echo "[2/3] Starting Dashboard Server on port 3000..."
node src/dashboard-server.js > /tmp/dashboard.log 2>&1 &
DASHBOARD_PID=$!
sleep 3

# Bot
echo "[3/3] Starting Paper Trading Bot..."
node src/paper-trading-bot.js > /tmp/bot.log 2>&1 &
BOT_PID=$!
sleep 2

# Verify
if lsof -i :3000 >/dev/null 2>&1; then
    echo ""
    echo "✅ SUCCESS! System is running!"
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "📊 Dashboard: http://localhost:3000/trading-dashboard.html"
    echo "🤖 Bot PID: $BOT_PID"
    echo "📈 Dashboard PID: $DASHBOARD_PID"
    echo ""
    echo "🎯 Live Trading Started!"
    echo "   Monitor in: http://localhost:3000/trading-dashboard.html"
    echo ""
    echo "📌 To stop:  pkill -f 'dashboard-server' && pkill -f 'paper-trading-bot'"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    
    # Keep alive
    while true; do
        sleep 1
    done
else
    echo "❌ Failed to start. Checking logs..."
    echo ""
    echo "Dashboard log:"
    cat /tmp/dashboard.log
    echo ""
    echo "Bot log:"
    cat /tmp/bot.log
    exit 1
fi
