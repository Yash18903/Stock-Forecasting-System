import sys
import os
import json
import numpy as np
import pandas as pd
import joblib
import yfinance as yf
from datetime import datetime, timedelta
from xgboost import XGBRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings

warnings.filterwarnings('ignore')

# ─── Configuration ───────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'model')
YEARS_OF_DATA = 10  # Download 10 years of historical data for training

# All companies to train (Yahoo Finance ticker format)
COMPANIES = {
    'RELIANCE.BO':   'Reliance Industries',
    'TCS.BO':        'Tata Consultancy Services',
    'WIPRO.BO':      'Wipro',
    'INFY.BO':       'Infosys',
    'HDFCBANK.BO':   'HDFC Bank',
    'ITC.BO':        'ITC Limited',
    'ICICIBANK.BO':  'ICICI Bank',
    'SBIN.BO':       'State Bank of India',
    'ADANIENT.BO':   'Adani Enterprises',
    'BHARTIARTL.BO': 'Bharti Airtel',
}

# Context tickers (Indian market context features)
CONTEXT_TICKERS = {
    'infy_close':  'INFY.NS',
    'wipro_close': 'WIPRO.NS',
    'nifty_close': '^NSEI',
}

# Feature columns (must match predict.py exactly)
FEATURE_COLS = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'infy_close', 'wipro_close', 'nifty_close',
    'sentiment', 'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]

# Dataset Path
SENTIMENT_DATA_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'Dataset', 'catagory', 
    'News and Sentiment Data', 'archive', 'NifSent', 'final_news_sentiment_analysis.csv'
)

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

# ─── Preprocess Sentiment Data ───────────────────────────────
def get_clean_sentiment_data():
    """Reads and cleans the sentiment dataset provided by the user."""
    print(f"\n📰 Loading sentiment dataset from {SENTIMENT_DATA_PATH}...")
    df = pd.read_csv(SENTIMENT_DATA_PATH)
    
    # Clean dates
    df['Publish Date'] = pd.to_datetime(df['Publish Date'], errors='coerce')
    df = df.dropna(subset=['Publish Date'])
    
    # Map sentiments to numeric values
    sentiment_map = {'Positive': 1.0, 'Negative': -1.0, 'Neutral': 0.0}
    df['Sentiment_Score'] = df['Sentiment'].map(sentiment_map).fillna(0.0)
    
    # Group by Symbol and Date, get daily average sentiment
    daily_sentiment = df.groupby(['Symbol', 'Publish Date'])['Sentiment_Score'].mean().reset_index()
    daily_sentiment.columns = ['Symbol', 'Date', 'sentiment']
    
    print(f"  → Cleaned {len(daily_sentiment)} daily sentiment records across {daily_sentiment['Symbol'].nunique()} symbols.")
    return daily_sentiment

# ─── Data Fetching ───────────────────────────────────────────
def fetch_close_series(ticker, start, end):
    try:
        d = yf.download(ticker, start=start, end=end, progress=False)
        if d.empty:
            return None
        if isinstance(d.columns, pd.MultiIndex):
            try:
                c = d['Close']
                if isinstance(c, pd.DataFrame):
                    return c.iloc[:, 0]
                return c
            except KeyError:
                return d.iloc[:, 0]
        if 'Close' in d.columns:
            return d['Close']
        return d.iloc[:, 0]
    except Exception as e:
        print(f"  ⚠ Could not fetch {ticker}: {e}")
        return None

def download_company_data(ticker, start, end):
    print(f"  📥 Downloading {ticker} data ({start} to {end})...")
    df = yf.download(ticker, start=start, end=end, progress=False)
    if df.empty:
        raise ValueError(f"No data found for {ticker}")
    df = df.reset_index()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.loc[:, ~df.columns.duplicated()]
    print(f"    → {len(df)} trading days downloaded")
    return df

# ─── Feature Engineering ─────────────────────────────────────
def engineer_features(df, context_data, ticker, sentiment_dataset):
    df = df.copy()
    if 'Date' in df.columns:
        df['Date'] = pd.to_datetime(df['Date'])
    else:
        df['Date'] = pd.to_datetime(df.index)
        
    df['Date'] = df['Date'].dt.tz_localize(None) # remove tz if any

    # 1. Merge context data
    for col_name, series in context_data.items():
        if series is not None:
            if isinstance(series, pd.DataFrame):
                s_df = series.copy()
                s_df.columns = [col_name]
            else:
                s_df = series.to_frame(name=col_name)
            if not isinstance(s_df.index, pd.DatetimeIndex):
                s_df.index = pd.to_datetime(s_df.index)
            s_df.index = s_df.index.tz_localize(None)
            
            df = df.merge(s_df, left_on='Date', right_index=True, how='left')
            df[col_name] = df[col_name].ffill().bfill()
        else:
            df[col_name] = df['Close'].astype(float)

    for c in ['Close', 'High', 'Low', 'Open', 'Volume', 'infy_close', 'wipro_close', 'nifty_close']:
        df[c] = pd.to_numeric(df[c], errors='coerce')

    # 2. Merge Sentiment Data
    symbol = ticker.split('.')[0]
    company_sentiment = sentiment_dataset[sentiment_dataset['Symbol'] == symbol]
    
    if not company_sentiment.empty:
        company_sentiment['Date'] = pd.to_datetime(company_sentiment['Date']).dt.tz_localize(None)
        # Drop 'Symbol' to avoid redundant columns during merge
        company_sentiment = company_sentiment.drop(columns=['Symbol'])
        df = df.merge(company_sentiment, on='Date', how='left')
        
        # Forward fill up to 3 days of sentiment to simulate market impact carryover
        df['sentiment'] = df['sentiment'].fillna(method='ffill', limit=3).fillna(0.0)
    else:
        df['sentiment'] = 0.0
        
    # 4. Technical indicators
    df['rsi'] = calculate_rsi(df['Close'])
    df['ema'] = calculate_ema(df['Close'], window=12)
    df['macd'] = calculate_macd(df['Close'])

    # 5. Lag features (1..10 days)
    for i in range(1, 11):
        df[f'lag_{i}'] = df['Close'].shift(i)

    # 6. Calendar features
    df['day_of_week'] = df['Date'].dt.dayofweek
    df['month'] = df['Date'].dt.month

    # 7. Target: next day's Close price
    df['target'] = df['Close'].shift(-1)
    df = df.dropna()

    print(f"    → {len(df)} samples after feature engineering")
    return df

# ─── Model Training ──────────────────────────────────────────
def train_model(df, ticker_name):
    X = df[FEATURE_COLS].values
    y = df['target'].values

    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    print(f"    → Train: {len(X_train)} samples | Test: {len(X_test)} samples")

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = XGBRegressor(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbosity=0
    )
    if hasattr(model, 'fit'):
        try:
            model.fit(
                X_train_scaled, y_train,
                eval_set=[(X_test_scaled, y_test)],
                verbose=False
            )
        except TypeError: # Older XGBoost versions handling
             model.fit(
                X_train_scaled, y_train,
                eval_set=[(X_test_scaled, y_test)],
                verbose=False
            )

    y_pred = model.predict(X_test_scaled)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    direction_actual = np.diff(y_test) > 0
    direction_pred = np.diff(y_pred) > 0
    dir_accuracy = np.mean(direction_actual == direction_pred) * 100 if len(y_test) > 1 else 0

    metrics = {
        'MAE': round(mae, 4),
        'RMSE': round(rmse, 4),
        'R2': round(r2, 4),
        'Direction_Accuracy_%': round(dir_accuracy, 2),
        'Train_Samples': len(X_train),
        'Test_Samples': len(X_test),
        'Trained_With_Sentiment': True
    }
    return model, scaler, metrics

# ─── Save Model ──────────────────────────────────────────────
def save_model(model, scaler, ticker, metrics):
    """Saves as separate sentiment models"""
    os.makedirs(MODEL_DIR, exist_ok=True)
    clean_name = ticker.split('.')[0].lower()

    # NOTE: Using _sentiment_model suffix to keep it entirely separate from the base models
    model_path = os.path.join(MODEL_DIR, f'{clean_name}_sentiment_model.pkl')
    scaler_path = os.path.join(MODEL_DIR, f'{clean_name}_sentiment_scaler.pkl')
    metrics_path = os.path.join(MODEL_DIR, f'{clean_name}_sentiment_metrics.json')

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f"    ✅ Saved Sentiment Model: {model_path}")
    return model_path, scaler_path

# ─── Main Pipeline ───────────────────────────────────────────
def train_single_company(ticker, company_name, context_data, sentiment_dataset):
    print(f"\n{'='*60}")
    print(f"  🏢 Training Sentiment Model for: {company_name} ({ticker})")
    print(f"{'='*60}")

    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=YEARS_OF_DATA * 365)

        df = download_company_data(ticker, start_date, end_date)
        df = engineer_features(df, context_data, ticker, sentiment_dataset)
        model, scaler, metrics = train_model(df, ticker)

        print(f"\n    📊 Model Performance:")
        print(f"       MAE:             ₹{metrics['MAE']}")
        print(f"       RMSE:            ₹{metrics['RMSE']}")
        print(f"       R² Score:         {metrics['R2']}")
        print(f"       Direction Acc.:   {metrics['Direction_Accuracy_%']}%")

        save_model(model, scaler, ticker, metrics)
        return True, metrics

    except Exception as e:
        print(f"    ❌ FAILED for {company_name}: {e}")
        return False, None

def main():
    print("=" * 60)
    print("  📈 Stock Prediction Model Training (WITH SENTIMENT)")
    print("  Training XGBoost models using cleaned Local Sentiment Dataset")
    print("=" * 60)
    
    # Determine which companies to train
    if len(sys.argv) > 1:
        target_ticker = sys.argv[1]
        if target_ticker in COMPANIES:
            companies_to_train = {target_ticker: COMPANIES[target_ticker]}
        else:
            companies_to_train = {target_ticker: target_ticker.split('.')[0]}
    else:
        companies_to_train = COMPANIES

    sentiment_dataset = get_clean_sentiment_data()

    print("\n📡 Step 1: Downloading market context data...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=YEARS_OF_DATA * 365)

    context_data = {}
    for col_name, ctx_ticker in CONTEXT_TICKERS.items():
        print(f"  Fetching {ctx_ticker} for feature '{col_name}'...")
        series = fetch_close_series(ctx_ticker, start_date, end_date)
        context_data[col_name] = series
        if series is not None:
            print(f"    → {len(series)} data points")
        else:
            print(f"    ⚠ Failed, will use fallback")

    print(f"\n🏋️ Step 2: Training {len(companies_to_train)} sentiment-enhanced models...")
    results = {}
    for ticker, name in companies_to_train.items():
        success, metrics = train_single_company(ticker, name, context_data, sentiment_dataset)
        results[ticker] = {'success': success, 'metrics': metrics, 'name': name}

    print("\n" + "=" * 60)
    print("  📋 SENTIMENT TRAINING SUMMARY")
    print("=" * 60)

    success_count = 0
    for ticker, result in results.items():
        status = "✅" if result['success'] else "❌"
        if result['success']:
            success_count += 1
            m = result['metrics']
            print(f"  {status} {result['name']:30s} | R²={m['R2']:.4f} | Dir={m['Direction_Accuracy_%']}%")
        else:
            print(f"  {status} {result['name']:30s} | FAILED")

    print(f"\n  Total: {success_count}/{len(results)} models trained successfully")
    print("=" * 60)

if __name__ == '__main__':
    main()
