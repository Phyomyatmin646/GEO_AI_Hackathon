"use client";

import { CROP_COLORS } from "../lib/colors";
import type { DailyMapCellView, DailyPrediction } from "../lib/daily-map-data";
import { useLanguage } from "../lib/i18n";
import { localizeRegion, localizeUnit } from "../lib/localization";

type Props = {
  cell: DailyMapCellView | null;
};

const CATEGORIES = {
  suitability: [
    "crop_suitability_monsoon_rice", "crop_suitability_dry_season_rice",
    "crop_suitability_black_gram", "crop_suitability_green_gram",
    "crop_suitability_maize", "crop_suitability_groundnut",
    "crop_suitability_chili", "crop_suitability_sesame",
    "crop_suitability_sugarcane", "crop_suitability_cassava",
    "crop_suitability_tomato", "crop_suitability_pigeon_pea",
    "crop_suitability_rubber", "crop_suitability_mango",
    "crop_suitability_durian", "crop_suitability_mangosteen",
    "crop_suitability_longan",
  ],
  production: [
    "crop_health_score", "crop_yield_t_ha", "irrigation_need",
    "nitrogen_requirement_level", "phosphorus_requirement_level",
    "irrigation_potential", "optimal_planting_month",
  ],
  climate_risk: [
    "flood_risk_level", "drought_risk_score", "heat_stress_risk",
    "current_month_precipitation_mm", "current_month_mean_temperature_c",
    "current_month_solar_rad_mj_m2_day", "soil_erosion_risk",
    "surface_water_occurrence", "water_scarcity_risk",
  ],
  economics: [
    "agricultural_gdp_forecast", "market_integration_score",
    "post_harvest_loss_risk", "supply_chain_efficiency",
    "cold_chain_potential", "agricultural_land_conversion_risk",
    "urban_encroachment_risk",
  ],
} as const;

function formatKey(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatPrediction(prediction: DailyPrediction, missing: string) {
  if (prediction.label) return prediction.label;
  if (prediction.value === null) return missing;
  if (typeof prediction.value === "number") return prediction.value.toFixed(2);
  return prediction.value;
}

export function DailyCellPanel({ cell }: Props) {
  const { lang, t } = useLanguage();
  if (!cell) {
    return (
      <div className="p-6" role="status">
        {lang === "my" ? "ရွေးချယ်ထားသော cell ကို မတွေ့ပါ။" : "The selected cell is unavailable."}
      </div>
    );
  }

  const categoryLabels = {
    production: lang === "my" ? "ထုတ်လုပ်မှုနှင့် လယ်ယာစီမံခန့်ခွဲမှု" : "Production & farm management",
    climate_risk: lang === "my" ? "ရာသီဥတုနှင့် ပတ်ဝန်းကျင်အန္တရာယ်" : "Climate & environmental risk",
    economics: lang === "my" ? "စီးပွားရေးနှင့် ဈေးကွက်" : "Economics & market",
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Grid ID: {cell.index}</h2>

        <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-amber-700 font-bold">
                {lang === "my"
                  ? "စမ်းသပ်ဆဲ ခန့်မှန်းချက် — မြေပြင်တွင် အတည်မပြုရသေးပါ"
                  : "Experimental prediction — not yet field verified"}
              </p>
              {cell.warnings.map((warning, index) => (
                <p key={`${warning}-${index}`} className="text-xs text-amber-600 mt-1">• {warning}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 text-sm">
        <section className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-700 mb-2">
            {lang === "my" ? "မူရင်းနှင့် အချိန်ကာလ" : "Provenance"}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            <div>{lang === "my" ? "ဒေသ" : "Region"}:</div><div className="capitalize font-medium">{localizeRegion(cell.region, lang)}</div>
            <div>{lang === "my" ? "လေ့လာရက်" : "Observation"}:</div><div className="font-medium">{cell.observationDate}</div>
            <div>{lang === "my" ? "Source ရက်" : "Source data"}:</div><div className="font-medium">{cell.sourceDate}</div>
            <div>{lang === "my" ? "Source သက်တမ်း" : "Source age"}:</div><div className="font-medium">{cell.sourceAgeDays} {lang === "my" ? "ရက်" : "days"}</div>
          </div>
        </section>

        <section>
          <h3 className="font-bold text-gray-800 text-base mb-3 border-b pb-1">
            {lang === "my" ? "ထိပ်ဆုံး အကြံပြုချက်များ" : "Top recommendations"}
          </h3>
          <div className="space-y-3">
            {cell.recommendations.length === 0 && (
              <p className="text-gray-500">{lang === "my" ? "သီးနှံအကြံပြုချက် မရရှိပါ။" : "No crop recommendation is available."}</p>
            )}
            {cell.recommendations.map(([crop, score], index) => (
              <div key={crop} className="relative pt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium capitalize text-gray-700">
                    {index + 1}. {crop.replaceAll("_", " ")}
                  </span>
                  <span className="font-bold text-gray-900">{score.toFixed(1)}</span>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
                  <div
                    style={{ width: `${score}%`, backgroundColor: CROP_COLORS[crop] || "#9E9E9E" }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map((categoryId) => {
          const keys = CATEGORIES[categoryId];
          const available = keys.filter((key) => cell.predictions[key] !== undefined);
          if (available.length === 0) return null;
          return (
            <section key={categoryId}>
              <h3 className="font-bold text-gray-800 text-base mb-3 border-b pb-1">
                {categoryLabels[categoryId]}
              </h3>
              <div className="grid grid-cols-1 gap-y-2">
                {available.map((key) => {
                  const prediction = cell.predictions[key];
                  if (!prediction) return null;
                  return (
                    <div key={key} className="flex justify-between gap-4 border-b border-gray-100 pb-1">
                      <span className="text-gray-600">{t.modelEvidence.targetLabels[key] ?? formatKey(key.replace("current_month_", ""))}</span>
                      <span className="font-medium text-right">
                        {formatPrediction(prediction, lang === "my" ? "မရရှိပါ" : "Unavailable")} {prediction.unit ? localizeUnit(prediction.unit, lang) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
