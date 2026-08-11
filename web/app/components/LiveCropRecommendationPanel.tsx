"use client";

import { useLanguage } from "../lib/i18n";
import {
  weeklyCropRecommendations,
  type HomeLiveState,
  type HomeWeeklyCell,
} from "../lib/home-data";
import { cropModelTarget } from "../lib/model-contract";
import type { GridCell } from "../lib/pilot-data";

type Props = {
  cell: Pick<GridCell, "id">;
  live: HomeLiveState;
  liveCell?: HomeWeeklyCell;
  activeCropId?: string;
  onSelectCrop: (cropId: string) => void;
};

export function LiveCropRecommendationPanel({
  cell,
  live,
  liveCell,
  activeCropId,
  onSelectCrop,
}: Props) {
  const { lang, t } = useLanguage();
  const recommendations = weeklyCropRecommendations(liveCell);
  const cropLabel = (cropId: string) => {
    const target = cropModelTarget(cropId);
    return target ? (t.modelEvidence.targetLabels[target] ?? cropId) : cropId;
  };
  const unavailable = live.mode !== "weekly" || !live.cropPredictionsAvailable;

  return (
    <section className="live-recommender" aria-live="polite" data-cell-id={cell.id}>
      <div className="live-recommender-heading">
        <div>
          <p className="section-label">{t.liveRecommendations.kicker}</p>
          <h3>{t.liveRecommendations.title}</h3>
        </div>
        <span className={`model-status ${unavailable ? "unavailable" : ""}`}>
          {unavailable ? t.liveRecommendations.unavailable : t.liveRecommendations.live}
        </span>
      </div>

      {unavailable ? (
        <div className="model-error" role="status">
          <strong>{t.liveRecommendations.failClosed}</strong>
          <p>
            {live.mode !== "weekly"
              ? (lang === "my"
                  ? "နောက်ဆုံး weekly run မရသေးသောကြောင့် historical pilot ကိုသာ ပြထားသည်။"
                  : "The latest weekly run is unavailable, so only the historical pilot is shown.")
              : (lang === "my"
                  ? "Crop suitability model များကို production policy အရ ပိတ်ထားသည်။"
                  : "Crop-suitability models are disabled by the production model policy.")}
          </p>
        </div>
      ) : (
        <>
          <p className="live-tier-label">
            {lang === "my" ? "Weekly model အကြံပြုချက်" : "Weekly model recommendations"}
          </p>
          <div className="live-crop-group">
            {recommendations.slice(0, 5).map((item) => (
              <button
                type="button"
                key={item.cropId}
                className={`live-crop-chip ${activeCropId === item.cropId ? "active" : ""}`}
                onClick={() => onSelectCrop(item.cropId)}
                aria-pressed={activeCropId === item.cropId}
              >
                <span>{cropLabel(item.cropId)}</span>
                <small>{item.score.toFixed(1)}/100</small>
              </button>
            ))}
          </div>
          <p className="live-ranking-boundary">{t.liveRecommendations.noStrictRanking}</p>
          <div className="live-release-line">
            <span>{live.weekStart} → {live.weekEnd}</span>
            <span>{live.isPartialWeek ? "Partial week" : "Full week"}</span>
            {live.modelCatalogVersion && (
              <span title={live.modelCatalogVersion}>
                {t.liveRecommendations.release} {live.modelCatalogVersion.slice(0, 10)}…
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
