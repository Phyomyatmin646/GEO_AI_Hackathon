import { CROP_COLORS } from "../lib/colors";
import { localizeUnit } from "../lib/localization";

type Props = {
  cell: any;
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
};

function formatKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function DailyCellPanel({ cell }: Props) {
  const formatVal = (pred: any) => {
    if (!pred) return "N/A";
    if (pred.label) return pred.label;
    if (typeof pred.value === 'number') return pred.value.toFixed(2);
    return pred.value;
  };

  const getUnit = (pred: any) => {
    if (!pred || !pred.unit) return "";
    return localizeUnit(pred.unit, "en");
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Grid ID: {cell.index}</h2>
        
        <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-amber-700 font-bold">
                Experimental prediction — not yet field verified
              </p>
              {cell.data_quality?.warnings?.map((w: string, i: number) => (
                <p key={i} className="text-xs text-amber-600 mt-1">• {w}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 text-sm">
        {/* Provenance */}
        <section className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-700 mb-2">Provenance</h3>
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            <div>Region:</div><div className="capitalize font-medium">{cell.region}</div>
            <div>Observation:</div><div className="font-medium">{cell.observation_date}</div>
            <div>Source Data:</div><div className="font-medium">{cell.source_date}</div>
            <div>Source Age:</div><div className="font-medium">{cell.source_age_days} days</div>
          </div>
        </section>

        {/* Top Recommendations */}
        <section>
          <h3 className="font-bold text-gray-800 text-base mb-3 border-b pb-1">Top Recommendations</h3>
          <div className="space-y-3">
            {cell.recommendations?.map(([crop, score]: [string, number], i: number) => (
              <div key={crop} className="relative pt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium capitalize text-gray-700">
                    {i + 1}. {crop.replace(/_/g, ' ')}
                  </span>
                  <span className="font-bold text-gray-900">{score.toFixed(1)}</span>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
                  <div 
                    style={{ width: `${score}%`, backgroundColor: CROP_COLORS[crop] || '#9E9E9E' }} 
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Other Categories */}
        {[
          { id: 'production', label: 'Production & Farm Management' },
          { id: 'climate_risk', label: 'Climate & Environmental Risk' },
          { id: 'economics', label: 'Economics & Market' },
        ].map(cat => {
          const keys = CATEGORIES[cat.id as keyof typeof CATEGORIES];
          const hasData = keys.some(k => cell.predictions?.[k]);
          
          if (!hasData) return null;
          
          return (
            <section key={cat.id}>
              <h3 className="font-bold text-gray-800 text-base mb-3 border-b pb-1">{cat.label}</h3>
              <div className="grid grid-cols-1 gap-y-2">
                {keys.map(k => {
                  const p = cell.predictions?.[k];
                  if (!p) return null;
                  return (
                    <div key={k} className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="text-gray-600">{formatKey(k.replace('current_month_', ''))}</span>
                      <span className="font-medium">
                        {formatVal(p)} {getUnit(p)}
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
