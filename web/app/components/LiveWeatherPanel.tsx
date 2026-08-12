"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n";

export function LiveWeatherPanel() {
  const { lang } = useLanguage();
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Coordinates for Ayeyawaddy region roughly
    const lat = 16.5;
    const lon = 95.0;
    
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&timezone=Asia%2FYangon`)
      .then(res => res.json())
      .then(data => {
        setWeather(data.current);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: '20px', background: '#f5f7f5', borderRadius: '8px' }}>Loading Live Weather...</div>;
  if (!weather) return null;

  return (
    <div style={{ padding: '20px', background: '#f5f7f5', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
      <div>
        <strong style={{ display: 'block', color: '#15945f' }}>{lang === 'my' ? 'အပူချိန်' : 'Temperature'}</strong>
        <span style={{ fontSize: '1.2rem' }}>{weather.temperature_2m}°C</span>
      </div>
      <div>
        <strong style={{ display: 'block', color: '#15945f' }}>{lang === 'my' ? 'မိုးရေချိန်' : 'Precipitation'}</strong>
        <span style={{ fontSize: '1.2rem' }}>{weather.precipitation} mm</span>
      </div>
      <div>
        <strong style={{ display: 'block', color: '#15945f' }}>{lang === 'my' ? 'စိုထိုင်းဆ' : 'Humidity'}</strong>
        <span style={{ fontSize: '1.2rem' }}>{weather.relative_humidity_2m}%</span>
      </div>
      <div>
        <strong style={{ display: 'block', color: '#15945f' }}>{lang === 'my' ? 'လေတိုက်နှုန်း' : 'Wind Speed'}</strong>
        <span style={{ fontSize: '1.2rem' }}>{weather.wind_speed_10m} km/h</span>
      </div>
    </div>
  );
}
