"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GridCell } from "../lib/pilot-data";
import { useLanguage } from "../lib/i18n";

const GeoMap = dynamic(() => import("./GeoMap"), {
  ssr: false,
  loading: () => <div className="map-loading">မြေပုံ ပြင်ဆင်နေသည်…</div>,
});
import { CROP_COLORS } from "../lib/colors";
import Link from "next/link";

type PilotSource = {
  id: string;
  name: string;
  datasetId: string;
  role: string;
  resolution: string;
  sourceUrl: string;
};

type ApiPayload = {
  schemaVersion: string;
  meta: {
    releaseId: string;
    dataContract: string;
    dataMode: string;
    region: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    rowCount: number;
    scoredCellCount: number;
    abstainedCellCount: number;
    usableCellCount: number;
    grid: {
      crs: string;
      sizeM: number;
      cellAreaKm2: number;
    };
    qa: {
      valid: boolean;
      warningCount: number;
      errorCount: number;
    };
    sources: PilotSource[];
    splitPolicy: string;
    limitations: string[];
    sourceCsvSha256?: string;
    qaReportSha256?: string;
    sourceManifestSha256?: string;
    artifacts?: Array<{ name: string; sha256: string }>;
  };
  cells: GridCell[];
};

type ReviewVerdict = "agree" | "uncertain" | "disagree";

const numberFormatter = new Intl.NumberFormat("en-US");

function shortHash(value?: string) {
  if (!value) return "not published";
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function formatFeatureValue(
  value: string | number | boolean | null,
  unit: string,
) {
  if (value === null) return "မရှိ / missing";
  if (typeof value !== "number") return `${String(value)}${unit ? ` ${unit}` : ""}`;
  const absolute = Math.abs(value);
  const decimals = absolute >= 100 ? 1 : absolute >= 10 ? 2 : 3;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

export function PilotDashboard() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [activeCropId, setActiveCropId] = useState("");
  const [region, setRegion] = useState("ayeyawaddy");
  const [verdict, setVerdict] = useState<ReviewVerdict>("uncertain");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const { lang, setLang, t } = useLanguage();

  const loadPilot = useCallback(async (selectedRegion: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/v1/cells?limit=2000&region=${selectedRegion}`);
      if (!response.ok) {
        throw new Error(`Pilot API returned ${response.status}`);
      }
      const value = (await response.json()) as ApiPayload;
      if (!Array.isArray(value.cells) || !value.meta?.releaseId) {
        throw new Error("Pilot API response did not match the expected contract");
      }
      setPayload(value);
      setSelectedId((current) =>
        value.cells.some((cell) => cell.id === current)
          ? current
          : (value.cells.find((cell) => cell.recommendationStatus === "scored")?.id ??
            value.cells[0]?.id ??
            ""),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Pilot data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPilot(region);
  }, [loadPilot, region]);

  const selectedCell = useMemo(
    () => payload?.cells.find((cell) => cell.id === selectedId) ?? payload?.cells[0],
    [payload, selectedId],
  );

  const activeCrop =
    selectedCell?.recommendations.find((crop) => crop.id === activeCropId) ??
    selectedCell?.recommendations[0];

  function saveReview() {
    if (!selectedCell || !activeCrop) return;
    const key = `myay-review-${selectedCell.id}-${activeCrop.id}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        cellId: selectedCell.id,
        cropId: activeCrop.id,
        verdict,
        note: reviewNote,
        savedAt: new Date().toISOString(),
        source: "device_local_pilot_review",
        entersTrainingData: false,
      }),
    );
    setReviewSaved(true);
  }

  function selectCell(cellId: string) {
    setSelectedId(cellId);
    setActiveCropId("");
    setReviewSaved(false);
    setReviewNote("");
  }

  function selectCrop(cropId: string) {
    setActiveCropId(cropId);
    setReviewSaved(false);
  }

  if (loading) {
    return (
      <main className="state-page">
        <div className="state-card" role="status">
          <span className="state-pulse" aria-hidden="true" />
          <h1>{t.loading.title}</h1>
          <p>{t.loading.description}</p>
        </div>
      </main>
    );
  }

  if (loadError || !payload || !selectedCell) {
    return (
      <main className="state-page">
        <div className="state-card error-card" role="alert">
          <span className="state-symbol" aria-hidden="true">!</span>
          <h1>{t.error.title}</h1>
          <p>{loadError || t.error.description}</p>
          <button type="button" onClick={() => void loadPilot(region)}>
            {t.error.retry}
          </button>
        </div>
      </main>
    );
  }

  const sourceHash =
    payload.meta.sourceCsvSha256 ??
    payload.meta.artifacts?.find((artifact) => artifact.name.endsWith(".csv"))?.sha256;
  const qaHash =
    payload.meta.qaReportSha256 ??
    payload.meta.artifacts?.find((artifact) => artifact.name.includes("qa_report"))?.sha256;
  const manifestHash =
    payload.meta.sourceManifestSha256 ??
    payload.meta.artifacts?.find((artifact) =>
      artifact.name.includes("source_manifest"),
    )?.sha256;
  const isAbstained = selectedCell.recommendationStatus === "insufficient_evidence";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">မ</span>
          <span>
            <span className="brand-name">{t.header.title.split('|')[0]}</span>
            <span className="brand-subtitle">{t.header.title.split('|')[1]}</span>
          </span>
        </div>
        <div className="topbar-status">
          <button 
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            className="text-sm border px-2 py-1 rounded"
          >
            {lang === "en" ? "မြန်မာ" : "English"}
          </button>
          <span className="status-dot" aria-hidden="true" />
          <span>Real pilot API · QA {payload.meta.qa.valid ? "passed" : "failed"}</span>
        </div>
      </header>

      <div className="content">
        <section className="hero">
          <div>
            <p className="eyebrow flex items-center gap-2">
              Explainable GeoAI · 
              <select 
                value={region} 
                onChange={(e) => setRegion(e.target.value)}
                className="bg-gray-100 border rounded px-2 py-1 text-sm font-semibold text-slate-800"
              >
                <option value="ayeyawaddy">Ayeyawaddy</option>
                <option value="sagaing">Sagaing</option>
                <option value="mandalay">Mandalay</option>
                <option value="bago">Bago</option>
                <option value="magway">Magway</option>
              </select>
              real pilot
            </p>
            <div className="mb-4">
              <Link href="/macro" className="inline-block bg-emerald-100 text-emerald-800 px-4 py-2 rounded-lg font-medium shadow hover:bg-emerald-200 transition items-center gap-2">
                📊 National Macro-Economics Dashboard
              </Link>
            </div>
            <h1>
              မြေတစ်ကွက်ချင်းစီအတွက် <em>ဘာစိုက်သင့်သလဲ?</em>
            </h1>
            <p className="hero-copy">
              {t.header.description}
            </p>
          </div>
          <aside className="hero-note real-note">
            <strong>Real environmental data · rule baseline</strong>
            <p>
              ဒီ release ထဲက feature များသည် QA စစ်ပြီးသော real source data ဖြစ်သည်။
              Crop score များမှာ agronomic rule-based screening သာဖြစ်ပြီး trained
              AI prediction သို့မဟုတ် field-observed label မဟုတ်ပါ။ Evidence မလုံလောက်ပါက
              system က recommendation မပေးဘဲ abstain လုပ်သည်။
            </p>
          </aside>
        </section>

        <section className="metric-strip" aria-label="Real pilot summary">
          <div className="metric">
            <span className="metric-value">{numberFormatter.format(payload.meta.rowCount)}</span>
            <span className="metric-label">Real 5 km pilot cells</span>
          </div>
          <div className="metric">
            <span className="metric-value">{numberFormatter.format(payload.meta.scoredCellCount)}</span>
            <span className="metric-label">Rule-screened cells</span>
          </div>
          <div className="metric">
            <span className="metric-value">{numberFormatter.format(payload.meta.abstainedCellCount)}</span>
            <span className="metric-label">Insufficient-evidence abstentions</span>
          </div>
          <div className="metric">
            <span className="metric-value">0</span>
            <span className="metric-label">Observed crop labels loaded</span>
          </div>
        </section>

        <section className="workspace" aria-label="Interactive crop screening workspace">
          <div className="map-panel">
            <div className="map-toolbar">
              <strong>{payload.meta.region} · {selectedCell.month}</strong>
              <span>
                {payload.meta.grid.sizeM / 1000} km real grid · cell တစ်ကွက်ကို နှိပ်ပါ
              </span>
            </div>
            <div className="map-legend" aria-label="Map legend" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Array.from(new Set(payload.cells.map(c => c.recommendations[0]?.id).filter(Boolean))).map(cropId => (
                <span key={cropId} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", color: "#4b5563" }}>
                  <i style={{ width: "12px", height: "12px", display: "inline-block", backgroundColor: CROP_COLORS[cropId as string] || "#8b918c", borderRadius: "2px" }} />
                  {payload.cells.find(c => c.recommendations[0]?.id === cropId)?.recommendations[0]?.nameEn}
                </span>
              ))}
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", color: "#4b5563" }}>
                <i style={{ width: "12px", height: "12px", display: "inline-block", backgroundColor: "#8b918c", borderRadius: "2px" }} />
                Missing/Unknown
              </span>
            </div>
            <GeoMap
              cells={payload.cells}
              selectedId={selectedCell.id}
              onSelect={selectCell}
            />
          </div>

          <aside className="detail-panel">
            <div className="panel-kicker">
              <span className="cell-id">{selectedCell.id}</span>
              <span className="badge-stack">
                <span className="badge">
                  {Math.round((1 - selectedCell.dataCoverage) * 100)}% missing
                </span>
                <span className={`badge ${selectedCell.uncertainty !== "low" ? "warning" : ""}`}>
                  {selectedCell.uncertainty} uncertainty
                </span>
              </span>
            </div>
            <h2>{selectedCell.region} pilot cell</h2>
            <p className="coordinates">
              {selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)} ·{" "}
              {selectedCell.month} · {payload.meta.grid.cellAreaKm2} km²
            </p>

            {isAbstained ? (
              <div className="abstention-card" role="status">
                <span className="abstention-icon" aria-hidden="true">△</span>
                <div>
                  <h3>Recommendation မပေးနိုင်သေးပါ</h3>
                  <p>
                    ဒီ cell မှာ rule scoring အတွက် လိုအပ်သော source features မလုံလောက်ပါ။
                    Missing values ကို အတုမဖြည့်ထားပါ။
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="section-label">Top rule-based shortlist</p>
                <div className="recommendations">
                  {selectedCell.recommendations.slice(0, 3).map((crop) => (
                    <button
                      type="button"
                      key={crop.id}
                      className={`crop-card ${crop.id === activeCrop?.id ? "active" : ""}`}
                      onClick={() => selectCrop(crop.id)}
                      aria-pressed={crop.id === activeCrop?.id}
                    >
                      <span className="crop-card-top">
                        <span className="crop-name">
                          {crop.nameMm} · {crop.nameEn}
                        </span>
                        <span className="crop-score">{crop.score.toFixed(1)}</span>
                      </span>
                      <span className="score-track">
                        <span className="score-fill" style={{ width: `${crop.score}%` }} />
                      </span>
                      <span className="confidence-line">
                        Rule confidence {Math.round(crop.confidence * 100)}% · not model accuracy
                      </span>
                    </button>
                  ))}
                </div>

                {activeCrop && (
                  <div className="why-box">
                    <h3>Why this crop?</h3>
                    <p>{activeCrop.why}</p>
                    <div className="factor-list">
                      {activeCrop.positiveFactors.map((factor) => (
                        <span className="factor" key={`positive-${factor}`}>✓ {factor}</span>
                      ))}
                      {activeCrop.limitingFactors.map((factor) => (
                        <span className="factor limiting" key={`limiting-${factor}`}>△ {factor}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="uncertainty-box">
              <h3>Evidence status · {selectedCell.recommendationStatus}</h3>
              <p>
                Label source: {selectedCell.labelSource}။ Observed label:
                {" "}{selectedCell.observedLabelCount}။ Training eligibility:
                {" "}{selectedCell.usableForTraining ? "QA-usable feature row" : "excluded by QA"}။
              </p>
            </div>

            <div className="feature-section">
              <div className="section-heading">
                <h3>{t.cell.features.title}</h3>
                <a
                  className="download-link"
                  href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv`}
                  download={`${selectedCell.id}_${selectedCell.month}.csv`}
                >
                  CSV ↓
                </a>
              </div>
              
              <div className="feature-group mt-4">
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.weatherEvidencetitle}</h4>
                <div className="feature-table">
                  {selectedCell.features.filter(f => f.id.includes('temperature') || f.id.includes('rain') || f.id.includes('precipitation') || f.id.includes('solar') || f.id.includes('moisture')).map((feature) => (
                    <div className="feature-row" key={feature.id}>
                      <span>
                        {feature.label}
                        <small>{feature.sourceId}</small>
                      </span>
                      <strong className={feature.value === null ? "missing-value" : ""}>
                        {formatFeatureValue(feature.value, feature.unit)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="feature-group mt-4 opacity-50 border-dashed border-2 p-2 bg-gray-50">
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.climateTrendTitle}</h4>
                <div className="feature-table">
                  <div className="feature-row">
                    <span>
                      30-Year Normal & Anomaly
                      <small>ERA5 / CHIRPS Baseline</small>
                    </span>
                    <strong className="missing-value text-xs italic">
                      {t.cell.features.pendingClimateData}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="feature-group mt-4">
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.terrainAndSoilTitle}</h4>
                <div className="feature-table">
                  {selectedCell.features.filter(f => !f.id.includes('temperature') && !f.id.includes('rain') && !f.id.includes('precipitation') && !f.id.includes('solar') && !f.id.includes('moisture')).map((feature) => (
                    <div className="feature-row" key={feature.id}>
                      <span>
                        {feature.label}
                        <small>{feature.sourceId}</small>
                      </span>
                      <strong className={feature.value === null ? "missing-value" : ""}>
                        {formatFeatureValue(feature.value, feature.unit)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="evidence-grid">
          <article className="evidence-card">
            <p className="card-eyebrow">Release evidence</p>
            <h3>Data QA</h3>
            <div className="qa-row">
              <span>Regional CSV rows</span>
              <span>{numberFormatter.format(payload.meta.rowCount)}</span>
            </div>
            <div className="qa-row">
              <span>QA gate</span>
              <span className={payload.meta.qa.valid ? "qa-pass" : "qa-fail"}>
                {payload.meta.qa.valid ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className="qa-row">
              <span>Warnings / errors</span>
              <span>{payload.meta.qa.warningCount} / {payload.meta.qa.errorCount}</span>
            </div>
            <div className="qa-row">
              <span>QA-usable rows</span>
              <span>{numberFormatter.format(payload.meta.usableCellCount)}</span>
            </div>
            <div className="hash-box">
              <span>Source CSV SHA-256</span>
              <code title={sourceHash}>{shortHash(sourceHash)}</code>
              <span>QA report SHA-256</span>
              <code title={qaHash}>{shortHash(qaHash)}</code>
              <span>Source manifest SHA-256</span>
              <code title={manifestHash}>{shortHash(manifestHash)}</code>
            </div>
          </article>

          <article className="evidence-card source-card">
            <p className="card-eyebrow">Traceable inputs</p>
            <h3>Source provenance</h3>
            <ul className="source-list">
              {payload.meta.sources.map((source) => (
                <li key={source.id}>
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    {source.name}
                  </a>
                  <span>{source.role} · {source.resolution}</span>
                </li>
              ))}
            </ul>
            <p>
              Period: {payload.meta.periodStart} → {payload.meta.periodEnd}. Release:
              {" "}<code>{payload.meta.releaseId}</code>.
            </p>
          </article>

          <article className="evidence-card">
            <p className="card-eyebrow">Human-in-the-loop</p>
            <h3>Agronomist / user review</h3>
            {activeCrop ? (
              <>
                <p>
                  {activeCrop.nameMm} recommendation ကို ဒေသအခြေအနေနဲ့
                  ကိုက်ညီတယ်လို့ မြင်ပါသလား?
                </p>
                <div className="review-controls">
                  {(["agree", "uncertain", "disagree"] as ReviewVerdict[]).map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={verdict === value ? "selected" : ""}
                      onClick={() => setVerdict(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <textarea
                  className="review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="မြေပြင်အခြေအနေ၊ ရေ၊ စိုက်ပျိုးရာသီ မှတ်ချက်…"
                />
                <button type="button" className="save-review" onClick={saveReview}>
                  {reviewSaved ? "Device တွင်သိမ်းပြီးပါပြီ" : "Pilot review သိမ်းမည်"}
                </button>
                <p className="review-disclaimer">
                  Device-local feedback only — training label အဖြစ် auto-merge မလုပ်ပါ။
                </p>
              </>
            ) : (
              <p>
                System abstain လုပ်ထားသော cell ဖြစ်သဖြင့် crop review ကို မဖွင့်ထားပါ။
                Missing evidence ဖြည့်ပြီးမှ ပြန်စစ်ပါ။
              </p>
            )}
          </article>
        </section>

        <section className="limitations">
          <div>
            <p className="card-eyebrow">Responsible-use boundary</p>
            <h2>ဒီ pilot က ဘာမဟုတ်သလဲ</h2>
          </div>
          <ul>
            {payload.meta.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>

        <footer className="footer">
          <span>
            Decision-support only · Farmer choice and local agronomist review remain final.
          </span>
          <span>
            {payload.meta.splitPolicy} · Synthetic rows excluded · Contract {payload.meta.dataContract}
          </span>
        </footer>
      </div>
    </main>
  );
}
