import joblib, os, json

MODEL_DIR = r'c:\Users\AE-09092023\Desktop\Development\Final Year Project\Implementation\model'

# Check scaler feature count
scaler = joblib.load(os.path.join(MODEL_DIR, 'tcs_scaler.pkl'))
print(f'TCS scaler expects: {scaler.n_features_in_} features')
print(f'TCS scaler feature names: {getattr(scaler, "feature_names_in_", "N/A")}')

# Current FEATURE_COLS in predict.py (24 features)
FEATURE_COLS = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'infy_close', 'wipro_close', 'nifty_close',
    'sentiment', 'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]
print(f'\nCurrent predict.py FEATURE_COLS ({len(FEATURE_COLS)}): {FEATURE_COLS}')
