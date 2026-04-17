
import pickle
import numpy as np

try:
    with open("backend_stock_model.pkl", 'rb') as f:
        model = pickle.load(f)
    print("Features:", model.n_features_in_)
    # Also print feature names if available
    if hasattr(model, 'feature_names_in_'):
        print("Feature Names:", list(model.feature_names_in_))
        
    with open("backend_scaler.pkl", 'rb') as f:
        scaler = pickle.load(f)
    print("Scaler features:", scaler.n_features_in_)
except Exception as e:
    print(e)
