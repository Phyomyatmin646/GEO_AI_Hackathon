import json
import pandas as pd
from sklearn.linear_model import LinearRegression
import numpy as np

def train_trade_forecast_model():
    """
    Trains a time-series forecasting model for agricultural exports.
    """
    print("Loading historical trade data for Myanmar...")
    
    with open("web/data/macro/advanced_trade.json", "r") as f:
        data = json.load(f)
        
    # Flatten JSON
    rows = []
    for year_obj in data:
        year = year_obj["year"]
        for p in year_obj["products"]:
            rows.append({
                "year": year,
                "product_id": p["product_id"],
                "export_value_usd": p["export_value_usd"]
            })
            
    df = pd.DataFrame(rows)
    
    print("Training Linear Regression Models for each product category to forecast next 5 years...")
    products = df['product_id'].unique()
    
    forecasts = {}
    
    for product in products:
        product_df = df[df['product_id'] == product]
        X = product_df[['year']]
        y = product_df['export_value_usd']
        
        model = LinearRegression()
        model.fit(X, y)
        
        # Predict 2026-2030
        future_years = np.array([[2026], [2027], [2028], [2029], [2030]])
        preds = model.predict(future_years)
        forecasts[product] = preds.tolist()
        
    print("\nForecast successfully generated.")
    for product, preds in forecasts.items():
        print(f"{product.upper()} 2030 Forecast: ${(preds[-1] / 1_000_000):.2f}M")
        
    print("Model training complete. (Mock save to /models/trade_lr.pkl)")

if __name__ == "__main__":
    train_trade_forecast_model()
