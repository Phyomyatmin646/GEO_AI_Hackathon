"use client";

import { useMemo } from "react";

import type { HomeLiveState, HomePrediction, HomeWeeklyCell } from "../lib/home-data";
import { useLanguage } from "../lib/i18n";
import { cropModelTarget } from "../lib/model-contract";
import type { GridCell } from "../lib/pilot-data";

type Props = {
  cell: Pick<GridCell, "id">;
  live: HomeLiveState;
  liveCell?: HomeWeeklyCell;
  cropId?: string;
};

function formatPrediction(prediction: HomePrediction, language: "en" | "my"): string {
  if (prediction.value === null) return "—";
  if (typeof prediction.value === "string") return prediction.value;
  const value = new Intl.NumberFormat(language === "my" ? "my-MM" : "en-US", {
    maximumFractionDigits: 3,
  }).format(prediction.value);
  const units: Record<string, [string, string]> = {
    score_0_to_1: ["score (0–1)", "အမှတ် (၀–၁)"],
    tonnes_per_hectare: ["t/ha", "တန်/ဟက်တာ"],
    suitability_class: ["class", "အဆင့်"],
    class_0_to_2: ["class", "အဆင့်"],
  };
  const unit = prediction.unit
    ? (units[prediction.unit]?.[language === "en" ? 0 : 1] ?? prediction.unit)
    : "";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function ModelEvidencePanel({ cell, live, liveCell, cropId }: Props) {
  const { lang, t } = useLanguage();
  const cropTarget = cropModelTarget(cropId);
  const entries = useMemo(() => {
    if (!liveCell) return [];
    const values = Object.entries(liveCell.predictions);
    return values.sort(([left], [right]) => {
      if (left === cropTarget) return -1;
      if (right === cropTarget) return 1;
      return left.localeCompare(right);
    });
  }, [cropTarget, liveCell]);
  const unavailable = live.mode !== "weekly" || !liveCell;

  return (
    <section className="model-evidence" aria-live="polite" data-cell-id={cell.id}>
      <div className="model-evidence-heading">
        <div>
          <p className="section-label">{t.modelEvidence.kicker}</p>
          <h3>{t.modelEvidence.title}</h3>
        </div>
        <span className={`model-status ${unavailable ? "unavailable" : ""}`}>
          {unavailable ? t.modelEvidence.unavailable : t.modelEvidence.experimental}
        </span>
      </div>

      {unavailable ? (
        <div className="model-error" role="status">
          <strong>{t.modelEvidence.failClosed}</strong>
          <p>
            {lang === "my"
              ? "နောက်ဆုံး weekly model result မရသေးပါ။ Historical pilot တန်ဖိုးကို live model result အဖြစ် မပြထားပါ။"
              : "No latest weekly model result is available. Historical pilot values are not presented as live model output."}
          </p>
        </div>
      ) : (
        <>
          <div className="model-prediction-list">
            <h4 className="importance-heading">
              {lang === "my" ? "သိမ်းထားသော weekly predictions" : "Persisted weekly predictions"}
            </h4>
            {entries.map(([target, prediction]) => (
              <div
                className={`model-prediction-row ${prediction.validationStatus === "flagged" ? "flagged" : ""}`}
                key={target}
              >
                <span>
                  {t.modelEvidence.targetLabels[target as keyof typeof t.modelEvidence.targetLabels] ?? target}
                  <small>
                    {prediction.validationStatus ?? "stored"}
                    {prediction.modelVersion ? ` · v${prediction.modelVersion}` : ""}
                  </small>
                </span>
                <strong>{formatPrediction(prediction, lang)}</strong>
                <em>
                  {prediction.confidence === null
                    ? t.modelEvidence.confidenceUnavailable
                    : `${t.modelEvidence.confidence} ${Math.round(prediction.confidence * 100)}%`}
                </em>
              </div>
            ))}
          </div>
          <div className="model-provenance">
            <span>{live.weekStart} → {live.weekEnd}</span>
            <span>{live.isPartialWeek ? "Partial week" : "Full week"}</span>
            <span>{Object.keys(liveCell.errors).length} target errors</span>
            {live.modelCatalogVersion && (
              <span title={live.modelCatalogVersion}>Catalog: {live.modelCatalogVersion.slice(0, 10)}…</span>
            )}
          </div>
          <p className="model-boundary">
            {lang === "my"
              ? "ဤတန်ဖိုးများသည် backend တွင် သိမ်းထားသော weekly run မှဖြစ်ပြီး browser မှ model ကို ထပ်မံမခေါ်ပါ။"
              : "These values come from the persisted weekly run; the browser does not invoke the model again."}
          </p>
        </>
      )}
    </section>
  );
}
