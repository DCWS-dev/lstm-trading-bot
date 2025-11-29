#!/usr/bin/env python3
"""
ml/adaptive_threshold_router.py

Adaptive threshold selection based on market regime.
Can be integrated into ultra-trading-bot.js via subprocess calls.

Usage from Node.js:
  const { exec } = require('child_process');
  exec('python ml/adaptive_threshold_router.py --pair=BTCUSDT --price-action=<data>', 
       (err, stdout, stderr) => { 
         const threshold = JSON.parse(stdout).adaptive_threshold;
       });
"""

import json
import argparse
import numpy as np
import pandas as pd


def detect_market_regime(recent_prices, recent_volumes=None, lookback=50):
    """
    Detect market regime: trending_up, trending_down, or ranging
    Returns: (regime, strength: 0-1)
    """
    if len(recent_prices) < lookback:
        recent_prices = recent_prices[-len(recent_prices):]
    else:
        recent_prices = recent_prices[-lookback:]
    
    if len(recent_prices) < 5:
        return 'ranging', 0.5
    
    prices = np.array(recent_prices, dtype=float)
    
    # Trend detection via linear regression slope
    x = np.arange(len(prices))
    slope = np.polyfit(x, prices, 1)[0]
    price_mean = np.mean(prices)
    price_std = np.std(prices)
    
    # Normalized slope to [-1, 1]
    trend_score = slope / (price_std + 1e-10)
    trend_score = np.clip(trend_score, -1, 1)
    
    # Trend strength (0-1): how much price moved vs volatility
    price_range = (np.max(prices) - np.min(prices)) / price_mean
    trend_strength = min(abs(trend_score), price_range)
    
    # Classify regime
    if trend_strength > 0.3:  # Trending
        if trend_score > 0:
            regime = 'trending_up'
        else:
            regime = 'trending_down'
    else:  # Range-bound
        regime = 'ranging'
    
    return regime, min(trend_strength, 1.0)


def calculate_volatility(recent_prices, lookback=20):
    """Calculate volatility (std of returns)."""
    if len(recent_prices) < 2:
        return 0.01
    
    prices = np.array(recent_prices[-lookback:], dtype=float)
    returns = np.diff(prices) / prices[:-1]
    volatility = np.std(returns)
    return volatility


def get_adaptive_threshold(regime, volatility, base_threshold=0.60):
    """
    Get adaptive threshold based on market regime and volatility.
    
    Logic:
    - trending_up: Lower threshold (0.55) → More aggressive on long trades
    - trending_down: Higher threshold (0.65) → More conservative on short signals
    - ranging: Base threshold (0.60) → Neutral
    - High volatility: Increase threshold slightly (add 0.02) → Safer in choppy markets
    - Low volatility: Decrease threshold slightly (sub 0.02) → More trades in calm markets
    """
    
    # Regime adjustment
    regime_adjustments = {
        'trending_up': -0.05,
        'trending_down': +0.05,
        'ranging': 0.00
    }
    
    threshold = base_threshold + regime_adjustments[regime]
    
    # Volatility adjustment
    volatility_percentile = min(volatility / 0.05, 1.0)  # Normalize to [0, 1]
    volatility_adjustment = volatility_percentile * 0.02  # -0.02 to +0.02
    threshold += volatility_adjustment
    
    # Clip to reasonable range [0.50, 0.75]
    threshold = np.clip(threshold, 0.50, 0.75)
    
    return threshold, volatility_percentile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pair', type=str, default='BTCUSDT')
    parser.add_argument('--recent-prices', type=str, 
                       help='JSON string of recent prices', default='[]')
    parser.add_argument('--base-threshold', type=float, default=0.60)
    args = parser.parse_args()
    
    # Parse input
    try:
        prices = json.loads(args.recent_prices)
    except:
        prices = [100.0]
    
    if not prices or len(prices) < 3:
        prices = [100.0, 100.1, 100.0]
    
    # Detect regime
    regime, strength = detect_market_regime(prices, lookback=50)
    volatility = calculate_volatility(prices, lookback=20)
    threshold, vol_pct = get_adaptive_threshold(regime, volatility, args.base_threshold)
    
    # Output
    result = {
        'pair': args.pair,
        'regime': regime,
        'regime_strength': float(strength),
        'volatility': float(volatility),
        'volatility_percentile': float(vol_pct),
        'base_threshold': float(args.base_threshold),
        'adaptive_threshold': float(threshold),
        'recommendation': f'Use threshold {threshold:.3f} ({regime} market, vol={volatility:.4f})'
    }
    
    print(json.dumps(result))


if __name__ == '__main__':
    main()
