import json
import os
import numpy as np
from sklearn.linear_model import LinearRegression

def forecast_macro_data(input_json, output_json, years_to_forecast=5):
    with open(input_json, "r") as f:
        data = json.load(f)
        
    # Clean NaNs by forward filling or dropping
    import pandas as pd
    df = pd.DataFrame(data)
    for col in ["gdp_usd", "agri_pct_of_gdp", "exports_usd"]:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.interpolate(method='linear', limit_direction='both').fillna(0)
    
    years = df["year"].values.reshape(-1, 1)
    gdp = df["gdp_usd"].values
    agri = df["agri_pct_of_gdp"].values
    exports = df["exports_usd"].values
    
    # Train models
    model_gdp = LinearRegression().fit(years, gdp)
    model_agri = LinearRegression().fit(years, agri)
    model_exports = LinearRegression().fit(years, exports)
    
    last_year = int(years[-1][0])
    future_years = np.array(range(last_year + 1, last_year + 1 + years_to_forecast)).reshape(-1, 1)
    
    pred_gdp = model_gdp.predict(future_years)
    pred_agri = model_agri.predict(future_years)
    pred_exports = model_exports.predict(future_years)
    
    forecasts = []
    for i in range(years_to_forecast):
        forecasts.append({
            "year": int(future_years[i][0]),
            "gdp_usd": max(0, float(pred_gdp[i])),
            "agri_pct_of_gdp": max(0, float(pred_agri[i])),
            "exports_usd": max(0, float(pred_exports[i])),
            "is_forecast": True
        })
        
    # Append forecasts to original data
    for d in data:
        d["is_forecast"] = False
        
    combined = data + forecasts
    
    with open(output_json, "w") as f:
        json.dump(combined, f, indent=2)
        
    print(f"Generated {years_to_forecast} years of forecast.")

if __name__ == "__main__":
    import sys
    base_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    input_path = os.path.join(base_dir, "web/data/macro/macro_economics.json")
    output_path = os.path.join(base_dir, "web/data/macro/macro_forecast.json")
    forecast_macro_data(input_path, output_path)
