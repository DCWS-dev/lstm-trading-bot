#!/usr/bin/env python3
"""
ml/fetch_ohlcv.py

Fetch OHLCV (kline) data from Binance public API and save to logs/<PAIR>.csv
No API key required for public kline data.

Usage:
  python ml/fetch_ohlcv.py --pairs BTCUSDT,ETHUSDT --candles 5000

"""
import requests
import time
import argparse
import os
import csv
from datetime import datetime

BASE = 'https://api.binance.com/api/v3/klines'

def fetch_klines(symbol, interval='1m', limit=1000, end_time=None):
    params = {'symbol': symbol, 'interval': interval, 'limit': limit}
    if end_time:
        params['endTime'] = int(end_time)
    r = requests.get(BASE, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def to_csv_rows(klines):
    rows = []
    for k in klines:
        open_time = int(k[0])
        t = datetime.utcfromtimestamp(open_time/1000.0).isoformat() + 'Z'
        open_p = float(k[1]); high = float(k[2]); low = float(k[3]); close = float(k[4]); volume = float(k[5])
        rows.append([t, open_p, high, low, close, volume])
    return rows

def save_csv(pair, rows):
    path = os.path.join('logs', f'{pair}.csv')
    os.makedirs('logs', exist_ok=True)
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['timestamp','open','high','low','close','volume'])
        for r in rows:
            writer.writerow(r)
    return path

def fetch_until(pair, target_candles=5000, interval='1m'):
    all_rows = []
    end_time = None
    attempts = 0
    while len(all_rows) < target_candles and attempts < 200:
        klines = fetch_klines(pair, interval=interval, limit=1000, end_time=end_time)
        if not klines:
            break
        rows = to_csv_rows(klines)
        # klines returned oldest->newest; when using endTime they are the most recent ending at end_time
        # prepend to list (we're fetching backwards)
        all_rows = rows + all_rows
        # set new end_time to one ms before earliest kline
        earliest = int(klines[0][0])
        end_time = earliest - 1
        attempts += 1
        time.sleep(0.2)
    # dedupe by timestamp
    seen = set()
    uniq = []
    for r in all_rows:
        if r[0] not in seen:
            seen.add(r[0]); uniq.append(r)
    print(f'Fetched {len(uniq)} candles for {pair}')
    save_csv(pair, uniq)
    return len(uniq)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pairs', type=str, default='LTCUSDT,LINKUSDT,FTMUSDT,TONUSDT,DOGEUSDT')
    parser.add_argument('--candles', type=int, default=3000)
    parser.add_argument('--interval', type=str, default='1m')
    args = parser.parse_args()
    pairs = [p.strip() for p in args.pairs.split(',') if p.strip()]
    for p in pairs:
        try:
            print('Fetching', p)
            n = fetch_until(p, target_candles=args.candles, interval=args.interval)
            print('Saved logs/', p, 'candles=', n)
        except Exception as e:
            print('Error fetching', p, e)

if __name__ == '__main__':
    main()
