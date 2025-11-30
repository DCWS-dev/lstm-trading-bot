/**
 * Launch Paper Trading with Hybrid Strategy
 * 30 Nov 2025
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('');
console.log('╔════════════════════════════════════════════════════╗');
console.log('║  🚀 PAPER TRADING LAUNCH - Hybrid Strategy v1.0  ║');
console.log('╚════════════════════════════════════════════════════╝');
console.log('');
console.log('📅 Date:', new Date().toLocaleString());
console.log('');

// Step 1: Validate Python models
console.log('Step 1/4: Validating ML models...');
const validationScript = spawn('python', ['-c', `
import os
import joblib
models = len([f for f in os.listdir('ml/models') if f.endswith('.joblib') and not f.startswith('ensemble')])
print(f'{models}')
`], { cwd: process.cwd() });

let modelCount = 0;
validationScript.stdout.on('data', (data) => {
    modelCount = parseInt(data.toString().trim());
    console.log(`         ✓ ${modelCount} XGBoost models ready`);
});

validationScript.on('close', (code) => {
    if (modelCount < 29) {
        console.log(`         ⚠ Warning: Only ${modelCount}/29 models found`);
    }

    // Step 2: Check data files
    console.log('');
    console.log('Step 2/4: Checking OHLCV data...');
    const csvCount = fs.readdirSync(path.join(process.cwd(), 'logs')).filter(f => f.endsWith('.csv')).length;
    console.log(`         ✓ ${csvCount} OHLCV files ready`);

    // Step 3: Verify dashboard
    console.log('');
    console.log('Step 3/4: Verifying dashboard...');
    if (fs.existsSync(path.join(process.cwd(), 'public/trading-dashboard.html'))) {
        console.log(`         ✓ Dashboard ready`);
    }

    // Step 4: Start paper trading bot
    console.log('');
    console.log('Step 4/4: Starting paper trading bot...');
    console.log('');

    setTimeout(() => {
        startBot();
    }, 1000);
});

function startBot() {
    const configData = {
        initialCapital: 10000,
        pairs: [
            'ADAUSDT', 'ALGOUSDT', 'APEUSDT', 'ARBUSDT', 'ATOMUSDT',
            'AVAXUSDT', 'BNBUSDT', 'BTCUSDT', 'CHZUSDT', 'DOGEUSDT',
            'DOTUSDT', 'ETHUSDT', 'FILUSDT', 'FLOKIUSDT', 'FTMUSDT',
            'LINKUSDT', 'LTCUSDT', 'LUNCUSDT', 'MATICUSDT', 'NEARUSDT',
            'OPUSDT', 'PEPEUSDT', 'SHIBUSDT', 'SOLUSDT', 'SUIUSDT',
            'THETAUSDT', 'TONUSDT', 'UNIUSDT', 'XRPUSDT'
        ],
        minConfidence: 0.55,
        positionSize: 0.02,
        strategy: 'hybrid',
        adaptiveThreshold: true
    };

    // Start the existing paper trading bot
    const bot = spawn('node', ['src/paper-trading-bot.js'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
            ...process.env,
            TRADING_CONFIG: JSON.stringify(configData),
            NODE_ENV: 'paper-trading'
        }
    });

    bot.on('close', (code) => {
        console.log('');
        console.log('Paper trading bot stopped.');
        process.exit(code);
    });

    bot.on('error', (err) => {
        console.error('Failed to start bot:', err);
        process.exit(1);
    });
}
