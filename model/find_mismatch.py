import joblib, os, numpy as np

MODEL_DIR = r'c:\Users\AE-09092023\Desktop\Development\Final Year Project\Implementation\model'

tcs_scaler = joblib.load(os.path.join(MODEL_DIR, 'tcs_scaler.pkl'))
tcs_model = joblib.load(os.path.join(MODEL_DIR, 'tcs_model.pkl'))

print(f'Scaler n_features_in_: {tcs_scaler.n_features_in_}')
print(f'Scaler mean_ length: {len(tcs_scaler.mean_)}')
print(f'Model n_features_in_: {tcs_model.n_features_in_}')

# The 24-feature list in predict.py
FEATURE_COLS_24 = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'infy_close', 'wipro_close', 'nifty_close',
    'sentiment', 'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]

# Try each possible 23-feature subset by dropping one feature
print('\nTrying to find which feature to drop to get 23 features...')
dummy_data = np.random.rand(1, 23)
try:
    result = tcs_scaler.transform(dummy_data)
    prediction = tcs_model.predict(result)
    print(f'  23-feature dummy data works! Prediction: {prediction}')
except Exception as e:
    print(f'  Error: {e}')

# The scaler that trained with 23 features likely didn't have ONE of these
# Let's check what an older version might have been
# Compare with the backend (fallback) scaler
fb_scaler = joblib.load(os.path.join(MODEL_DIR, 'backend_scaler.pkl'))
print(f'\nFallback scaler n_features_in_: {fb_scaler.n_features_in_}')
