import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

def train_disaster_model():
    """
    Trains a Random Forest model to predict disaster risk (Flood, Drought)
    based on climate anomalies.
    """
    print("Loading historical climate data for Myanmar...")
    
    # Load the JSON we generated
    with open("web/data/macro/climate_disasters.json", "r") as f:
        data = json.load(f)
        
    df = pd.DataFrame(data)
    
    # Feature Engineering
    df['has_disaster'] = df['disasters'].apply(lambda x: 1 if len(x) > 0 else 0)
    
    X = df[['temp_anomaly_c', 'annual_precipitation_mm', 'el_nino_year']]
    y = df['has_disaster']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Random Forest Classifier on Climate Anomalies...")
    model = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    print("\nModel Evaluation:")
    print(classification_report(y_test, y_pred, zero_division=0))
    
    print("Model training complete. (Mock save to /models/disaster_rf.pkl)")

if __name__ == "__main__":
    train_disaster_model()
