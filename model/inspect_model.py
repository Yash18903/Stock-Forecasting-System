
import pickle
import joblib
import numpy as np
import pandas as pd # use only to verify libraries

item_path = "d:/Final Year Project/Implementation/model/backend_stock_model.pkl"
scaler_path = "d:/Final Year Project/Implementation/model/backend_scaler.pkl"

try:
    with open(item_path, 'rb') as f:
        model = pickle.load(f)
    print("Model type:", type(model))
    
    if hasattr(model, 'n_features_in_'):
        print("Number of features expected:", model.n_features_in_)
    
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    print("Scaler type:", type(scaler))
    if hasattr(scaler, 'n_features_in_'):
         print("Scaler features expected:", scaler.n_features_in_)
         
except Exception as e:
    print("Error loading pickle:", e)

try:
    # also check if joblib works better if pickle fails (common issue)
    model = joblib.load(item_path)
    print("Joblib load success. Model type:", type(model))
except:
    pass
