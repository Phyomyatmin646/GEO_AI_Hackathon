"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLanguage } from "../lib/i18n";
import {
  CORE_MODEL_TARGETS,
  HIGH_IMPORTANCE_TARGETS,
  MEDIUM_IMPORTANCE_TARGETS,
  LOW_IMPORTANCE_TARGETS,
  cropModelTarget,
  isPredictionResponse,
  type DashboardModelTarget,
  type ModelPrediction,
  type PredictionRequest,
  type PredictionResponse,
} from "../lib/model-contract";
import type { GridCell } from "../lib/pilot-data";

type Props = {
  cell: Pick<GridCell, "id" | "latitude" | "longitude" | "month">;
  cropId?: string;
};

type ModelApiError = {
  error?: { message?: string };
};

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function formattedPrediction(
  target: DashboardModelTarget,
  prediction: ModelPrediction,
  language: "en" | "my",
): string {
  const raw = prediction.value;
  if (typeof raw === "string") {
    const suitability: Record<string, [string, string]> = {
      poor: ["Poor", "မသင့်တော်"],
      moderate: ["Moderate", "အသင့်အတင့်"],
      good: ["Good", "ကောင်း"],
      excellent: ["Excellent", "အလွန်ကောင်း"],
    };
    const translated = suitability[raw.toLowerCase()];
    return translated ? translated[language === "en" ? 0 : 1] : raw;
  }
  if (prediction.task_type === "classification" && ["flood_risk_level", "heat_stress_risk"].includes(target)) {
    const riskLabels = language === "en" ? ["Low", "Medium", "High"] : ["နည်း", "အလယ်အလတ်", "မြင့်"];
    return riskLabels[Math.round(raw)] ?? String(raw);
  }
  const decimals = prediction.unit === "tonnes_per_hectare" ? 2 : 3;
  const number = new Intl.NumberFormat(language === "my" ? "my-MM" : "en-US", {
    maximumFractionDigits: decimals,
  }).format(raw);
  const units: Record<string, [string, string]> = {
    score_0_to_1: ["score (0–1)", "အမှတ် (၀–၁)"],
    tonnes_per_hectare: ["t/ha", "တန်/ဟက်တာ"],
    suitability_class: ["class", "အဆင့်"],
    class_0_to_2: ["class", "အဆင့်"],
  };
  const unit = units[prediction.unit]?.[language === "en" ? 0 : 1] ?? prediction.unit;
  return `${number} ${unit}`;
}

export function ModelEvidencePanel({ cell, cropId }: Props) {
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const { lang, t } = useLanguage();
  const selectedCropTarget = cropModelTarget(cropId);
  const targets = useMemo<DashboardModelTarget[]>(
    () => selectedCropTarget ? [selectedCropTarget, ...CORE_MODEL_TARGETS] : [...CORE_MODEL_TARGETS],
    [selectedCropTarget],
  );

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setResult(null);
      const body: PredictionRequest = {
        lat: cell.latitude,
        lon: cell.longitude,
        observation_month: cell.month,
        include_all_targets: true,
      };
      try {
        const response = await fetch("/api/v1/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as unknown;
        if (!response.ok) {
          const apiError = payload as ModelApiError;
          throw new Error(apiError.error?.message || t.modelEvidence.unavailableDescription);
        }
        if (!isPredictionResponse(payload)) {
          throw new Error(t.modelEvidence.invalidResponse);
        }
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          setResult(payload);
        }
      } catch (requestError) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : t.modelEvidence.unavailableDescription,
        );
      } finally {
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cell.id, cell.latitude, cell.longitude, cell.month, targets, t.modelEvidence]);

  // Group entries by importance
  const groupedEntries = result
    ? {
        high: HIGH_IMPORTANCE_TARGETS.map(target => [target, result.predictions[target]] as const).filter(([_, p]) => !!p),
        medium: MEDIUM_IMPORTANCE_TARGETS.map(target => [target, result.predictions[target]] as const).filter(([_, p]) => !!p),
        low: LOW_IMPORTANCE_TARGETS.map(target => [target, result.predictions[target]] as const).filter(([_, p]) => !!p),
      }
    : null;

  const warnings = result ? CORE_MODEL_TARGETS.flatMap((target) => {
    const prediction = result.predictions[target];
    return prediction
      ? prediction.warnings.map((warning) => `${t.modelEvidence.targetLabels[target] ?? target}: ${warning}`)
      : [];
  }) : [];

  return (
    <section className="model-evidence" aria-live="polite">
      <div className="model-evidence-heading">
        <div>
          <p className="section-label">{t.modelEvidence.kicker}</p>
          <h3>{t.modelEvidence.title}</h3>
        </div>
        <span className={`model-status ${error ? "unavailable" : ""}`}>
          {loading
            ? t.modelEvidence.loading
            : error
              ? t.modelEvidence.unavailable
              : t.modelEvidence.experimental}
        </span>
      </div>

      {loading ? (
        <p className="model-message">{t.modelEvidence.loadingDescription}</p>
      ) : error ? (
        <div className="model-error" role="status">
          <strong>{t.modelEvidence.failClosed}</strong>
          <p>{error}</p>
        </div>
      ) : result && groupedEntries ? (
        <>
          <div className="model-prediction-list">
            <h4 className="importance-heading">{t.modelEvidence.highImportance}</h4>
            {groupedEntries.high.map(([target, prediction]) => (
              <div className="model-prediction-row" key={target}>
                <span>
                  {t.modelEvidence.targetLabels[target] ?? target}
                  <small>
                    {prediction!.validation_status} · v{prediction!.model_version}
                  </small>
                </span>
                <strong>{formattedPrediction(target, prediction!, lang)}</strong>
                <em>
                  {prediction!.confidence === null
                    ? t.modelEvidence.confidenceUnavailable
                    : `${t.modelEvidence.confidence} ${Math.round(prediction!.confidence * 100)}%`}
                </em>
              </div>
            ))}
          </div>
          
          <details className="model-prediction-list model-collapse">
            <summary className="importance-heading">{t.modelEvidence.mediumImportance} ({groupedEntries.medium.length})</summary>
            {groupedEntries.medium.map(([target, prediction]) => (
              <div className="model-prediction-row" key={target}>
                <span>
                  {t.modelEvidence.targetLabels[target] ?? target}
                  <small>
                    {prediction!.validation_status} · v{prediction!.model_version}
                  </small>
                </span>
                <strong>{formattedPrediction(target, prediction!, lang)}</strong>
                <em>
                  {prediction!.confidence === null
                    ? t.modelEvidence.confidenceUnavailable
                    : `${t.modelEvidence.confidence} ${Math.round(prediction!.confidence * 100)}%`}
                </em>
              </div>
            ))}
          </details>

          <details className="model-prediction-list model-collapse">
            <summary className="importance-heading">{t.modelEvidence.lowImportance} ({groupedEntries.low.length})</summary>
            {groupedEntries.low.map(([target, prediction]) => (
              <div className="model-prediction-row" key={target}>
                <span>
                  {t.modelEvidence.targetLabels[target] ?? target}
                  <small>
                    {prediction!.validation_status} · v{prediction!.model_version}
                  </small>
                </span>
                <strong>{formattedPrediction(target, prediction!, lang)}</strong>
                <em>
                  {prediction!.confidence === null
                    ? t.modelEvidence.confidenceUnavailable
                    : `${t.modelEvidence.confidence} ${Math.round(prediction!.confidence * 100)}%`}
                </em>
              </div>
            ))}
          </details>

          <div className="model-provenance">
            <span>{t.modelEvidence.matchDistance}: {result.location.distance_km.toFixed(3)} km</span>
            <span>{t.modelEvidence.sourceDate}: {result.provenance.source_date ?? t.cell.notPublished}</span>
            <span>{t.modelEvidence.sourceVersion}: {result.provenance.source_version ?? t.cell.notPublished}</span>
            <span title={result.provenance.feature_dataset_sha256}>
              Dataset SHA-256: {shortHash(result.provenance.feature_dataset_sha256)}
            </span>
          </div>
          <p className="model-boundary">
            {t.modelEvidence.surrogateBoundary}
          </p>
          {warnings.length > 0 && (
            <details className="model-warnings">
              <summary>{t.modelEvidence.warnings} ({warnings.length})</summary>
              <ul>
                {warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : null}
    </section>
  );
}
