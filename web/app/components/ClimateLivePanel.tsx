"use client";

import { numericPrediction, type HomeLiveState, type HomeWeeklyCell } from "../lib/home-data";
import { useLanguage } from "../lib/i18n";
import type { GridCell } from "../lib/pilot-data";

type Props = {
  cell: Pick<GridCell, "id" | "month">;
  live: HomeLiveState;
  liveCell?: HomeWeeklyCell;
};

type ClimateRow = {
  icon: string;
  labelMy: string;
  labelEn: string;
  target: string;
  unit: string;
  max: number;
  color: string;
};

const ROWS: ClimateRow[] = [
  { icon: "🌧️", labelMy: "မိုးရေချိန်", labelEn: "Rainfall", target: "current_month_precipitation_mm", unit: "mm", max: 500, color: "#3B82F6" },
  { icon: "🌡️", labelMy: "ပျမ်းမျှ အပူချိန်", labelEn: "Mean Temperature", target: "current_month_mean_temperature_c", unit: "°C", max: 40, color: "#F59E0B" },
  { icon: "☀️", labelMy: "နေရောင်ခြည် စွမ်းအင်", labelEn: "Solar Radiation", target: "current_month_solar_rad_mj_m2_day", unit: "MJ/m²/day", max: 25, color: "#F97316" },
  { icon: "💧", labelMy: "မျက်နှာပြင် ရေပမာဏ", labelEn: "Surface Water Occ.", target: "surface_water_occurrence", unit: "%", max: 100, color: "#06B6D4" },
];

export function ClimateLivePanel({ cell, live, liveCell }: Props) {
  const { lang } = useLanguage();
  if (live.mode !== "weekly" || !liveCell) {
    return (
      <div className="climate-live-error">
        {lang === "my"
          ? "Weekly ERA5 · CHIRPS model တန်ဖိုးများ မရသေးပါ။ Historical pilot တန်ဖိုးများကို အပေါ်တွင်ပြထားသည်။"
          : "Weekly ERA5 · CHIRPS model values are unavailable. Historical pilot values remain visible above."}
      </div>
    );
  }

  return (
    <div className="climate-live-panel">
      <div className="climate-live-badge">
        <span className="live-dot" />
        {lang === "my" ? "Latest weekly model · ERA5 / CHIRPS" : "Latest weekly model · ERA5 / CHIRPS"}
        <span className="climate-month-tag">{live.weekStart ?? cell.month}</span>
      </div>

      {ROWS.map((row) => {
        const value = numericPrediction(liveCell, row.target);
        const pct = value === null ? 0 : Math.min(100, Math.max(0, (value / row.max) * 100));
        return (
          <div key={row.target} className="climate-live-row">
            <span className="climate-icon">{row.icon}</span>
            <div className="climate-bar-group">
              <div className="climate-bar-label">
                <span>{lang === "my" ? row.labelMy : row.labelEn}</span>
                <strong>{value === null ? "—" : `${value.toFixed(1)} ${row.unit}`}</strong>
              </div>
              <div className="climate-bar-track">
                <div className="climate-bar-fill" style={{ width: `${pct}%`, background: row.color }} />
              </div>
            </div>
          </div>
        );
      })}

      <p className="climate-live-note">
        {lang === "my"
          ? `${live.weekStart} မှ ${live.weekEnd} အထိ သိမ်းထားသော weekly model result`
          : `Persisted weekly model result for ${live.weekStart} to ${live.weekEnd}`}
      </p>
    </div>
  );
}
