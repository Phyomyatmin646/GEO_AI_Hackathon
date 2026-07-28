import os
import pandas as pd
import numpy as np

OUTPUT_DIR = "data/raw/training_datasets"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_health_disease(n_samples=5000):
    """
    Dataset 1: Crop Health & Disease Prediction
    Based on NDVI (Sentinel-2), Temp, Humidity, and Rainfall.
    """
    np.random.seed(42)
    regions = np.random.choice(['Ayeyawaddy', 'Sagaing', 'Mandalay', 'Bago', 'Magway'], n_samples)
    
    ndvi = np.random.uniform(0.1, 0.9, n_samples)
    temp_c = []
    humidity_pct = []
    rainfall_mm = []
    
    # Adjust climate based on region
    for r in regions:
        if r in ['Mandalay', 'Magway', 'Sagaing']: # Dry zone
            temp_c.append(np.random.uniform(25.0, 42.0))
            humidity_pct.append(np.random.uniform(30.0, 75.0))
            rainfall_mm.append(np.random.uniform(0, 150))
        else: # Delta / Bago
            temp_c.append(np.random.uniform(22.0, 35.0))
            humidity_pct.append(np.random.uniform(60.0, 95.0))
            rainfall_mm.append(np.random.uniform(50, 400))
            
    temp_c = np.array(temp_c)
    humidity_pct = np.array(humidity_pct)
    rainfall_mm = np.array(rainfall_mm)
    
    # Logic for Disease Risk (0: Healthy, 1: Warning, 2: Infected)
    # Fungal diseases love high humidity and moderate-to-high temps.
    risk = np.zeros(n_samples, dtype=int)
    for i in range(n_samples):
        if humidity_pct[i] > 80 and 25 < temp_c[i] < 32 and ndvi[i] < 0.6:
            risk[i] = 2  # Infected
        elif humidity_pct[i] > 70 and ndvi[i] < 0.75:
            risk[i] = 1  # Warning
        elif ndvi[i] < 0.3:
            risk[i] = 1  # General stress (warning)
        else:
            risk[i] = 0  # Healthy

    df = pd.DataFrame({
        'Region': regions,
        'NDVI_Index': ndvi.round(3),
        'Temperature_C': temp_c.round(1),
        'Humidity_Pct': humidity_pct.round(1),
        'Rainfall_mm': rainfall_mm.round(1),
        'Disease_Risk_Status': risk
    })
    df.to_csv(f"{OUTPUT_DIR}/crop_health_disease.csv", index=False)
    print(f"Generated {OUTPUT_DIR}/crop_health_disease.csv")

def generate_yield_prediction(n_samples=5000):
    """
    Dataset 2: Crop Yield Prediction
    """
    np.random.seed(43)
    regions = np.random.choice(['Ayeyawaddy', 'Sagaing', 'Mandalay', 'Bago', 'Magway'], n_samples)
    crop_types = []
    
    # Region-specific crop probabilities
    for r in regions:
        if r in ['Mandalay', 'Magway', 'Sagaing']:
            crop_types.append(np.random.choice(['Rice', 'Maize', 'Beans'], p=[0.2, 0.3, 0.5]))
        else:
            crop_types.append(np.random.choice(['Rice', 'Maize', 'Beans'], p=[0.7, 0.1, 0.2]))
            
    crop_types = np.array(crop_types)
    soil_n = np.random.uniform(10, 50, n_samples) # Nitrogen
    soil_ph = np.random.uniform(4.5, 8.5, n_samples)
    peak_evi = np.random.uniform(0.3, 0.85, n_samples)
    hist_rain = np.random.uniform(800, 3500, n_samples)
    
    yields = []
    for i in range(n_samples):
        crop = crop_types[i]
        # Base yields in Tons/Acre
        if crop == 'Rice': base = 2.0
        elif crop == 'Maize': base = 2.5
        elif crop == 'Sugarcane': base = 25.0
        else: base = 1.0 # Beans
        
        # Adjust based on soil and EVI
        ph_factor = 1.0 if 5.5 <= soil_ph[i] <= 7.0 else 0.7
        n_factor = soil_n[i] / 30.0
        evi_factor = peak_evi[i] / 0.6
        
        final_yield = base * ph_factor * n_factor * evi_factor * np.random.uniform(0.9, 1.1)
        yields.append(max(0.1, round(final_yield, 2)))
        
    df = pd.DataFrame({
        'Region': regions,
        'Crop_Type': crop_types,
        'Soil_Nitrogen_Level': soil_n.round(1),
        'Soil_pH': soil_ph.round(2),
        'Peak_EVI': peak_evi.round(3),
        'Historical_Rainfall_mm': hist_rain.round(1),
        'Yield_Tons_Per_Acre': yields
    })
    df.to_csv(f"{OUTPUT_DIR}/crop_yield_prediction.csv", index=False)
    print(f"Generated {OUTPUT_DIR}/crop_yield_prediction.csv")

def generate_irrigation_drought(n_samples=5000):
    """
    Dataset 3: Irrigation Need & Drought Risk
    """
    np.random.seed(44)
    regions = np.random.choice(['Ayeyawaddy', 'Sagaing', 'Mandalay', 'Bago', 'Magway'], n_samples)
    
    lst_c = []
    smi = []
    
    for r in regions:
        if r in ['Mandalay', 'Magway', 'Sagaing']:
            lst_c.append(np.random.uniform(32.0, 48.0))
            smi.append(np.random.uniform(0.0, 0.5))
        else:
            lst_c.append(np.random.uniform(25.0, 38.0))
            smi.append(np.random.uniform(0.3, 1.0))
            
    lst_c = np.array(lst_c)
    smi = np.array(smi)
    et = np.random.uniform(1.0, 8.0, n_samples) # Evapotranspiration mm/day
    
    liters = []
    drought_risk = []
    
    for i in range(n_samples):
        # The drier and hotter, the more water needed
        need = (45 - lst_c[i]) * -10 + (1 - smi[i]) * 1500 + et[i] * 50
        need = max(0, need * np.random.uniform(0.8, 1.2))
        liters.append(round(need))
        
        if smi[i] < 0.2 and lst_c[i] > 38:
            drought_risk.append("High")
        elif smi[i] < 0.4 and lst_c[i] > 35:
            drought_risk.append("Medium")
        else:
            drought_risk.append("Low")
            
    df = pd.DataFrame({
        'Region': regions,
        'Land_Surface_Temp_C': lst_c.round(1),
        'Soil_Moisture_Index': smi.round(3),
        'Evapotranspiration_mm_day': et.round(1),
        'Irrigation_Liters_Needed': liters,
        'Drought_Risk_Level': drought_risk
    })
    df.to_csv(f"{OUTPUT_DIR}/irrigation_drought_risk.csv", index=False)
    print(f"Generated {OUTPUT_DIR}/irrigation_drought_risk.csv")

def generate_crop_classification(n_samples=10000):
    """
    Dataset 4: Crop Type Classification (Remote Sensing Bands)
    """
    np.random.seed(45)
    regions = np.random.choice(['Ayeyawaddy', 'Sagaing', 'Mandalay', 'Bago', 'Magway'], n_samples)
    crops = ['Rice', 'Maize', 'Sugarcane', 'Beans', 'Orchard']
    
    labels = np.random.choice(crops, n_samples, p=[0.4, 0.2, 0.1, 0.2, 0.1])
    
    b2, b3, b4, b8, ndvi_series = [], [], [], [], []
    
    for label in labels:
        if label == 'Rice': # High NIR, very low Red due to flooding initially
            b2.append(np.random.uniform(0.02, 0.05))
            b3.append(np.random.uniform(0.04, 0.07))
            b4.append(np.random.uniform(0.02, 0.06))
            b8.append(np.random.uniform(0.25, 0.45))
        elif label == 'Maize':
            b2.append(np.random.uniform(0.03, 0.06))
            b3.append(np.random.uniform(0.05, 0.08))
            b4.append(np.random.uniform(0.04, 0.08))
            b8.append(np.random.uniform(0.20, 0.35))
        elif label == 'Sugarcane': # Very high biomass
            b2.append(np.random.uniform(0.02, 0.04))
            b3.append(np.random.uniform(0.04, 0.06))
            b4.append(np.random.uniform(0.02, 0.05))
            b8.append(np.random.uniform(0.35, 0.55))
        elif label == 'Beans':
            b2.append(np.random.uniform(0.04, 0.07))
            b3.append(np.random.uniform(0.06, 0.09))
            b4.append(np.random.uniform(0.05, 0.10))
            b8.append(np.random.uniform(0.15, 0.25))
        else: # Orchard
            b2.append(np.random.uniform(0.03, 0.05))
            b3.append(np.random.uniform(0.05, 0.07))
            b4.append(np.random.uniform(0.03, 0.06))
            b8.append(np.random.uniform(0.30, 0.40))
            
        ndvi_s = [(b8[-1] - b4[-1]) / (b8[-1] + b4[-1] + 1e-8) * np.random.uniform(0.8, 1.2) for _ in range(3)]
        ndvi_series.append(str([round(n, 3) for n in ndvi_s]))

    df = pd.DataFrame({
        'Region': regions,
        'B2_Blue': np.array(b2).round(4),
        'B3_Green': np.array(b3).round(4),
        'B4_Red': np.array(b4).round(4),
        'B8_NIR': np.array(b8).round(4),
        'NDVI_Time_Series_3Months': ndvi_series,
        'Crop_Class': labels
    })
    df.to_csv(f"{OUTPUT_DIR}/crop_type_classification.csv", index=False)
    print(f"Generated {OUTPUT_DIR}/crop_type_classification.csv")

if __name__ == "__main__":
    print("Generating Training Datasets for 4 Hackathon AI Models...")
    generate_health_disease()
    generate_yield_prediction()
    generate_irrigation_drought()
    generate_crop_classification()
    print("Done! Data ready for model training in Google Colab / local.")
