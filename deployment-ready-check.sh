#!/bin/bash

###############################################################################
# DEPLOYMENT READY CHECK - Validates all systems before going live
# Usage: bash deployment-ready-check.sh
###############################################################################

set -e

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║         TRADING BOT DEPLOYMENT READY CHECK                        ║"
echo "║         Hybrid Strategy with Adaptive Thresholds                  ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $1"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $1"
        ((CHECKS_FAILED++))
    fi
}

check_exists() {
    if [ -e "$1" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2 ($1)"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $2 ($1 not found)"
        ((CHECKS_FAILED++))
    fi
}

count_lines() {
    if [ -f "$1" ]; then
        wc -l < "$1"
    else
        echo "0"
    fi
}

###############################################################################
echo "PHASE 1: FOUNDATION VALIDATION"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

# Check models
echo "Checking ML Models..."
model_count=$(ls ml/models/*.joblib 2>/dev/null | wc -l)
if [ $model_count -eq 29 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Found 29 ML models"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: Found only $model_count models (need 29)"
    ((CHECKS_FAILED++))
fi

# Check OHLCV data
echo "Checking OHLCV Data..."
csv_count=$(ls logs/*.csv 2>/dev/null | wc -l)
if [ $csv_count -ge 29 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Found $csv_count CSV files"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: Found only $csv_count CSV files (need 29+)"
    ((CHECKS_FAILED++))
fi

# Check Python files
echo "Checking Strategy Code..."
check_exists "ml/adaptive_threshold_router.py" "Adaptive router exists"
check_exists "ml/hybrid_strategy_integrator.py" "Hybrid strategy engine exists"
check_exists "ml/train_and_backtest.py" "ML training pipeline exists"

# Check Node files
echo "Checking Bot Code..."
check_exists "src/ultra-trading-bot.js" "Trading bot exists"
check_exists "src/ultra-backtest-realhistory-1000.js" "Backtest validator exists"
check_exists "public/dashboard.html" "Dashboard exists"

# Check config
echo "Checking Configuration..."
check_exists "config/live-config.json" "Live configuration exists"
check_exists "config/per-pair-configs.json" "Per-pair configuration exists"

echo ""

###############################################################################
echo "PHASE 2: PYTHON ENVIRONMENT"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

# Check venv
if [ -d "venv" ]; then
    echo -e "${GREEN}✅ PASS${NC}: Virtual environment exists"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Virtual environment not found (create with: python3 -m venv venv)"
    ((CHECKS_FAILED++))
fi

# Activate venv and check dependencies
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    
    echo "Checking Python dependencies..."
    
    # Check Python version
    python_version=$(python --version 2>&1 | awk '{print $2}')
    if [[ $python_version == 3.* ]]; then
        echo -e "${GREEN}✅ PASS${NC}: Python $python_version"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: Python version not compatible ($python_version)"
        ((CHECKS_FAILED++))
    fi
    
    # Check packages
    for pkg in numpy pandas scikit-learn xgboost joblib requests; do
        if python -c "import $pkg" 2>/dev/null; then
            echo -e "${GREEN}✅ PASS${NC}: $pkg installed"
            ((CHECKS_PASSED++))
        else
            echo -e "${RED}❌ FAIL${NC}: $pkg not installed"
            ((CHECKS_FAILED++))
        fi
    done
else
    echo -e "${RED}❌ FAIL${NC}: Virtual environment activation script not found"
    ((CHECKS_FAILED++))
fi

echo ""

###############################################################################
echo "PHASE 3: ML MODEL VALIDATION"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    
    echo "Testing model loading..."
    
    # Test loading all models
    python3 << 'EOF'
import os
import glob
import joblib
import sys

try:
    models = glob.glob('ml/models/*.joblib')
    loaded = 0
    for model_file in models:
        try:
            m = joblib.load(model_file)
            loaded += 1
        except:
            pass
    
    if loaded == 29:
        print(f"✅ Successfully loaded {loaded}/29 models")
        sys.exit(0)
    else:
        print(f"❌ Only loaded {loaded}/29 models")
        sys.exit(1)
except Exception as e:
    print(f"❌ Error loading models: {e}")
    sys.exit(1)
EOF
    check "All 29 models load successfully"
    
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: Skipping model tests (venv not available)"
fi

echo ""

###############################################################################
echo "PHASE 4: NODE.JS DEPENDENCIES"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

# Check Node
if command -v node &> /dev/null; then
    node_version=$(node --version)
    echo -e "${GREEN}✅ PASS${NC}: Node.js $node_version"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: Node.js not installed"
    ((CHECKS_FAILED++))
fi

# Check npm
if command -v npm &> /dev/null; then
    npm_version=$(npm --version)
    echo -e "${GREEN}✅ PASS${NC}: npm $npm_version"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: npm not installed"
    ((CHECKS_FAILED++))
fi

# Check npm packages
if [ -d "node_modules" ]; then
    echo "Checking npm packages..."
    for pkg in axios dotenv; do
        if [ -d "node_modules/$pkg" ]; then
            echo -e "${GREEN}✅ PASS${NC}: $pkg installed"
            ((CHECKS_PASSED++))
        else
            echo -e "${YELLOW}⚠️  WARN${NC}: $pkg not installed"
            ((CHECKS_FAILED++))
        fi
    done
else
    echo -e "${YELLOW}⚠️  WARN${NC}: node_modules not found (run: npm install)"
    ((CHECKS_FAILED++))
fi

echo ""

###############################################################################
echo "PHASE 5: ADAPTIVE ROUTING VALIDATION"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    
    echo "Testing adaptive threshold router..."
    
    python3 << 'EOF'
import sys
import json
import subprocess

try:
    # Test the adaptive router
    result = subprocess.run(
        ['python', 'ml/adaptive_threshold_router.py', 
         '--pair=BTCUSDT', 
         '--recent-prices=[50000,50100,50200]'],
        capture_output=True,
        text=True,
        timeout=5
    )
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            if 'adaptive_threshold' in output:
                print(f"✅ Adaptive router works")
                print(f"   Threshold: {output['adaptive_threshold']}")
                print(f"   Regime: {output.get('regime', 'unknown')}")
                sys.exit(0)
        except:
            pass
    
    print(f"❌ Adaptive router test failed")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error testing adaptive router: {e}")
    sys.exit(1)
EOF
    check "Adaptive threshold router working"
    
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: Skipping router test (venv not available)"
fi

echo ""

###############################################################################
echo "PHASE 6: SPACE & PERMISSIONS"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

# Check available disk space
available_space=$(df . | tail -1 | awk '{print $4}')
if [ $available_space -gt 1048576 ]; then
    echo -e "${GREEN}✅ PASS${NC}: Sufficient disk space ($(($available_space / 1024 / 1024)) GB available)"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: Low disk space (only $((available_space / 1024)) MB available)"
    ((CHECKS_FAILED++))
fi

# Check write permissions
if touch logs/test.tmp && rm logs/test.tmp; then
    echo -e "${GREEN}✅ PASS${NC}: Write permissions OK"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: No write permissions in logs/"
    ((CHECKS_FAILED++))
fi

echo ""

###############################################################################
echo "PHASE 7: DOCUMENTATION"
echo "─────────────────────────────────────────────────────────────────────"
echo ""

check_exists "HYBRID-STRATEGY-README.md" "Hybrid strategy guide"
check_exists "CURRENT-PHASE-STATUS.md" "Phase status document"
check_exists "PRE-DEPLOYMENT-CHECKLIST.md" "Deployment checklist"
check_exists "SYSTEM-ARCHITECTURE.md" "System architecture"

echo ""

###############################################################################
echo "SUMMARY"
echo "════════════════════════════════════════════════════════════════════"
echo ""

TOTAL=$((CHECKS_PASSED + CHECKS_FAILED))
PASS_RATE=$((CHECKS_PASSED * 100 / TOTAL))

echo "Results: ${GREEN}$CHECKS_PASSED passed${NC}, ${RED}$CHECKS_FAILED failed${NC} (${PASS_RATE}% pass rate)"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ ALL CHECKS PASSED - SYSTEM READY FOR DEPLOYMENT${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review: HYBRID-STRATEGY-README.md"
    echo "2. Start paper trading: node src/ultra-trading-bot.js --paper-trading"
    echo "3. Monitor: Open http://localhost:3000/dashboard.html"
    echo ""
    exit 0
else
    echo -e "${RED}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}⚠️  SOME CHECKS FAILED - FIX ISSUES BEFORE DEPLOYMENT${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Issues to fix:"
    
    if [ ! -d "venv" ]; then
        echo "  • Create Python venv: python3 -m venv venv"
    fi
    
    if [ ! -d "node_modules" ]; then
        echo "  • Install npm packages: npm install"
    fi
    
    if [ $model_count -lt 29 ]; then
        echo "  • Retrain models: python ml/train_and_backtest.py --pairs=all"
    fi
    
    echo ""
    exit 1
fi
