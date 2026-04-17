"""
=============================================================
  Stock Price Prediction - Inference Script
=============================================================
  Loads the per-company XGBoost model + scaler.
  Fetches real-time data from Yahoo Finance.
  Engineers features and returns a JSON prediction.

  Features (23 total — matches trained models):
    Close, High, Low, Open, Volume,
    infy_close, wipro_close, nifty_close,
    rsi, ema, macd,
    lag_1..lag_10, day_of_week, month
  Note: sentiment is applied as a post-prediction adjustment by app.py,
  not as an input feature to the model.

  Usage:
    python predict.py RELIANCE.BSE
    python predict.py TCS.BSE
    python predict.py INFY.BO
=============================================================
"""

import sys
import os
import json
import pandas as pd
import numpy as np
import joblib
import yfinance as yf
import requests
from datetime import datetime, timedelta
import warnings

warnings.filterwarnings('ignore')

# ─── Paths ───────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(SCRIPT_DIR, '..', 'model')

# Fallback model (original TCS model)
FALLBACK_MODEL = os.path.join(MODEL_DIR, 'tcs_model.pkl')
FALLBACK_SCALER = os.path.join(MODEL_DIR, 'tcs_scaler.pkl')

# Feature columns — must match trained model scalers exactly (23 features)
# NOTE: 'sentiment' is intentionally excluded from model input features.
# The trained .pkl models were fitted without sentiment in the feature set.
# Sentiment is applied as a post-prediction price adjustment in app.py instead.
FEATURE_COLS = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'infy_close', 'wipro_close', 'nifty_close',
    'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]

# Context tickers — mirrors CONTEXT_TICKERS in train_all_models.py
CONTEXT_TICKERS = {
    'infy_close':  'INFY.NS',
    'wipro_close': 'WIPRO.NS',
    'nifty_close': '^NSEI',
}

# Symbol mapping: .BSE display names → .BO Yahoo Finance tickers
BSE_TO_BO_MAP = {
    'RELIANCE.BSE':   'RELIANCE.BO',
    'TCS.BSE':        'TCS.BO',
    'WIPRO.BSE':      'WIPRO.BO',
    'INFY.BSE':       'INFY.BO',
    'HDFCBANK.BSE':   'HDFCBANK.BO',
    'ITC.BSE':        'ITC.BO',
    'ICICIBANK.BSE':  'ICICIBANK.BO',
    'SBI.BSE':        'SBIN.BO',
    'ADANIENT.BSE':   'ADANIENT.BO',
    'BHARTIARTL.BSE': 'BHARTIARTL.BO',
    'TATAMOTORS.BSE': 'TMPV.BO',
}

# ─── Company Search Config (mirrors news.js COMPANY_SEARCH_MAP) ──────────────
COMPANY_SEARCH_MAP = {
    'RELIANCE': { 'keywords': ['RELIANCE'], 'stockNames': ['RELIANCE INDUSTRIES'] },
    'TCS':      { 'keywords': ['TCS'], 'stockNames': ['TATA CONSULTANCY'] },
    'WIPRO':    { 'keywords': ['WIPRO'], 'stockNames': ['WIPRO'] },
    'INFY':     { 'keywords': ['INFY', 'INFOSYS'], 'stockNames': ['INFOSYS'] },
    'HDFCBANK': { 'keywords': ['HDFCBANK', 'HDFC BANK'], 'stockNames': ['HDFC BANK'] },
    'ITC':      { 'keywords': ['ITC'], 'stockNames': ['ITC LIMITED'] },
    'ICICIBANK': { 'keywords': ['ICICIBANK', 'ICICI BANK'], 'stockNames': ['ICICI BANK'] },
    'SBI':      { 'keywords': ['SBIN', 'SBI'], 'stockNames': ['STATE BANK OF INDIA', 'SBI LIFE'] },
    'ADANIENT': { 'keywords': ['ADANIENT', 'ADANI'], 'stockNames': ['ADANI ENTERPRISES', 'ADANI PORTS'] },
    'BHARTIARTL': { 'keywords': ['BHARTIARTL', 'BHARTI'], 'stockNames': ['BHARTI AIRTEL'] },
    'TATAMOTORS': { 'keywords': ['TATAMOTORS', 'TATA MOTORS', 'TMPV'], 'stockNames': ['TATA MOTORS', 'TATA MOTORS PASSENGER'] },
}

# Sentiment label → numeric score mapping
SENTIMENT_SCORE_MAP = {
    'very positive': 1.5,
    'positive': 1.0,
    'somewhat positive': 0.5,
    'neutral': 0.0,
    'somewhat negative': -0.5,
    'negative': -1.0,
    'very negative': -1.5,
}

TRADIENT_API_URL = 'https://api.tradient.org/v1/api/market/news'


def _is_match_for_company(item, clean_symbol):
    """Check if a news item belongs to the given company (mirrors news.js logic)."""
    search_config = COMPANY_SEARCH_MAP.get(clean_symbol)
    sm_sym = (item.get('sm_symbol') or '').upper()
    stock_name = (item.get('stock_name') or '').upper()
    display_sym = (item.get('display_symbol') or '').upper()

    if search_config:
        for kw in search_config['keywords']:
            if sm_sym == kw.upper():
                return True
        for sn in search_config['stockNames']:
            if sn.upper() in stock_name or sn.upper() in display_sym:
                return True
        return False

    return sm_sym == clean_symbol


def fetch_news_sentiment(symbol):
    """
    Fetch company-specific news from Tradient API, compute average sentiment score.
    Returns: (sentiment_score: float, article_count: int, sentiment_label: str)
    """
    clean_symbol = symbol.split('.')[0].upper()
    try:
        resp = requests.get(TRADIENT_API_URL, timeout=10)
        if resp.status_code != 200:
            return 0.0, 0, 'neutral'

        data = resp.json()
        if data.get('status') != 200 or not data.get('data', {}).get('latest_news'):
            return 0.0, 0, 'neutral'

        all_news = data['data']['latest_news']

        # Filter for this specific company
        company_news = [item for item in all_news if _is_match_for_company(item, clean_symbol)]

        if not company_news:
            return 0.0, 0, 'neutral'

        # Extract sentiment scores with recency weighting
        scores = []
        for i, item in enumerate(company_news):
            news_obj = item.get('news_object', {})
            sentiment_label = (news_obj.get('overall_sentiment') or 'neutral').lower().strip()
            score = SENTIMENT_SCORE_MAP.get(sentiment_label, 0.0)
            # More recent articles get higher weight
            weight = 1.0 / (i + 1)
            scores.append((score, weight))

        if not scores:
            return 0.0, 0, 'neutral'

        # Weighted average
        total_weight = sum(w for _, w in scores)
        avg_score = sum(s * w for s, w in scores) / total_weight if total_weight > 0 else 0.0
        avg_score = round(avg_score, 4)

        # Determine overall label
        if avg_score >= 0.5:
            label = 'positive'
        elif avg_score <= -0.5:
            label = 'negative'
        else:
            label = 'neutral'

        print(f"  [sentiment] {clean_symbol}: {len(company_news)} articles → score={avg_score}, label={label}")
        return avg_score, len(company_news), label

    except Exception as e:
        print(f"  [sentiment] Error fetching news for {clean_symbol}: {e}")
        return 0.0, 0, 'neutral'


# ─── Technical Indicator Functions ───────────────────────────
def calculate_rsi(data, window=14):
    delta = data.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def calculate_ema(data, window=12):
    return data.ewm(span=window, adjust=False).mean()


def calculate_macd(data, slow=26, fast=12):
    exp1 = data.ewm(span=fast, adjust=False).mean()
    exp2 = data.ewm(span=slow, adjust=False).mean()
    return exp1 - exp2


# ─── Data Fetching ───────────────────────────────────────────
def fetch_close_series(ticker, start, end):
    """Fetch Close price series for a ticker."""
    try:
        d = yf.download(ticker, start=start, end=end, progress=False)
        if d.empty:
            return None
        if isinstance(d.columns, pd.MultiIndex):
            try:
                c = d['Close']
                return c.iloc[:, 0] if isinstance(c, pd.DataFrame) else c
            except KeyError:
                return d.iloc[:, 0]
        return d['Close'] if 'Close' in d.columns else d.iloc[:, 0]
    except Exception:
        return None


def get_data(symbol):
    """Fetch main + context data for the given Yahoo Finance symbol.
    Context features match train_all_models.py: infy_close, wipro_close, nifty_close.
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=200)

    # Main symbol data
    df = yf.download(symbol, start=start_date, end=end_date, progress=False)
    if df.empty:
        raise ValueError(f"No data found for symbol {symbol}")

    df = df.reset_index()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.loc[:, ~df.columns.duplicated()]

    # Ensure Date is datetime
    if not pd.api.types.is_datetime64_any_dtype(df['Date']):
        df['Date'] = pd.to_datetime(df['Date'])

    # Merge context series helper
    def merge_series(main_df, series, name):
        if series is None:
            # Fallback: use company's own Close as proxy
            main_df[name] = main_df['Close'].astype(float)
            return main_df
        if isinstance(series, pd.DataFrame):
            s_df = series.copy()
            s_df.columns = [name]
        else:
            s_df = series.to_frame(name=name)
        if not isinstance(s_df.index, pd.DatetimeIndex):
            s_df.index = pd.to_datetime(s_df.index)
        merged = main_df.merge(s_df, left_on='Date', right_index=True, how='left')
        merged[name] = merged[name].ffill().bfill()
        return merged

    # Fetch and merge the same context tickers used during training
    for col_name, ctx_ticker in CONTEXT_TICKERS.items():
        series = fetch_close_series(ctx_ticker, start_date, end_date)
        df = merge_series(df, series, col_name)

    return df


# ─── Feature Engineering ─────────────────────────────────────
def prepare_features(df, sentiment_score=0.0):
    """Engineer all exact features and return the latest row."""
    df = df.copy()

    for c in ['Close', 'High', 'Low', 'Open', 'Volume',
              'infy_close', 'wipro_close', 'nifty_close']:
        df[c] = pd.to_numeric(df[c], errors='coerce')

    # Use real news sentiment score (0.0 = neutral fallback)
    df['sentiment'] = float(sentiment_score)
    df['rsi'] = calculate_rsi(df['Close'])
    df['ema'] = calculate_ema(df['Close'], window=12)
    df['macd'] = calculate_macd(df['Close'])

    for i in range(1, 11):
        df[f'lag_{i}'] = df['Close'].shift(i)

    df['day_of_week'] = df['Date'].dt.dayofweek
    df['month'] = df['Date'].dt.month

    df_clean = df.dropna().tail(1)
    if df_clean.empty:
        raise ValueError("Not enough data to calculate features")

    return df_clean


# ─── Model Loading ───────────────────────────────────────────
def load_model_for_symbol(symbol):
    """
    Load the per-company model and scaler.
    Falls back to the original TCS model if per-company model not found.
    """
    # Extract clean company name (RELIANCE.BO → reliance)
    clean_name = symbol.split('.')[0].lower()

    model_path = os.path.join(MODEL_DIR, f'{clean_name}_model.pkl')
    scaler_path = os.path.join(MODEL_DIR, f'{clean_name}_scaler.pkl')
    metrics_path = os.path.join(MODEL_DIR, f'{clean_name}_metrics.json')

    if os.path.exists(model_path) and os.path.exists(scaler_path):
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)

        # Load confidence from training metrics if available
        confidence = 85.0
        if os.path.exists(metrics_path):
            try:
                with open(metrics_path, 'r') as f:
                    metrics = json.load(f)
                r2 = metrics.get('R2', 0.85)
                dir_acc = metrics.get('Direction_Accuracy_%', 50)
                # Confidence = weighted combo of R² and direction accuracy
                # Clamp r2 to 0 to prevent negative values and ensure a minimum confidence of 50%
                r2_clamped = max(0, r2)
                confidence = round(max(50.0, min(r2_clamped * 60 + dir_acc * 0.4, 99.0)), 1)
            except Exception:
                pass

        return model, scaler, confidence, clean_name
    else:
        # Fallback to original model
        if os.path.exists(FALLBACK_MODEL) and os.path.exists(FALLBACK_SCALER):
            model = joblib.load(FALLBACK_MODEL)
            scaler = joblib.load(FALLBACK_SCALER)
            return model, scaler, 75.0, 'fallback'
        else:
            raise FileNotFoundError(
                f"No model found for {symbol}. "
                f"Run 'python train_all_models.py' first."
            )


# ─── Main ────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No symbol provided"}))
        return

    display_symbol = sys.argv[1]  # e.g. RELIANCE.BSE

    # Map .BSE to .BO for Yahoo Finance
    if display_symbol in BSE_TO_BO_MAP:
        yf_symbol = BSE_TO_BO_MAP[display_symbol]
    elif display_symbol.endswith('.BSE'):
        yf_symbol = display_symbol.replace('.BSE', '.BO')
    else:
        yf_symbol = display_symbol

    try:
        # Load per-company model
        model, scaler, confidence, model_name = load_model_for_symbol(yf_symbol)

        # Fetch live data
        df = get_data(yf_symbol)

        # Engineer features
        latest_data = prepare_features(df)

        # Extract feature matrix
        X = latest_data[FEATURE_COLS].values

        # Scale and predict
        X_scaled = scaler.transform(X)
        prediction = model.predict(X_scaled)[0]

        current_price = float(latest_data['Close'].values[0])
        predicted_price = float(prediction)

        result = {
            "symbol": display_symbol,
            "prediction": predicted_price,
            "current_price": current_price,
            "date": latest_data['Date'].dt.strftime('%Y-%m-%d').values[0],
            "confidence": confidence,
            "model_used": model_name
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
