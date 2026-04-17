"""
=============================================================
  Stock Price Prediction - Multi-Company Model Training Script
=============================================================
  Trains individual XGBoost models for each company stock.
  Each company gets its own model + scaler saved to ../model/

  Features (23 total):
    - Close, High, Low, Open, Volume
    - infy_close, wipro_close, nifty_close (market context)
    - rsi, ema, macd (technical indicators)
    - lag_1 ... lag_10 (lagged close prices)
    - day_of_week, month (calendar features)
  Note: sentiment is applied as a post-prediction adjustment, not a model feature.

  Target: Next day's Close price (target column)

  Usage:
    python train_all_models.py
    python train_all_models.py RELIANCE.BO   # Train single company
=============================================================
"""

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
    'TMPV.BO':       'Tata Motors Passenger',
}

# Context tickers (Indian market context features)
CONTEXT_TICKERS = {
    'infy_close':  'INFY.NS',
    'wipro_close': 'WIPRO.NS',
    'nifty_close': '^NSEI',
}

# Feature columns (must match predict.py and existing trained models exactly — 23 features)
# NOTE: 'sentiment' is excluded from model input features. It is applied post-prediction.
FEATURE_COLS = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'infy_close', 'wipro_close', 'nifty_close',
    'rsi', 'ema', 'macd',
    'lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5',
    'lag_6', 'lag_7', 'lag_8', 'lag_9', 'lag_10',
    'day_of_week', 'month'
]


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
    """Fetch Close price series for a ticker, handling yfinance quirks."""
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
    """Download full OHLCV data for a company."""
    print(f"  📥 Downloading {ticker} data ({start} to {end})...")
    df = yf.download(ticker, start=start, end=end, progress=False)

    if df.empty:
        raise ValueError(f"No data found for {ticker}")

    df = df.reset_index()

    # Flatten MultiIndex columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Remove duplicate columns
    df = df.loc[:, ~df.columns.duplicated()]

    print(f"    → {len(df)} trading days downloaded")
    return df


# ─── Feature Engineering ─────────────────────────────────────
def engineer_features(df, context_data):
    """
    Build the full 24-feature set + target column.
    context_data: dict of {column_name: pd.Series}
    """
    df = df.copy()

    # Ensure Date is datetime
    df['Date'] = pd.to_datetime(df['Date'])

    # 1. Merge context data (Infosys, Wipro, Nifty)
    for col_name, series in context_data.items():
        if series is not None:
            if isinstance(series, pd.DataFrame):
                s_df = series.copy()
                s_df.columns = [col_name]
            else:
                s_df = series.to_frame(name=col_name)

            if not isinstance(s_df.index, pd.DatetimeIndex):
                s_df.index = pd.to_datetime(s_df.index)

            df = df.merge(s_df, left_on='Date', right_index=True, how='left')
            df[col_name] = df[col_name].ffill().bfill()
        else:
            # Fallback: use the company's own Close as proxy
            df[col_name] = df['Close'].astype(float)

    # 2. Ensure numeric types
    for c in ['Close', 'High', 'Low', 'Open', 'Volume',
              'infy_close', 'wipro_close', 'nifty_close']:
        df[c] = pd.to_numeric(df[c], errors='coerce')

    # 3. Sentiment (neutral placeholder)
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

    # Drop rows with NaN (from lags/indicators/target)
    df = df.dropna()

    print(f"    → {len(df)} samples after feature engineering")
    return df


# ─── Model Training ──────────────────────────────────────────
def train_model(df, ticker_name):
    """Train XGBoost model and return model, scaler, and metrics."""
    X = df[FEATURE_COLS].values
    y = df['target'].values

    # Time-series split (80/20) — NO SHUFFLE for time series
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    print(f"    → Train: {len(X_train)} samples | Test: {len(X_test)} samples")

    # Scale features
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
    else:
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

    # Train with early stopping
    model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=False
    )

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    # Directional accuracy (did we predict the right direction?)
    direction_actual = np.diff(y_test) > 0
    direction_pred = np.diff(y_pred) > 0
    dir_accuracy = np.mean(direction_actual == direction_pred) * 100

    metrics = {
        'MAE': round(mae, 4),
        'RMSE': round(rmse, 4),
        'R2': round(r2, 4),
        'Direction_Accuracy_%': round(dir_accuracy, 2),
        'Train_Samples': len(X_train),
        'Test_Samples': len(X_test),
    }

    return model, scaler, metrics


# ─── Save Model ──────────────────────────────────────────────
def save_model(model, scaler, ticker, metrics):
    """Save model and scaler as .pkl files in the model/ directory."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Create clean filename from ticker (RELIANCE.BO → reliance)
    clean_name = ticker.split('.')[0].lower()

    model_path = os.path.join(MODEL_DIR, f'{clean_name}_model.pkl')
    scaler_path = os.path.join(MODEL_DIR, f'{clean_name}_scaler.pkl')
    metrics_path = os.path.join(MODEL_DIR, f'{clean_name}_metrics.json')

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f"    ✅ Saved: {model_path}")
    print(f"    ✅ Saved: {scaler_path}")
    print(f"    ✅ Saved: {metrics_path}")

    return model_path, scaler_path


# ─── Main Training Pipeline ─────────────────────────────────
def train_single_company(ticker, company_name, context_data):
    """Full pipeline: download → engineer → train → save for one company."""
    print(f"\n{'='*60}")
    print(f"  🏢 Training model for: {company_name} ({ticker})")
    print(f"{'='*60}")

    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=YEARS_OF_DATA * 365)

        # Download main data
        df = download_company_data(ticker, start_date, end_date)

        # Engineer features
        df = engineer_features(df, context_data)

        # Train
        model, scaler, metrics = train_model(df, ticker)

        # Print metrics
        print(f"\n    📊 Model Performance for {company_name}:")
        print(f"       MAE  (Mean Abs Error):  ₹{metrics['MAE']}")
        print(f"       RMSE (Root Mean Sq Err): ₹{metrics['RMSE']}")
        print(f"       R² Score:                {metrics['R2']}")
        print(f"       Direction Accuracy:      {metrics['Direction_Accuracy_%']}%")

        # Save
        save_model(model, scaler, ticker, metrics)

        return True, metrics

    except Exception as e:
        print(f"    ❌ FAILED for {company_name}: {e}")
        return False, None


def main():
    print("=" * 60)
    print("  📈 Stock Prediction Model Training Pipeline")
    print("  Training XGBoost models for Indian BSE/NSE stocks")
    print("=" * 60)

    # Determine which companies to train
    if len(sys.argv) > 1:
        # Train specific company
        target_ticker = sys.argv[1]
        if target_ticker in COMPANIES:
            companies_to_train = {target_ticker: COMPANIES[target_ticker]}
        else:
            # Try to match by name prefix
            companies_to_train = {target_ticker: target_ticker.split('.')[0]}
    else:
        companies_to_train = COMPANIES

    # Step 1: Download context data (shared across all companies)
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

    # Step 2: Train each company
    print(f"\n🏋️ Step 2: Training {len(companies_to_train)} models...")
    results = {}
    for ticker, name in companies_to_train.items():
        success, metrics = train_single_company(ticker, name, context_data)
        results[ticker] = {'success': success, 'metrics': metrics, 'name': name}

    # Step 3: Summary
    print("\n" + "=" * 60)
    print("  📋 TRAINING SUMMARY")
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
    print(f"  Models saved to: {os.path.abspath(MODEL_DIR)}")
    print("=" * 60)

    # Save summary
    summary_path = os.path.join(MODEL_DIR, 'training_summary.json')
    summary = {
        'trained_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_companies': len(results),
        'successful': success_count,
        'results': {
            t: {
                'name': r['name'],
                'success': r['success'],
                'metrics': r['metrics']
            } for t, r in results.items()
        }
    }
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"\n  📄 Summary saved to: {summary_path}")


if __name__ == '__main__':
    main()
