import sys
import os
import glob
import json
import numpy as np
import pandas as pd
import joblib
import yfinance as yf
from datetime import datetime, timedelta
from xgboost import XGBRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings

warnings.filterwarnings('ignore')

# ─── Configuration ───────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'model')
DATASETS_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'Dataset', 'catagory')

YEARS_OF_DATA = 10 

COMPANIES = {
    'RELIANCE.BO':   {'name': 'Reliance Industries', 'sector': 'Energy'},
    'TCS.BO':        {'name': 'Tata Consultancy Services', 'sector': 'IT'},
    'WIPRO.BO':      {'name': 'Wipro', 'sector': 'IT'},
    'INFY.BO':       {'name': 'Infosys', 'sector': 'IT'},
    'HDFCBANK.BO':   {'name': 'HDFC Bank', 'sector': 'Bank'},
    'ITC.BO':        {'name': 'ITC Limited', 'sector': 'FMCG'},
    'ICICIBANK.BO':  {'name': 'ICICI Bank', 'sector': 'Bank'},
    'SBIN.BO':       {'name': 'State Bank of India', 'sector': 'Bank'},
    'ADANIENT.BO':   {'name': 'Adani Enterprises', 'sector': 'Miscellaneous'},
    'BHARTIARTL.BO': {'name': 'Bharti Airtel', 'sector': 'Telecom'},
    'TMPV.BO':       {'name': 'Tata Motors Passenger', 'sector': 'Auto'},
}

# Feature columns
FEATURE_COLS = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'sector_close', 'nifty_close',
    'sentiment', 'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]

# ─── Datasets Paths ──────────────────────────────────────────
SENTIMENT_DATA_PATH = os.path.join(DATASETS_BASE_DIR, 'News and Sentiment Data', 'archive', 'NifSent', 'final_news_sentiment_analysis.csv')
API_SOURCES_DIR = os.path.join(DATASETS_BASE_DIR, 'API Sources')
STOCK_PRICE_DIR = os.path.join(DATASETS_BASE_DIR, 'Stock Price Data')

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

# ─── Load Local Data functions ───────────────────────────────
def get_clean_sentiment_data():
    """Reads and cleans the sentiment dataset"""
    print(f"\n📰 Loading sentiment dataset from {SENTIMENT_DATA_PATH}...")
    try:
        df = pd.read_csv(SENTIMENT_DATA_PATH)
        df['Publish Date'] = pd.to_datetime(df['Publish Date'], errors='coerce')
        df = df.dropna(subset=['Publish Date'])
        sentiment_map = {'Positive': 1.0, 'Negative': -1.0, 'Neutral': 0.0}
        df['Sentiment_Score'] = df['Sentiment'].map(sentiment_map).fillna(0.0)
        daily_sentiment = df.groupby(['Symbol', 'Publish Date'])['Sentiment_Score'].mean().reset_index()
        daily_sentiment.columns = ['Symbol', 'Date', 'sentiment']
        print(f"  → Prepared {len(daily_sentiment)} sentiment records.")
        return daily_sentiment
    except Exception as e:
        print(f"  ⚠ Failed to load sentiment dataset: {e}")
        return pd.DataFrame(columns=['Symbol', 'Date', 'sentiment'])

def clean_api_source_price(price_str):
    if pd.isna(price_str): return np.nan
    if isinstance(price_str, (int, float)): return float(price_str)
    return float(str(price_str).replace(',', ''))

def load_sector_indexes():
    print(f"\n📊 Scanning API Sources for Sector Context...")
    sectors = {}
    
    # 1. Bank NIFTY
    try:
        df = pd.read_csv(os.path.join(API_SOURCES_DIR, 'Bank NIFTY Futures Historical Data.csv'))
        df['Date'] = pd.to_datetime(df['Date'], format='%d-%m-%Y', errors='coerce')
        df['Price'] = df['Price'].apply(clean_api_source_price)
        sectors['Bank'] = df[['Date', 'Price']].rename(columns={'Price': 'sector_close'}).dropna().drop_duplicates(subset=['Date'])
        print(f"  → Loaded Bank NIFTY ({len(sectors['Bank'])} records)")
    except Exception as e: print(f"  ⚠ Failed Bank NIFTY: {e}")

    # 2. Energy
    try:
        df = pd.read_csv(os.path.join(API_SOURCES_DIR, 'S&P BSE Energy Historical Data.csv'))
        df['Date'] = pd.to_datetime(df['Date'], format='%d-%m-%Y', errors='coerce')
        df['Price'] = df['Price'].apply(clean_api_source_price)
        sectors['Energy'] = df[['Date', 'Price']].rename(columns={'Price': 'sector_close'}).dropna().drop_duplicates(subset=['Date'])
        print(f"  → Loaded BSE Energy ({len(sectors['Energy'])} records)")
    except Exception as e: print(f"  ⚠ Failed BSE Energy: {e}")

    # 3. Nifty 50 (General Market)
    try:
        df = pd.read_csv(os.path.join(API_SOURCES_DIR, 'Nifty 50 Futures Historical Data.csv'))
        df['Date'] = pd.to_datetime(df['Date'], format='%d-%m-%Y', errors='coerce')
        df['Price'] = df['Price'].apply(clean_api_source_price)
        sectors['Nifty'] = df[['Date', 'Price']].rename(columns={'Price': 'nifty_close'}).dropna().drop_duplicates(subset=['Date'])
        print(f"  → Loaded Nifty 50 ({len(sectors['Nifty'])} records)")
    except Exception as e: print(f"  ⚠ Failed Nifty 50: {e}")

    return sectors

def load_stock_price_data(ticker):
    print(f"  📥 Scanning local Stock Price Data for {ticker}...")
    clean_ticker = ticker.split('.')[0]
    
    found_file = None
    for root, dirs, files in os.walk(STOCK_PRICE_DIR):
        for file in files:
            if file.upper() == f"{clean_ticker}.CSV":
                found_file = os.path.join(root, file)
                break
            # Fallback for Tata Motors Passenger Vehicles (TMPV) to use historical TATAMOTORS data
            if clean_ticker == 'TMPV' and file.upper() == 'TATAMOTORS.CSV':
                found_file = os.path.join(root, file)
                break
        if found_file: break

    local_df = pd.DataFrame()
    if found_file:
        try:
            df = pd.read_csv(found_file)
            if 'Date' in df.columns and 'Close' in df.columns:
                df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
                df = df.dropna(subset=['Date'])
                df = df.drop_duplicates(subset=['Date'])
                
                req_cols = ['Date', 'Close', 'High', 'Low', 'Open', 'Volume']
                available = []
                for c in req_cols:
                    if c in df.columns:
                        # strictly get first occurrence to avoid ambiguity
                        if isinstance(df[c], pd.DataFrame):
                            df[c] = df[c].iloc[:, 0]
                        if c != 'Date':
                            df[c] = pd.to_numeric(df[c], errors='coerce')
                        available.append(c)
                        
                local_df = df[available].dropna(subset=['Close']).copy()
                print(f"    → Found local file: {found_file} ({len(local_df)} historical records)")
        except Exception as e:
            print(f"    ⚠ Failed parsing local data {found_file}: {e}")

    end_date = datetime.now()
    start_date = end_date - timedelta(days=YEARS_OF_DATA*365)
    
    print(f"    → Fetching latest data from yfinance...")
    yf_df = yf.download(ticker, start=start_date, end=end_date, progress=False)
    if not yf_df.empty:
        yf_df = yf_df.reset_index()
        if isinstance(yf_df.columns, pd.MultiIndex):
            yf_df.columns = yf_df.columns.get_level_values(0)
        
        # force uniqueness on yfinance columns and dates
        yf_df = yf_df.loc[:, ~yf_df.columns.duplicated()]
        yf_df['Date'] = pd.to_datetime(yf_df['Date']).dt.tz_localize(None)
        yf_df = yf_df.dropna(subset=['Date']).drop_duplicates(subset=['Date'])

    if not local_df.empty and not yf_df.empty:
        combined = pd.concat([local_df, yf_df], ignore_index=True)
        combined = combined.drop_duplicates(subset=['Date'], keep='last').sort_values('Date')
    elif not yf_df.empty:
        combined = yf_df
    elif not local_df.empty:
        combined = local_df
    else:
         raise ValueError(f"No price data found for {ticker}")

    print(f"    → Total final records mapped: {len(combined)}")
    return combined.reset_index(drop=True)

# ─── Feature Engineering ─────────────────────────────────────
def engineer_features(df, sector_indexes, ticker, sector_name, sentiment_dataset):
    df = df.copy()
    df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)

    # 1. Merge the proper Sector Index
    sector_df = sector_indexes.get(sector_name, pd.DataFrame())
    if not sector_df.empty:
        sector_df['Date'] = pd.to_datetime(sector_df['Date']).dt.tz_localize(None)
        df = df.merge(sector_df, on='Date', how='left')
        df['sector_close'] = df['sector_close'].ffill().bfill() # ffill missing index days
    else:
        # fallback if sector not found
        df['sector_close'] = df['Close']

    # 2. Merge General Market Nifty 50 Index
    nifty_df = sector_indexes.get('Nifty', pd.DataFrame())
    if not nifty_df.empty:
        nifty_df['Date'] = pd.to_datetime(nifty_df['Date']).dt.tz_localize(None)
        df = df.merge(nifty_df, on='Date', how='left')
        df['nifty_close'] = df['nifty_close'].ffill().bfill()
    else:
        df['nifty_close'] = df['Close']

    for c in ['Close', 'High', 'Low', 'Open', 'Volume', 'sector_close', 'nifty_close']:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')

    # 3. Merge Local Sentiment Data
    symbol = ticker.split('.')[0]
    company_sentiment = sentiment_dataset[sentiment_dataset['Symbol'] == symbol]
    
    if not company_sentiment.empty:
        company_sentiment['Date'] = pd.to_datetime(company_sentiment['Date']).dt.tz_localize(None)
        company_sentiment = company_sentiment.drop(columns=['Symbol'])
        df = df.merge(company_sentiment, on='Date', how='left')
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

    # 6. Calendar & Time features
    df['day_of_week'] = df['Date'].dt.dayofweek
    df['month'] = df['Date'].dt.month

    # 7. Target: 1-DAY PREDICTION
    df['target'] = df['Close'].shift(-1)
    
    df = df.dropna()
    print(f"    → {len(df)} samples robustly structured after feature fusion")
    return df

# ─── Model Training ──────────────────────────────────────────
def train_model(df, ticker_name):
    if ticker_name == 'TMPV.BO':
        # Limit to the post-pandemic dataset sizes
        df = df.tail(1500)

    # Select available columns only (in case some were dropped)
    use_cols = [c for c in FEATURE_COLS if c in df.columns]
    X = df[use_cols].values
    y = df['target'].values

    split_idx = int(len(X) * 0.98)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    print(f"    → Splitting: Train={len(X_train)} | Test={len(X_test)}")

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    if ticker_name == 'BHARTIARTL.BO':
        model = XGBRegressor(
            n_estimators=1000,
            max_depth=8,
            learning_rate=0.015,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_alpha=0.1,
            reg_lambda=1.5,
            random_state=42,
            n_jobs=-1,
            verbosity=0
        )
    elif ticker_name == 'TMPV.BO':
        model = XGBRegressor(
            n_estimators=1000,
            max_depth=6,
            learning_rate=0.01,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.5,
            reg_lambda=2.0,
            random_state=42,
            n_jobs=-1,
            verbosity=0
        )
    else:
        model = XGBRegressor(
            n_estimators=600,
            max_depth=6,
            learning_rate=0.03,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.2,
            reg_lambda=1.2,
            random_state=42,
            n_jobs=-1,
            verbosity=0
        )
        
    if hasattr(model, 'fit'):
        model.fit(X_train_scaled, y_train, eval_set=[(X_test_scaled, y_test)], verbose=False)

    y_pred = model.predict(X_test_scaled)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    dir_actual = np.diff(y_test) > 0
    dir_pred = np.diff(y_pred) > 0
    dir_acc = np.mean(dir_actual == dir_pred) * 100 if len(y_test) > 1 else 0

    metrics = {
        'MAE': round(mae, 4),
        'RMSE': round(rmse, 4),
        'R2': round(r2, 4),
        'Direction_Accuracy_%': round(dir_acc, 2),
        'Training_Algorithm': 'Advanced Sector+Sentiment XGBoost',
        'Features_Count': len(use_cols)
    }
    return model, scaler, metrics, use_cols

def save_model(model, scaler, ticker, metrics, use_cols):
    os.makedirs(MODEL_DIR, exist_ok=True)
    clean_name = ticker.split('.')[0].lower()

    # Prefix local_advanced ensures it replaces the old models without cluttering
    model_path = os.path.join(MODEL_DIR, f'{clean_name}_model.pkl')
    scaler_path = os.path.join(MODEL_DIR, f'{clean_name}_scaler.pkl')
    metrics_path = os.path.join(MODEL_DIR, f'{clean_name}_metrics.json')

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    
    # Store the actual columns used so predict.py knows exactly what it trained on
    metrics['features_used'] = use_cols
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f"    ✅ Overwritten base model with highly accurate model at: {model_path}")

# ─── Main Pipeline ───────────────────────────────────────────
def main():
    print("=" * 70)
    print("  📈 Stock Prediction 1-Day Training")
    print("  Using Local Stock CSVs + Sector Indexes (API) + Local News Sentiment")
    print("=" * 70)

    sentiment_dataset = get_clean_sentiment_data()
    sector_indexes = load_sector_indexes()

    if len(sys.argv) > 1:
        target_ticker = sys.argv[1]
        if target_ticker in COMPANIES:
            companies_to_train = {target_ticker: COMPANIES[target_ticker]}
        else:
            companies_to_train = {target_ticker: target_ticker.split('.')[0]}
    else:
        companies_to_train = COMPANIES

    for ticker, info in companies_to_train.items():
        name = info['name']
        sector = info['sector']
        
        print(f"\n{'='*70}")
        print(f"  🏢 Training Advanced 1-Day Model for: {name} ({ticker}) ")
        print(f"  Sector Context Applied: {sector}")
        print(f"{'='*70}")

        try:
            df = load_stock_price_data(ticker)
            df = engineer_features(df, sector_indexes, ticker, sector, sentiment_dataset)
            model, scaler, metrics, use_cols = train_model(df, ticker)

            print(f"\n    📊 Analytics Metrics:")
            print(f"       MAE:             ₹{metrics['MAE']}")
            print(f"       RMSE:            ₹{metrics['RMSE']}")
            print(f"       R² Score:         {metrics['R2']}")
            print(f"       Direction Acc.:   {metrics['Direction_Accuracy_%']}%")

            save_model(model, scaler, ticker, metrics, use_cols)

        except Exception as e:
            print(f"    ❌ FAILED for {name}: {e}")

if __name__ == '__main__':
    main()
