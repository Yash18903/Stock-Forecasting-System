
from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
import joblib
import pandas as pd
import numpy as np

# Ensure we can import from predict.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from predict import load_model_for_symbol, get_data, prepare_features, FEATURE_COLS, BSE_TO_BO_MAP, fetch_news_sentiment
except ImportError as e:
    print(f"Error importing from predict.py: {e}")
    sys.exit(1)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global cache for models to avoid reloading from disk every request
MODEL_CACHE = {}

def get_cached_model(symbol):
    if symbol in MODEL_CACHE:
        return MODEL_CACHE[symbol]
    
    # Load model using the logic from predict.py
    # We need to adapt load_model_for_symbol to our caching needs or just call it
    # Since predict.py loads from disk, we call it and store the result
    model, scaler, confidence, model_name = load_model_for_symbol(symbol)
    
    cache_entry = {
        "model": model,
        "scaler": scaler,
        "confidence": confidence,
        "model_name": model_name
    }
    MODEL_CACHE[symbol] = cache_entry
    return cache_entry

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running", "service": "stock-prediction-api"})

@app.route('/predict/<path:symbol>', methods=['GET'])
def predict(symbol):
    try:
        # Handle BSE mapping if needed
        yf_symbol = symbol
        if symbol in BSE_TO_BO_MAP:
             yf_symbol = BSE_TO_BO_MAP[symbol]
        elif symbol.endswith('.BSE'):
             yf_symbol = symbol.replace('.BSE', '.BO')
        
        # 1. Load model (cached)
        model_data = get_cached_model(yf_symbol)
        model = model_data["model"]
        scaler = model_data["scaler"]
        
        # 2. Fetch real-time news sentiment for this company
        print(f"[predict] Fetching news sentiment for {symbol}...")
        sentiment_score, article_count, sentiment_label = fetch_news_sentiment(symbol)
        print(f"[predict] Sentiment: score={sentiment_score}, articles={article_count}, label={sentiment_label}")
        
        # 3. Fetch live market data
        df = get_data(yf_symbol)
        
        # 4. Engineer features WITH real sentiment
        latest_data = prepare_features(df, sentiment_score=sentiment_score)
        X = latest_data[FEATURE_COLS].values
        
        # 5. Predict
        X_scaled = scaler.transform(X)
        raw_prediction = model.predict(X_scaled)[0]
        current_price = float(latest_data['Close'].values[0])
        
        # 6. Apply news sentiment adjustment to the prediction
        #    Since the model was trained with sentiment=0, the learned weights for
        #    sentiment may be minimal. We apply a small adjustment based on live
        #    news sentiment to make the prediction news-aware.
        #    Max adjustment: ±0.5% of predicted price, scaled by sentiment strength
        sentiment_adjustment_pct = sentiment_score * 0.005  # e.g. score=1.0 → +0.5%
        adjusted_prediction = raw_prediction * (1 + sentiment_adjustment_pct)
        
        result = {
            "symbol": symbol,
            "prediction": float(adjusted_prediction),
            "current_price": current_price,
            "date": latest_data['Date'].dt.strftime('%Y-%m-%d').values[0],
            "confidence": model_data["confidence"],
            "model_used": model_data["model_name"],
            "sentiment_score": sentiment_score,
            "sentiment_label": sentiment_label,
            "news_articles_analyzed": article_count
        }
        
        print(f"[predict] {symbol}: raw={raw_prediction:.2f}, adjusted={adjusted_prediction:.2f} (sentiment adj: {sentiment_adjustment_pct*100:.3f}%)")
        return jsonify(result)

    except Exception as e:
        print(f"Error predicting for {symbol}: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/quote/<path:symbol>', methods=['GET'])
def quote(symbol):
    try:
        # Handle BSE mapping if needed
        yf_symbol = symbol
        if symbol in BSE_TO_BO_MAP:
             yf_symbol = BSE_TO_BO_MAP[symbol]
        elif symbol.endswith('.BSE'):
             yf_symbol = symbol.replace('.BSE', '.BO')
             
        # Fetch live data only (reuse get_data but we only need the latest row)
        # get_data fetches 200 days which is fine
        df = get_data(yf_symbol)
        latest = df.iloc[-1]
        
        # Calculate change (assuming previous day is -2)
        if len(df) > 1:
            prev = df.iloc[-2]
            change = latest['Close'] - prev['Close']
            change_percent = (change / prev['Close']) * 100
        else:
            change = 0
            change_percent = 0
            
        result = {
            "symbol": symbol,
            "price": float(latest['Close']),
            "change": float(change),
            "changePercent": float(change_percent),
            "high": float(latest['High']),
            "low": float(latest['Low']),
            "open": float(latest['Open']),
            "previousClose": float(latest['Close'] - change), # approx
            "volume": int(latest['Volume']) if 'Volume' in latest else 0
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching quote for {symbol}: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Use PORT from environment or fallback to 5001. Required for Hugging Face Docker Spaces!
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting ML Model API Server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
