#!/usr/bin/env python3
"""
Advanced feature engineering with selective indicator combination.
Avoids noise by using only most predictive indicators.
"""

import numpy as np
import pandas as pd

def calculate_rsi(prices, period=14):
    """RSI - Relative Strength Index"""
    deltas = np.diff(prices)
    seed = deltas[:period + 1]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    rs = up / down if down != 0 else 0
    
    rsi = np.zeros_like(prices)
    rsi[:period] = 100. - 100. / (1. + rs)
    
    for i in range(period, len(prices)):
        delta = deltas[i - 1]
        if delta > 0:
            upval = delta
            downval = 0.
        else:
            upval = 0.
            downval = -delta
        
        up = (up * (period - 1) + upval) / period
        down = (down * (period - 1) + downval) / period
        rs = up / down if down != 0 else 0
        rsi[i] = 100. - 100. / (1. + rs)
    
    return rsi

def calculate_macd(prices, fast=12, slow=26, signal=9):
    """MACD - Moving Average Convergence Divergence"""
    ema_fast = pd.Series(prices).ewm(span=fast).mean().values
    ema_slow = pd.Series(prices).ewm(span=slow).mean().values
    macd_line = ema_fast - ema_slow
    signal_line = pd.Series(macd_line).ewm(span=signal).mean().values
    histogram = macd_line - signal_line
    
    return macd_line, signal_line, histogram

def calculate_bollinger_bands(prices, period=20, std_dev=2):
    """Bollinger Bands - Volatility indicator"""
    sma = pd.Series(prices).rolling(window=period).mean().values
    std = pd.Series(prices).rolling(window=period).std().values
    upper = sma + (std_dev * std)
    lower = sma - (std_dev * std)
    bandwidth = upper - lower
    
    # Position: 0 = at lower band, 1 = at upper band
    position = np.divide(prices - lower, bandwidth, where=bandwidth!=0, out=np.zeros_like(prices))
    position = np.clip(position, 0, 1)
    
    return upper, sma, lower, bandwidth, position

def calculate_atr(high, low, close, period=14):
    """ATR - Average True Range"""
    tr = np.maximum(
        high - low,
        np.maximum(
            np.abs(high - np.roll(close, 1)),
            np.abs(low - np.roll(close, 1))
        )
    )
    tr[0] = 0
    atr = pd.Series(tr).rolling(window=period).mean().values
    return atr

def calculate_stochastic(high, low, close, period=14, smooth_k=3, smooth_d=3):
    """Stochastic Oscillator"""
    lowest_low = pd.Series(low).rolling(window=period).min().values
    highest_high = pd.Series(high).rolling(window=period).max().values
    
    k_raw = 100 * (close - lowest_low) / (highest_high - lowest_low + 1e-10)
    k = pd.Series(k_raw).rolling(window=smooth_k).mean().values
    d = pd.Series(k).rolling(window=smooth_d).mean().values
    
    return k, d

def calculate_adx(high, low, close, period=14):
    """ADX - Average Directional Index"""
    # Simplified ADX calculation
    plus_dm = np.maximum(high - np.roll(high, 1), 0)
    minus_dm = np.maximum(np.roll(low, 1) - low, 0)
    
    # Directional indicators
    di_plus = 100 * pd.Series(plus_dm).rolling(window=period).mean().values / (pd.Series(high - low).rolling(window=period).mean().values + 1e-10)
    di_minus = 100 * pd.Series(minus_dm).rolling(window=period).mean().values / (pd.Series(high - low).rolling(window=period).mean().values + 1e-10)
    
    di_diff = np.abs(di_plus - di_minus) / (di_plus + di_minus + 1e-10)
    adx = pd.Series(di_diff).rolling(window=period).mean().values * 100
    
    return adx

def build_selective_features(df, window=50):
    """
    Build selective high-quality features.
    Combines basic proven features with best-performing indicators.
    """
    
    close = df['close'].values
    high = df['high'].values
    low = df['low'].values
    volume = df['volume'].values
    
    features = pd.DataFrame(index=df.index)
    
    # ========== PROVEN BASIC FEATURES (keep from baseline) ==========
    # Returns (strong predictors)
    features['r1'] = df['close'].pct_change(1)
    features['r5'] = df['close'].pct_change(5)
    features['r10'] = df['close'].pct_change(10)
    
    # Moving averages (trend following)
    features['ma5'] = df['close'].rolling(window=5).mean() / df['close']
    features['ma10'] = df['close'].rolling(window=10).mean() / df['close']
    features['ma_ratio'] = features['ma5'] / (features['ma10'] + 1e-10)
    
    # Volatility (risk metric)
    features['vol'] = df['volume'].rolling(window=window).mean()
    features['std5'] = df['close'].pct_change().rolling(window=5).std()
    
    # ========== BEST NEW INDICATORS (highly selective) ==========
    # RSI: Very predictive for overbought/oversold
    rsi_14 = calculate_rsi(close, period=14)
    features['rsi_14'] = rsi_14 / 100.0  # Normalize to 0-1
    
    # MACD: Trend following and momentum
    macd_line, signal_line, histogram = calculate_macd(close)
    # Normalize MACD
    features['macd_histogram'] = pd.Series(histogram).rolling(window=20).mean().values
    
    # Bollinger Bands position: Shows if price is near extremes
    upper_bb, sma_bb, lower_bb, bw, bb_pos = calculate_bollinger_bands(close, period=20, std_dev=2)
    features['bb_position'] = bb_pos  # 0 = near lower, 1 = near upper
    
    # ATR: Volatility adjusted by market conditions
    atr = calculate_atr(high, low, close, period=14)
    features['atr_ratio'] = atr / close  # ATR as % of price
    
    # Stochastic: Momentum oscillator (good for reversals)
    k_stoch, d_stoch = calculate_stochastic(high, low, close, period=14)
    features['stoch_k'] = k_stoch / 100.0  # Normalize
    
    # ADX: Trend strength (filter by trending vs range-bound)
    adx = calculate_adx(high, low, close, period=14)
    features['adx'] = adx / 100.0  # Normalize
    
    # ========== DERIVED FEATURES (simple combinations) ==========
    # Price momentum: Simple combined signal
    features['momentum'] = features['rsi_14'] - 0.5  # Deviation from neutral
    features['trend_strength'] = np.sign(features['ma_ratio'] - 1.0) * features['adx']
    
    # Fill NaNs and clip outliers
    features = features.fillna(0)
    features = features.clip(-10, 10)  # Prevent extreme outliers
    
    return features

if __name__ == "__main__":
    # Test on sample data
    print("Selective feature engineering module loaded successfully")
    print("Features included:")
    print("  - Basic proven: r1, r5, r10, ma5, ma10, ma_ratio, vol, std5")
    print("  - Selective advanced: RSI(14), MACD, Bollinger Bands, ATR, Stochastic(14), ADX")
    print("  - Derived: momentum, trend_strength")
    print("Total: 15 features (8 basic + 6 new + 1 derived)")
