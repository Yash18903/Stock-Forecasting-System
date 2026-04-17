import time, sys
sys.path.insert(0, '.')
from predict import get_data, prepare_features, load_model_for_symbol, FEATURE_COLS, fetch_news_sentiment, BSE_TO_BO_MAP

symbol = 'TCS.BSE'
yf_symbol = BSE_TO_BO_MAP.get(symbol, symbol)
print(f'Testing with {yf_symbol}...')

t0 = time.time()
print('Loading model...')
model, scaler, conf, mname = load_model_for_symbol(yf_symbol)
print(f'Model loaded in {time.time()-t0:.1f}s')

t1 = time.time()
print('Fetching data...')
df = get_data(yf_symbol)
print(f'Data fetched in {time.time()-t1:.1f}s, shape={df.shape}')

t2 = time.time()
print('Fetching sentiment...')
score, cnt, label = fetch_news_sentiment(symbol)
print(f'Sentiment in {time.time()-t2:.1f}s: score={score} cnt={cnt}')

print('Preparing features...')
latest = prepare_features(df, score)
X = latest[FEATURE_COLS].values
X_scaled = scaler.transform(X)
pred = model.predict(X_scaled)[0]
current = float(latest['Close'].values[0])
print(f'Prediction: {pred:.2f} (current={current:.2f})')
print(f'Total time: {time.time()-t0:.1f}s')
