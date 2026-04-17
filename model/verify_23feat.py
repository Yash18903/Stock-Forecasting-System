import joblib, os, numpy as np

MODEL_DIR = r'c:\Users\AE-09092023\Desktop\Development\Final Year Project\Implementation\model'

# The 23-feature list WITHOUT sentiment  
FEATURE_COLS_23 = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'infy_close', 'wipro_close', 'nifty_close',
    # NO 'sentiment' here
    'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]

print(f'Testing prediction with 23 features (no sentiment)...')

import sys
sys.path.insert(0, r'c:\Users\AE-09092023\Desktop\Development\Final Year Project\Implementation\ml-model')
import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd

# Get real data
end_date = datetime.now()
start_date = end_date - timedelta(days=60)
df = yf.download('TCS.BO', start=start_date, end=end_date, progress=False)
print(f'Downloaded {len(df)} rows')

df = df.reset_index()
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)
df = df.loc[:, ~df.columns.duplicated()]
df['Date'] = pd.to_datetime(df['Date'])

# Add context data (proxy)
df['infy_close'] = df['Close']
df['wipro_close'] = df['Close']
df['nifty_close'] = df['Close']

# Indicators
def calc_rsi(data, window=14):
    delta = data.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

df['rsi'] = calc_rsi(df['Close'])
df['ema'] = df['Close'].ewm(span=12, adjust=False).mean()
df['macd'] = df['Close'].ewm(span=12, adjust=False).mean() - df['Close'].ewm(span=26, adjust=False).mean()
for i in range(1, 11):
    df[f'lag_{i}'] = df['Close'].shift(i)
df['day_of_week'] = df['Date'].dt.dayofweek
df['month'] = df['Date'].dt.month

df_clean = df.dropna()
print(f'Clean rows: {len(df_clean)}')

tcs_scaler = joblib.load(os.path.join(MODEL_DIR, 'tcs_scaler.pkl'))
tcs_model = joblib.load(os.path.join(MODEL_DIR, 'tcs_model.pkl'))

X = df_clean[FEATURE_COLS_23].tail(1).values
X_scaled = tcs_scaler.transform(X)
pred = tcs_model.predict(X_scaled)[0]
curr = float(df_clean['Close'].tail(1).values[0])
print(f'SUCCESS! TCS prediction: {pred:.2f} (current: {curr:.2f})')
print(f'Expected return: {((pred-curr)/curr)*100:.2f}%')
