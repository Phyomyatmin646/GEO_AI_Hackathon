"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../lib/i18n";
import type { GridCell } from "../lib/pilot-data";

type Props = {
  cell: Pick<GridCell, "id" | "latitude" | "longitude" | "month">;
};

type ClimateRow = {
  icon: string;
  labelMy: string;
  labelEn: string;
  value: number | null;
  unit: string;
  max: number;
  color: string;
};

type RawPredictions = Record<string, { value: unknown } | undefined>;

export function ClimateLivePanel({ cell }: Props) {
  const [rows, setRows] = useState<ClimateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seqRef = useRef(0);
  const { lang } = useLanguage();

  useEffect(() => {
    const seq = ++seqRef.current;
    const ctrl = new AbortController();

    setLoading(true);
    setError("");
    setRows(null);

    (async () => {
      try {
        const res = await fetch("/api/v1/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: cell.latitude,
            lon: cell.longitude,
            observation_month: cell.month,
            targets: [
              "current_month_precipitation_mm",
              "current_month_mean_temperature_c",
              "current_month_solar_rad_mj_m2_day",
              "surface_water_occurrence",
            ],
          }),
          signal: ctrl.signal,
          cache: "no-store",
        });

        if (!res.ok) throw new Error("api-error");
        const payload = (await res.json()) as {
          predictions?: RawPredictions;
        };
        if (seq !== seqRef.current) return;

        const p = payload.predictions ?? {};
        const num = (key: string): number | null => {
          const v = p[key]?.value;
          return typeof v === "number" && isFinite(v) ? v : null;
        };

        setRows([
          {
            icon: "🌧️",
            labelMy: "မိုးရေချိန်",
            labelEn: "Rainfall",
            value: num("current_month_precipitation_mm"),
            unit: "mm",
            max: 500,
            color: "#3B82F6",
          },
          {
            icon: "🌡️",
            labelMy: "ပျမ်းမျှ အပူချိန်",
            labelEn: "Mean Temperature",
            value: num("current_month_mean_temperature_c"),
            unit: "°C",
            max: 40,
            color: "#F59E0B",
          },
          {
            icon: "☀️",
            labelMy: "နေရောင်ခြည် စွမ်းအင်",
            labelEn: "Solar Radiation",
            value: num("current_month_solar_rad_mj_m2_day"),
            unit: "MJ/m²/day",
            max: 25,
            color: "#F97316",
          },
          {
            icon: "💧",
            labelMy: "မျက်နှာပြင် ရေပမာဏ",
            labelEn: "Surface Water Occ.",
            value: num("surface_water_occurrence"),
            unit: "%",
            max: 100,
            color: "#06B6D4",
          },
        ]);
      } catch (e) {
        if (ctrl.signal.aborted || seq !== seqRef.current) return;
        setError(
          lang === "my"
            ? "ရာသီဥတုဒေတာ ရယူမရနိုင်ပါ"
            : "Climate data unavailable",
        );
      } finally {
        if (!ctrl.signal.aborted && seq === seqRef.current) setLoading(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [cell.id, cell.latitude, cell.longitude, cell.month, lang]);

  if (loading) {
    return (
      <div className="climate-live-loading">
        <span className="climate-spinner" />
        {lang === "my" ? "ERA5 · CHIRPS ဒေတာ ဆွဲယူနေသည်…" : "Fetching ERA5 · CHIRPS data…"}
      </div>
    );
  }

  if (error || !rows) {
    return (
      <div className="climate-live-error">
        {error || (lang === "my" ? "ဒေတာ ရရှိမှာ မရှိပါ" : "No data available")}
      </div>
    );
  }

  return (
    <div className="climate-live-panel">
      <div className="climate-live-badge">
        <span className="live-dot" />
        {lang === "my" ? "Live Model · ERA5 / CHIRPS" : "Live Model · ERA5 / CHIRPS"}
        <span className="climate-month-tag">{cell.month}</span>
      </div>

      {rows.map((row) => {
        const pct =
          row.value !== null
            ? Math.min(100, Math.max(0, (row.value / row.max) * 100))
            : 0;
        return (
          <div key={row.labelEn} className="climate-live-row">
            <span className="climate-icon">{row.icon}</span>
            <div className="climate-bar-group">
              <div className="climate-bar-label">
                <span>{lang === "my" ? row.labelMy : row.labelEn}</span>
                <strong>
                  {row.value !== null ? `${row.value.toFixed(1)} ${row.unit}` : "—"}
                </strong>
              </div>
              <div className="climate-bar-track">
                <div
                  className="climate-bar-fill"
                  style={{ width: `${pct}%`, background: row.color }}
                />
              </div>
            </div>
          </div>
        );
      })}

      <p className="climate-live-note">
        {lang === "my"
          ? `${cell.month} အတွက် AI Model မှ ERA5 / CHIRPS ဒေတာနှင့် တွက်ချက်ထုတ်ပြန်သည်`
          : `AI model inference for ${cell.month} using ERA5 / CHIRPS inputs`}
      </p>
    </div>
  );
}
