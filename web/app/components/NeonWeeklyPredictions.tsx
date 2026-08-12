"use client";

import { useMemo } from "react";
import type { HomeLiveState, HomePrediction, HomeWeeklyCell } from "../lib/home-data";
import { useLanguage } from "../lib/i18n";
import { localizeRegion } from "../lib/localization";
import { CORE_MODEL_TARGETS } from "../lib/model-contract";
import { HarvestIcon } from "./HarvestIcon";
import styles from "./NeonWeeklyPredictions.module.css";

type SelectedCell = {
  id: string;
  region: string;
};

type Props = {
  cell: SelectedCell;
  live: HomeLiveState;
  liveCell?: HomeWeeklyCell;
};

type CategoryDefinition = {
  id: "suitability" | "production" | "climate" | "economics";
  icon: "sprout" | "dataset" | "rain" | "cells";
  labels: { en: string; my: string };
  matches: (target: string) => boolean;
};

const PRODUCTION_TARGETS = new Set([
  "crop_yield_t_ha",
  "crop_health_score",
  "irrigation_need",
  "nitrogen_requirement_level",
  "phosphorus_requirement_level",
  "irrigation_potential",
  "optimal_planting_month",
]);

const CLIMATE_TARGETS = new Set([
  "flood_risk_level",
  "drought_risk_score",
  "heat_stress_risk",
  "current_month_precipitation_mm",
  "current_month_mean_temperature_c",
  "current_month_solar_rad_mj_m2_day",
  "soil_erosion_risk",
  "surface_water_occurrence",
  "water_scarcity_risk",
]);

const ECONOMICS_TARGETS = new Set([
  "agricultural_gdp_forecast",
  "market_integration_score",
  "post_harvest_loss_risk",
  "supply_chain_efficiency",
  "cold_chain_potential",
  "agricultural_land_conversion_risk",
  "urban_encroachment_risk",
]);

const CATEGORIES: CategoryDefinition[] = [
  {
    id: "suitability",
    icon: "sprout",
    labels: { en: "Crop suitability", my: "သီးနှံသင့်တော်မှု" },
    matches: (target) => target.startsWith("crop_suitability_"),
  },
  {
    id: "production",
    icon: "dataset",
    labels: { en: "Production & yield", my: "ထုတ်လုပ်မှုနှင့် အထွက်နှုန်း" },
    matches: (target) => PRODUCTION_TARGETS.has(target),
  },
  {
    id: "climate",
    icon: "rain",
    labels: { en: "Climate & environment", my: "ရာသီဥတုနှင့် ပတ်ဝန်းကျင်" },
    matches: (target) => CLIMATE_TARGETS.has(target),
  },
  {
    id: "economics",
    icon: "cells",
    labels: { en: "Economics & market", my: "စီးပွားရေးနှင့် ဈေးကွက်" },
    matches: (target) => ECONOMICS_TARGETS.has(target),
  },
];

function readableTarget(target: string) {
  return target
    .replace(/^crop_suitability_/u, "")
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatDate(value: string | null, lang: "en" | "my") {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "my" ? "my-MM" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatBytes(value: number | null, lang: "en" | "my") {
  if (value === null) return "—";
  const unit = value >= 1024 * 1024 ? "MB" : "KB";
  const divisor = unit === "MB" ? 1024 * 1024 : 1024;
  return `${new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-US", {
    maximumFractionDigits: unit === "MB" ? 2 : 1,
  }).format(value / divisor)} ${unit}`;
}

function formatLatency(value: number | null, lang: "en" | "my") {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value)} ms`;
}

function unitLabel(unit: string | null, lang: "en" | "my") {
  if (!unit) return "";
  const labels: Record<string, { en: string; my: string }> = {
    score_0_to_1: { en: "score (0–1)", my: "အမှတ် (၀–၁)" },
    class_0_to_2: { en: "class (0–2)", my: "အဆင့် (၀–၂)" },
    suitability_class: { en: "suitability class", my: "သင့်တော်မှုအဆင့်" },
    tonnes_per_hectare: { en: "t/ha", my: "တန်/ဟက်တာ" },
  };
  return labels[unit]?.[lang] ?? unit.replaceAll("_", " ");
}

function formatPredictionValue(prediction: HomePrediction, lang: "en" | "my") {
  if (prediction.label) return prediction.label;
  if (prediction.value === null) return "—";
  if (typeof prediction.value !== "number") return String(prediction.value);
  const digits = prediction.unit === "score_0_to_1" ? 4 : 3;
  return new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-US", {
    maximumFractionDigits: digits,
  }).format(prediction.value);
}

function validationLabel(status: string | null, lang: "en" | "my") {
  if (status === "healthy") return lang === "my" ? "စစ်ဆေးမှုအောင်မြင်" : "Healthy";
  if (status === "flagged") return lang === "my" ? "သတိပြုရန်" : "Flagged";
  if (!status) return lang === "my" ? "အခြေအနေမဖော်ပြထား" : "Status unavailable";
  return status.replaceAll("_", " ");
}

function unavailableMessage(reason: string | null, lang: "en" | "my") {
  const messages: Record<string, { en: string; my: string }> = {
    database_not_configured: {
      en: "Weekly storage is not configured on the backend.",
      my: "Backend တွင် အပတ်စဉ်ဒေတာသိုလှောင်မှု မသတ်မှတ်ရသေးပါ။",
    },
    unauthorized: {
      en: "The web gateway could not authenticate to the weekly service.",
      my: "Web gateway သည် weekly service သို့ အတည်ပြုဝင်ရောက်၍ မရပါ။",
    },
    no_active_weekly_predictions: {
      en: "No active weekly prediction run is available.",
      my: "အသုံးပြုနိုင်သော အပတ်စဉ်ခန့်မှန်း run မရှိသေးပါ။",
    },
    weekly_predictions_expired: {
      en: "The latest weekly prediction run has expired.",
      my: "နောက်ဆုံး အပတ်စဉ်ခန့်မှန်း run သက်တမ်းကုန်သွားပါပြီ။",
    },
    backend_timeout: {
      en: "The weekly service did not respond before the safe timeout.",
      my: "Weekly service သည် သတ်မှတ်ထားသောအချိန်အတွင်း မတုံ့ပြန်ပါ။",
    },
    region_missing: {
      en: "Weekly prediction data is not available for this region.",
      my: "ဤတိုင်းဒေသကြီးအတွက် အပတ်စဉ်ခန့်မှန်းဒေတာ မရှိသေးပါ။",
    },
    grid_id_mismatch: {
      en: "The weekly region and historical map do not share a verified 5 km grid ID.",
      my: "Weekly region နှင့် historical map ကြား အတည်ပြုထားသော 5 km grid ID မကိုက်ညီပါ။",
    },
    latest_metadata_invalid: {
      en: "Weekly discovery metadata did not pass contract validation.",
      my: "Weekly discovery metadata သည် contract စစ်ဆေးမှု မအောင်မြင်ပါ။",
    },
    invalid_backend_contract: {
      en: "The regional prediction payload did not pass contract validation.",
      my: "Regional prediction payload သည် contract စစ်ဆေးမှု မအောင်မြင်ပါ။",
    },
    regional_payload_not_found: {
      en: "Metadata was found, but its regional prediction payload is missing.",
      my: "Metadata ရှိသော်လည်း သက်ဆိုင်ရာ regional prediction payload မရှိပါ။",
    },
    regional_payload_expired: {
      en: "The selected regional prediction payload has expired.",
      my: "ရွေးချယ်ထားသော regional prediction payload သက်တမ်းကုန်သွားပါပြီ။",
    },
    latest_region_contract_mismatch: {
      en: "Weekly discovery and regional payload identities do not agree.",
      my: "Weekly discovery နှင့် regional payload identity များ မကိုက်ညီပါ။",
    },
    backend_unavailable: {
      en: "The weekly prediction service is temporarily unavailable.",
      my: "အပတ်စဉ်ခန့်မှန်းဒေတာဝန်ဆောင်မှုကို ယာယီခေါ်မရပါ။",
    },
  };
  return messages[reason ?? ""]?.[lang]
    ?? (lang === "my"
      ? "ရွေးချယ်ထားသော 5 km cell အတွက် အပတ်စဉ်ခန့်မှန်းဒေတာ မရှိပါ။"
      : "No weekly prediction data is available for the selected 5 km cell.");
}

export function NeonWeeklyPredictions({ cell, live, liveCell }: Props) {
  const { lang, t } = useLanguage();
  const entries = useMemo(
    () => Object.entries(liveCell?.predictions ?? {}),
    [liveCell],
  );
  const groups = useMemo(() => {
    const categorized = CATEGORIES.map((category) => ({
      ...category,
      entries: entries.filter(([target]) => category.matches(target)),
    }));
    const other = entries.filter(
      ([target]) => !CATEGORIES.some((category) => category.matches(target)),
    );
    return { categorized, other };
  }, [entries]);
  const cellErrors = Object.entries(liveCell?.errors ?? {});
  const catalogAvailableCount = CORE_MODEL_TARGETS.filter(
    (target) => liveCell?.predictions[target] !== undefined,
  ).length;
  const missingCatalogTargets = CORE_MODEL_TARGETS.filter(
    (target) => liveCell?.predictions[target] === undefined,
  );
  const hasData = live.mode === "weekly" && Boolean(liveCell) && entries.length > 0;
  const weekLabel = live.weekStart && live.weekEnd
    ? `${formatDate(live.weekStart, lang)} – ${formatDate(live.weekEnd, lang)}`
    : "—";

  const renderPrediction = ([target, prediction]: [string, HomePrediction]) => {
    const confidence = prediction.confidence === null
      ? (lang === "my" ? "ယုံကြည်မှုတန်ဖိုး မရှိပါ" : "Confidence unavailable")
      : `${lang === "my" ? "ယုံကြည်မှု" : "Confidence"} ${Math.round(prediction.confidence * 100)}%`;
    const statusClass = prediction.validationStatus === "healthy"
      ? "is-healthy"
      : prediction.validationStatus === "flagged"
        ? "is-flagged"
        : "is-unknown";

    return (
      <article className="neon-prediction-row" key={target}>
        <div className="neon-prediction-main">
          <div className="neon-prediction-name">
            <strong>{t.modelEvidence.targetLabels[target] ?? readableTarget(target)}</strong>
            <code>{target}</code>
          </div>
          <div className="neon-prediction-value">
            <strong className={prediction.value === null ? "missing-value" : ""}>
              {formatPredictionValue(prediction, lang)}
            </strong>
            {prediction.unit && <span>{unitLabel(prediction.unit, lang)}</span>}
          </div>
        </div>
        <div className="neon-prediction-badges">
          <span>{confidence}</span>
          <span className={statusClass}>{validationLabel(prediction.validationStatus, lang)}</span>
        </div>
        <dl className="neon-prediction-meta">
          <div>
            <dt>{lang === "my" ? "လုပ်ဆောင်ချက်အမျိုးအစား" : "Task type"}</dt>
            <dd>{prediction.taskType?.replaceAll("_", " ") ?? "—"}</dd>
          </div>
          <div>
            <dt>{lang === "my" ? "Model မူကွဲ" : "Model version"}</dt>
            <dd title={prediction.modelVersion ?? undefined}>{prediction.modelVersion ?? "—"}</dd>
          </div>
        </dl>
        {prediction.warnings.length > 0 && (
          <details className="neon-prediction-warnings">
            <summary>
              <HarvestIcon name="alert" size={15} />
              {lang === "my"
                ? `သတိပေးချက် ${prediction.warnings.length} ခု`
                : `${prediction.warnings.length} warning${prediction.warnings.length === 1 ? "" : "s"}`}
              <HarvestIcon name="chevron" size={14} />
            </summary>
            <ul>
              {prediction.warnings.map((warning, index) => (
                <li key={`${target}-warning-${index}`}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
      </article>
    );
  };

  return (
    <details className={`${styles.root} harvest-neon-data`} data-grid-id={cell.id}>
      <summary>
        <span className="neon-data-title-icon"><HarvestIcon name="dataset" size={19} /></span>
        <span className="neon-data-title">
          <strong>{lang === "my" ? "Neon DB အပတ်စဉ် ခန့်မှန်းဒေတာ" : "Neon DB weekly predictions"}</strong>
          <small>weekly_region_predictions</small>
        </span>
        <span className={`neon-data-count ${hasData ? "has-data" : "is-empty"}`}>
          {hasData
            ? (lang === "my"
                ? `${catalogAvailableCount} / ${CORE_MODEL_TARGETS.length} ရရှိ`
                : `${catalogAvailableCount} / ${CORE_MODEL_TARGETS.length} available`)
            : (lang === "my" ? "ဒေတာမရှိ" : "No data")}
        </span>
        <HarvestIcon name="chevron" size={17} />
      </summary>

      <div className="neon-data-body">
        <dl className="neon-data-context">
          <div><dt>5 km Grid ID</dt><dd>{cell.id}</dd></div>
          <div><dt>{lang === "my" ? "တိုင်းဒေသကြီး" : "Region"}</dt><dd>{localizeRegion(cell.region, lang)}</dd></div>
          <div><dt>{lang === "my" ? "အပတ်" : "Week"}</dt><dd>{weekLabel}</dd></div>
          <div><dt>{lang === "my" ? "လေ့လာမှတ်တမ်းရက်" : "Observation date"}</dt><dd>{formatDate(live.observationDate, lang)}</dd></div>
          <div><dt>{lang === "my" ? "ထုတ်လုပ်သည့်အချိန်" : "Generated"}</dt><dd>{live.generatedAt ? new Intl.DateTimeFormat(lang === "my" ? "my-MM" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(live.generatedAt)) : "—"}</dd></div>
          <div><dt>{lang === "my" ? "Coverage" : "Coverage"}</dt><dd>{live.coverageRatio === null ? "—" : `${Math.round(live.coverageRatio * 100)}% · ${live.isPartialWeek ? (lang === "my" ? "မပြည့်စုံ" : "partial") : (lang === "my" ? "ပြည့်စုံ" : "complete")}`}</dd></div>
        </dl>
        <p className="neon-data-provenance">
          <HarvestIcon name="info" size={15} />
          {lang === "my"
            ? "စာမျက်နှာစဖွင့်စဉ်က ရယူထားသော Neon DB ဒေတာကို ပြထားခြင်းဖြစ်၍ cell နှိပ်တိုင်း API အသစ်မခေါ်ပါ။"
            : "Uses the Neon DB payload loaded with this page; selecting a cell does not make another API request."}
          {live.modelCatalogVersion && <code>{live.modelCatalogVersion}</code>}
        </p>

        <div className="neon-availability-summary" role="status">
          <strong>{lang === "my"
            ? `Catalog target ${CORE_MODEL_TARGETS.length} ခုအနက် ${catalogAvailableCount} ခု ရရှိထားသည်`
            : `${catalogAvailableCount} available of ${CORE_MODEL_TARGETS.length} catalog targets`}</strong>
          <span>{lang === "my"
            ? `Declared ${live.telemetry.declaredCellCount ?? "—"} · decoded ${live.telemetry.decodedCellCount} · matched ${live.telemetry.matchedCellCount} · dropped ${live.telemetry.droppedCellCount}`
            : `Declared ${live.telemetry.declaredCellCount ?? "—"} · decoded ${live.telemetry.decodedCellCount} · matched ${live.telemetry.matchedCellCount} · dropped ${live.telemetry.droppedCellCount}`}</span>
          <span>{lang === "my"
            ? `Discovery ${formatBytes(live.telemetry.latestResponseBytes, lang)} / ${formatLatency(live.telemetry.latestLatencyMs, lang)} · Regional ${formatBytes(live.telemetry.regionalResponseBytes, lang)} / ${formatLatency(live.telemetry.regionalLatencyMs, lang)}`
            : `Discovery ${formatBytes(live.telemetry.latestResponseBytes, lang)} / ${formatLatency(live.telemetry.latestLatencyMs, lang)} · Regional ${formatBytes(live.telemetry.regionalResponseBytes, lang)} / ${formatLatency(live.telemetry.regionalLatencyMs, lang)}`}</span>
        </div>

        {live.unavailableReason && (
          <p className="neon-diagnostic-note">
            <strong>{live.diagnostics.failingStage ?? "weekly"}</strong>
            <span>{live.diagnostics.retryable
              ? (lang === "my" ? "ပြန်စမ်းနိုင်သည်" : "Retryable")
              : (lang === "my" ? "ပြင်ဆင်မှုလိုသည်" : "Needs attention")}</span>
            {live.diagnostics.requestId && <code>{live.diagnostics.requestId}</code>}
          </p>
        )}

        {!hasData ? (
          <div className="neon-data-empty" role="status">
            <span><HarvestIcon name="info" size={19} /></span>
            <div>
              <strong>{lang === "my" ? "ဤ cell အတွက် ဒေတာမပြနိုင်သေးပါ" : "No stored predictions for this cell"}</strong>
              <p>{unavailableMessage(live.unavailableReason, lang)}</p>
            </div>
          </div>
        ) : (
          <div className="neon-category-list">
            {groups.categorized.map((category) => category.entries.length > 0 && (
              <details className="neon-category" key={category.id} open={category.id === "suitability"}>
                <summary>
                  <span><HarvestIcon name={category.icon} size={17} /></span>
                  <strong>{category.labels[lang]}</strong>
                  <small>{category.entries.length}</small>
                  <HarvestIcon name="chevron" size={15} />
                </summary>
                <div className="neon-category-body">
                  {category.entries.map(renderPrediction)}
                </div>
              </details>
            ))}

            {groups.other.length > 0 && (
              <details className="neon-category">
                <summary>
                  <span><HarvestIcon name="layers" size={17} /></span>
                  <strong>{lang === "my" ? "အခြားခန့်မှန်းဒေတာ" : "Other predictions"}</strong>
                  <small>{groups.other.length}</small>
                  <HarvestIcon name="chevron" size={15} />
                </summary>
                <div className="neon-category-body">{groups.other.map(renderPrediction)}</div>
              </details>
            )}

            {missingCatalogTargets.length > 0 && (
              <details className="neon-unavailable-targets">
                <summary>
                  <HarvestIcon name="info" size={15} />
                  {lang === "my"
                    ? `မရရှိသော catalog target ${missingCatalogTargets.length} ခု`
                    : `${missingCatalogTargets.length} unavailable catalog targets`}
                  <HarvestIcon name="chevron" size={14} />
                </summary>
                <ul>
                  {missingCatalogTargets.map((target) => {
                    const targetError = liveCell?.errors[target];
                    return (
                      <li key={`missing-${target}`}>
                        <span>{t.modelEvidence.targetLabels[target] ?? readableTarget(target)}</span>
                        <code>{target}</code>
                        <small>{targetError?.code ?? (lang === "my" ? "ဤ run တွင် မရရှိပါ" : "Unavailable for this run")}</small>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {cellErrors.length > 0 && (
              <details className="neon-cell-errors">
                <summary>
                  <HarvestIcon name="alert" size={15} />
                  {lang === "my" ? `Cell error ${cellErrors.length} ခု` : `${cellErrors.length} cell errors`}
                  <HarvestIcon name="chevron" size={14} />
                </summary>
                <ul>
                  {cellErrors.map(([target, message]) => (
                    <li key={target}>
                      <strong>{t.modelEvidence.targetLabels[target] ?? target}</strong>
                      <span>{message.code ? `${message.code} · ` : ""}{message.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
