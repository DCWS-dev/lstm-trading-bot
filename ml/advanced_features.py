"""
advanced_features.py

Advanced feature engineering for ML trading models.
Includes: RSI, MACD, Bollinger Bands, ATR, Stochastic, CCI, Williams %R, etc.
"""
import numpy as np
import pandas as pd


def calculate_rsi(prices, period=14):
    """Relative Strength Index"""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-9)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calculate_macd(prices, fast=12, slow=26, signal=9):
    """MACD (Moving Average Convergence Divergence)"""
    ema_fast = prices.ewm(span=fast).mean()
    ema_slow = prices.ewm(span=slow).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_bollinger_bands(prices, period=20, std_dev=2):
    """Bollinger Bands"""
    sma = prices.rolling(period).mean()
    std = prices.rolling(period).std()
    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    bandwidth = (upper - lower) / (sma + 1e-9)
    return upper, sma, lower, bandwidth


def calculate_atr(high, low, close, period=14):
    """Average True Range"""
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(period).mean()
    return atr


def calculate_stochastic(high, low, close, period=14, smooth_k=3, smooth_d=3):
    """Stochastic Oscillator"""
    lowest_low = low.rolling(period).min()
    highest_high = high.rolling(period).max()
    k_raw = 100 * (close - lowest_low) / (highest_high - lowest_low + 1e-9)
    k = k_raw.rolling(smooth_k).mean()
    d = k.rolling(smooth_d).mean()
    return k, d


def calculate_cci(high, low, close, period=20):
    """Commodity Channel Index"""
    typical_price = (high + low + close) / 3
    sma_tp = typical_price.rolling(period).mean()
    mad = typical_price.rolling(period).apply(lambda x: np.mean(np.abs(x - x.mean())))
    cci = (typical_price - sma_tp) / (0.015 * mad + 1e-9)
    return cci


def calculate_williams_r(high, low, close, period=14):
    """Williams %R"""
    highest_high = high.rolling(period).max()
    lowest_low = low.rolling(period).min()
    wr = -100 * (highest_high - close) / (highest_high - lowest_low + 1e-9)
    return wr


def calculate_roc(prices, period=12):
    """Rate of Change"""
    roc = ((prices - prices.shift(period)) / prices.shift(period)) * 100
    return roc


def calculate_momentum(prices, period=10):
    """Momentum"""
    momentum = prices - prices.shift(period)
    return momentum


def calculate_adx(high, low, close, period=14):
    """Average Directional Index (simplified)"""
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(period).mean()
    
    up_move = high.diff()
    down_move = -low.diff()
    
    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0)
    
    plus_di = 100 * plus_dm.rolling(period).mean() / (atr + 1e-9)
    minus_di = 100 * minus_dm.rolling(period).mean() / (atr + 1e-9)
    
    di_sum = plus_di + minus_di
    adx = 100 * abs(plus_di - minus_di) / (di_sum + 1e-9)
    
    return adx


def calculate_obv(close, volume):
    """On Balance Volume"""
    obv = (np.sign(close.diff()) * volume).fillna(0).cumsum()
    return obv


def build_advanced_features(df, window=10):
    """
    Build comprehensive feature set from OHLCV data.
    Input: df with columns [timestamp, open, high, low, close, volume]
    Output: Feature dataframe with 30+ indicators
    """
    X = pd.DataFrame()
    
    # Price-based features
    high = df['high'] if 'high' in df.columns else df['close']
    low = df['low'] if 'low' in df.columns else df['close']
    close = df['close'] if 'close' in df.columns else df['price']
    volume = df['volume'] if 'volume' in df.columns else pd.Series(1, index=df.index)
    
    # Original returns
    returns = close.pct_change().fillna(0)
    X['r1'] = returns
    X['r5'] = close.pct_change(5).fillna(0)
    X['r10'] = close.pct_change(10).fillna(0)
    
    # Moving averages
    X['ma5'] = close.rolling(5).mean().fillna(method='bfill')
    X['ma10'] = close.rolling(10).mean().fillna(method='bfill')
    X['ma20'] = close.rolling(20).mean().fillna(method='bfill')
    X['ma_ratio'] = X['ma5'] / (X['ma10'] + 1e-9)
    
    # Volatility
    X['std5'] = close.rolling(5).std().fillna(0)
    X['std20'] = close.rolling(20).std().fillna(0)
    X['vol_ratio'] = X['std5'] / (X['std20'] + 1e-9)
    
    # Volume
    X['vol'] = volume.rolling(5).sum().fillna(0)
    X['vol_ma'] = volume.rolling(10).mean().fillna(0)
    X['vol_ratio_ma'] = volume / (X['vol_ma'] + 1e-9)
    
    # RSI
    rsi14 = calculate_rsi(close, 14)
    rsi7 = calculate_rsi(close, 7)
    X['rsi14'] = rsi14.fillna(50)
    X['rsi7'] = rsi7.fillna(50)
    X['rsi_trend'] = rsi14.diff().fillna(0)
    
    # MACD
    macd_line, signal_line, histogram = calculate_macd(close, 12, 26, 9)
    X['macd'] = macd_line.fillna(0)
    X['macd_signal'] = signal_line.fillna(0)
    X['macd_hist'] = histogram.fillna(0)
    
    # Bollinger Bands
    upper_bb, sma_bb, lower_bb, bandwidth = calculate_bollinger_bands(close, 20, 2)
    X['bb_upper'] = upper_bb.fillna(0)
    X['bb_middle'] = sma_bb.fillna(0)
    X['bb_lower'] = lower_bb.fillna(0)
    X['bb_width'] = bandwidth.fillna(0)
    X['bb_position'] = ((close - lower_bb) / (upper_bb - lower_bb + 1e-9)).fillna(0.5)
    
    # ATR
    atr = calculate_atr(high, low, close, 14)
    X['atr14'] = atr.fillna(0)
    X['atr_ratio'] = atr / (close + 1e-9)
    
    # Stochastic
    k_stoch, d_stoch = calculate_stochastic(high, low, close, 14, 3, 3)
    X['stoch_k'] = k_stoch.fillna(50)
    X['stoch_d'] = d_stoch.fillna(50)
    X['stoch_diff'] = (k_stoch - d_stoch).fillna(0)
    
    # CCI
    cci = calculate_cci(high, low, close, 20)
    X['cci'] = cci.fillna(0)
    
    # Williams %R
    wr = calculate_williams_r(high, low, close, 14)
    X['williams_r'] = wr.fillna(-50)
    
    # ROC
    roc = calculate_roc(close, 12)
    X['roc'] = roc.fillna(0)
    
    # Momentum
    momentum = calculate_momentum(close, 10)
    X['momentum'] = momentum.fillna(0)
    
    # ADX (simplified)
    adx = calculate_adx(high, low, close, 14)
    X['adx'] = adx.fillna(50)
    
    # OBV
    obv = calculate_obv(close, volume)
    X['obv'] = obv.fillna(0)
    
    # Price position (highs/lows)
    highest_20 = high.rolling(20).max()
    lowest_20 = low.rolling(20).min()
    X['price_position'] = ((close - lowest_20) / (highest_20 - lowest_20 + 1e-9)).fillna(0.5)
    
    # Trend
    X['trend_up'] = ((close > X['ma5']).astype(int) & (X['ma5'] > X['ma10']).astype(int)).astype(float)
    X['trend_down'] = ((close < X['ma5']).astype(int) & (X['ma5'] < X['ma10']).astype(int)).astype(float)
    
    # Close price (normalized)
    X['close_norm'] = close / close.rolling(20).mean()
    
    # Fill any remaining NaNs
    X = X.fillna(0)
    
    return X
