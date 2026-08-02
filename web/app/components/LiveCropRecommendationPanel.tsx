"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../lib/i18n";
import {
  cropModelTarget,
  isCropRecommenderComposite,
  isPredictionResponse,
  type CropRecommenderComposite,
  type PredictionRequest,
  type PredictionResponse,
} from "../lib/model-contract";
import type { GridCell } from "../lib/pilot-data";

type Props = {
  cell: Pick<GridCell, "id" | "latitude" | "longitude" | "month">;
  activeCropId?: string;
  onSelectCrop: (cropId: string) => void;
};

type ApiError = { error?: { message?: string } };

export function LiveCropRecommendationPanel({
  cell,
  activeCropId,
  onSelectCrop,
}: Props) {
  const [response, setResponse] = useState<PredictionResponse | null>(null);
  const [recommendation, setRecommendation] = useState<CropRecommenderComposite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequenceRef = useRef(0);
  const { t } = useLanguage();

  useEffect(() => {
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setResponse(null);
      setRecommendation(null);
      const body: PredictionRequest = {
        lat: cell.latitude,
        lon: cell.longitude,
        observation_month: cell.month,
        composite_features: ["crop_recommender"],
      };
      try {
        const result = await fetch("/api/v1/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await result.json()) as unknown;
        if (!result.ok) {
          throw new Error(
            (payload as ApiError).error?.message || t.liveRecommendations.unavailableDescription,
          );
        }
        if (!isPredictionResponse(payload)) {
          throw new Error(t.modelEvidence.invalidResponse);
        }
        const composite = payload.composite_features.crop_recommender;
        if (!isCropRecommenderComposite(composite)) {
          throw new Error(t.liveRecommendations.invalidComposite);
        }
        if (!controller.signal.aborted && sequence === sequenceRef.current) {
          setResponse(payload);
          setRecommendation(composite);
        }
      } catch (requestError) {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : t.liveRecommendations.unavailableDescription,
        );
      } finally {
        if (!controller.signal.aborted && sequence === sequenceRef.current) {
          setLoading(false);
        }
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cell.id, cell.latitude, cell.longitude, cell.month, t.liveRecommendations, t.modelEvidence.invalidResponse]);

  const cropLabel = (cropId: string) => {
    const target = cropModelTarget(cropId);
    return target ? (t.modelEvidence.targetLabels[target] ?? cropId) : cropId;
  };
  const tierLabel = recommendation?.top_suitability_tier
    ? t.liveRecommendations.tiers[recommendation.top_suitability_tier]
    : t.liveRecommendations.noTier;
  const cropPredictions = response
    ? Object.entries(response.predictions).filter(([target]) =>
        target.startsWith("crop_suitability_"),
      )
    : [];
  const flaggedCropModels = cropPredictions.filter(
    ([, prediction]) => prediction?.validation_status === "flagged",
  ).length;

  return (
    <section className="live-recommender" aria-live="polite">
      <div className="live-recommender-heading">
        <div>
          <p className="section-label">{t.liveRecommendations.kicker}</p>
          <h3>{t.liveRecommendations.title}</h3>
        </div>
        <span className={`model-status ${error ? "unavailable" : ""}`}>
          {loading
            ? t.liveRecommendations.loading
            : error
              ? t.liveRecommendations.unavailable
              : t.liveRecommendations.live}
        </span>
      </div>

      {loading ? (
        <p className="model-message">{t.liveRecommendations.loadingDescription}</p>
      ) : error ? (
        <div className="model-error" role="status">
          <strong>{t.liveRecommendations.failClosed}</strong>
          <p>{error}</p>
        </div>
      ) : recommendation && response ? (
        <>
          <p className="live-tier-label">
            {t.liveRecommendations.topTier}: <strong>{tierLabel}</strong>
          </p>
          <div className="live-crop-group">
            {recommendation.top_recommendations.map((item) => (
              <button
                type="button"
                key={item.crop}
                className={`live-crop-chip ${activeCropId === item.crop ? "active" : ""}`}
                onClick={() => onSelectCrop(item.crop)}
                aria-pressed={activeCropId === item.crop}
              >
                <span>{cropLabel(item.crop)}</span>
                <small>
                  {item.tree_vote_agreement === null
                    ? t.modelEvidence.confidenceUnavailable
                    : `${t.modelEvidence.confidence} ${Math.round(item.tree_vote_agreement * 100)}%`}
                </small>
              </button>
            ))}
          </div>
          <p className="live-ranking-boundary">{t.liveRecommendations.noStrictRanking}</p>
          {flaggedCropModels > 0 && (
            <p className="live-validation-warning">
              {flaggedCropModels}/{cropPredictions.length} {t.liveRecommendations.classCoverageWarning}
            </p>
          )}
          <div className="live-release-line">
            <span>{response.execution_metadata.cached ? t.liveRecommendations.cached : t.liveRecommendations.liveRun}</span>
            <span>{Math.round(response.execution_metadata.response_time_ms)} ms</span>
            <span title={response.catalog_version}>
              {t.liveRecommendations.release} {response.catalog_version.slice(0, 10)}…
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}
