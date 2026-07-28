import fs from "fs";
import path from "path";
export const PILOT_BUNDLE_SCHEMA_VERSION = "1.0.0";
export const PILOT_DATA_MODE = "real_features_rule_based_recommendations";

export type UncertaintyLevel = "low" | "medium" | "high";
export type RecommendationStatus = "scored" | "insufficient_evidence";

export type PilotSource = {
  id: string;
  name: string;
  datasetId: string;
  role: string;
  resolution: string;
  sourceUrl: string;
};

export type PilotFeature = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  status: string;
  sourceId: string;
};

export type PilotArtifact = {
  name: string;
  sha256: string;
};

export type Recommendation = {
  id: string;
  nameMm: string;
  nameEn: string;
  score: number;
  confidence: number;
  why: string;
  positiveFactors: string[];
  limitingFactors: string[];
  missingFeatures: string[];
};

export type GridCell = {
  id: string;
  region: string;
  month: string;
  latitude: number;
  longitude: number;
  polygon: [number, number][];
  dataCoverage: number;
  uncertainty: UncertaintyLevel;
  labelSource: "rule_based";
  observedLabelCount: number;
  usableForTraining: boolean;
  recommendationStatus: RecommendationStatus;
  features: PilotFeature[];
  recommendations: Recommendation[];
};

export type PilotBundleMeta = {
  releaseId: string;
  dataContract: string;
  dataMode: typeof PILOT_DATA_MODE;
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
  sourceManifestSha256: string;
  artifacts?: PilotArtifact[];
};

export type PilotBundle = {
  schemaVersion: typeof PILOT_BUNDLE_SCHEMA_VERSION;
  meta: PilotBundleMeta;
  cells: GridCell[];
};

type UnknownRecord = Record<string, unknown>;

export class PilotBundleValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "PilotBundleValidationError";
  }
}

function fail(path: string, message: string): never {
  throw new PilotBundleValidationError(message, path);
}

function record(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as UnknownRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function httpsUrl(value: unknown, path: string): string {
  const candidate = string(value, path);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    fail(path, "must be an absolute HTTPS URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname === "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    fail(path, "must be an absolute HTTPS URL without embedded credentials");
  }
  return candidate;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) =>
    string(item, `${path}[${index}]`),
  );
}

function finiteNumber(
  value: unknown,
  path: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a finite number");
  }
  if (options.integer && !Number.isInteger(value)) {
    fail(path, "must be an integer");
  }
  if (options.min !== undefined && value < options.min) {
    fail(path, `must be >= ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    fail(path, `must be <= ${options.max}`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function isoDateTime(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!Number.isFinite(Date.parse(parsed))) {
    fail(path, "must be an ISO-8601 date/time");
  }
  return parsed;
}

function isoDate(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    fail(path, "must be an ISO date in YYYY-MM-DD form");
  }
  return parsed;
}

function yearMonth(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(parsed)) {
    fail(path, "must be in YYYY-MM form");
  }
  return parsed;
}

function oneOf<T extends string>(
  value: unknown,
  path: string,
  accepted: readonly T[],
): T {
  if (typeof value !== "string" || !accepted.includes(value as T)) {
    fail(path, `must be one of: ${accepted.join(", ")}`);
  }
  return value as T;
}

function measurementOrNull(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  fail(path, "must be a finite number or null");
}

function sha256(value: unknown, path: string): string {
  const digest = string(value, path).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    fail(path, "must be a 64-character hexadecimal SHA-256 digest");
  }
  return digest;
}

function optionalSha256(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return sha256(value, path);
}

function parseSource(value: unknown, path: string): PilotSource {
  const source = record(value, path);
  return {
    id: string(source.id, `${path}.id`),
    name: string(source.name, `${path}.name`),
    datasetId: string(source.datasetId, `${path}.datasetId`),
    role: string(source.role, `${path}.role`),
    resolution: string(source.resolution, `${path}.resolution`),
    sourceUrl: httpsUrl(source.sourceUrl, `${path}.sourceUrl`),
  };
}

function parseFeature(
  value: unknown,
  path: string,
  sourceIds: Set<string>,
): PilotFeature {
  const feature = record(value, path);
  const sourceId = string(feature.sourceId, `${path}.sourceId`);
  if (!sourceIds.has(sourceId)) {
    fail(`${path}.sourceId`, `references unknown source ${sourceId}`);
  }
  const status = string(feature.status, `${path}.status`);
  const parsedValue = measurementOrNull(feature.value, `${path}.value`);
  if (status === "missing" && parsedValue !== null) {
    fail(`${path}.value`, "must be null when status is missing");
  }
  return {
    id: string(feature.id, `${path}.id`),
    label: string(feature.label, `${path}.label`),
    value: parsedValue,
    unit: string(feature.unit, `${path}.unit`),
    status,
    sourceId,
  };
}

function parseRecommendation(value: unknown, path: string): Recommendation {
  const recommendation = record(value, path);
  return {
    id: string(recommendation.id, `${path}.id`),
    nameMm: string(recommendation.nameMm, `${path}.nameMm`),
    nameEn: string(recommendation.nameEn, `${path}.nameEn`),
    score: finiteNumber(recommendation.score, `${path}.score`, {
      min: 0,
      max: 100,
    }),
    confidence: finiteNumber(
      recommendation.confidence,
      `${path}.confidence`,
      { min: 0, max: 1 },
    ),
    why: string(recommendation.why, `${path}.why`),
    positiveFactors: stringArray(
      recommendation.positiveFactors,
      `${path}.positiveFactors`,
    ),
    limitingFactors: stringArray(
      recommendation.limitingFactors,
      `${path}.limitingFactors`,
    ),
    missingFeatures: stringArray(
      recommendation.missingFeatures,
      `${path}.missingFeatures`,
    ),
  };
}

function parseCell(
  value: unknown,
  path: string,
  sourceIds: Set<string>,
): GridCell {
  const cell = record(value, path);
  const latitude = finiteNumber(cell.latitude, `${path}.latitude`, {
    min: 9,
    max: 29,
  });
  const longitude = finiteNumber(cell.longitude, `${path}.longitude`, {
    min: 92,
    max: 102,
  });
  const polygon = array(cell.polygon, `${path}.polygon`).map((point, index) => {
    const coordinates = array(point, `${path}.polygon[${index}]`);
    if (coordinates.length !== 2) {
      fail(`${path}.polygon[${index}]`, "must contain [latitude, longitude]");
    }
    return [
      finiteNumber(coordinates[0], `${path}.polygon[${index}][0]`, {
        min: 9,
        max: 29,
      }),
      finiteNumber(coordinates[1], `${path}.polygon[${index}][1]`, {
        min: 92,
        max: 102,
      }),
    ] as [number, number];
  });
  if (polygon.length < 4) fail(`${path}.polygon`, "must contain at least four points");

  const recommendationStatus = oneOf(
    cell.recommendationStatus,
    `${path}.recommendationStatus`,
    ["scored", "insufficient_evidence"] as const,
  );
  const recommendations = array(
    cell.recommendations,
    `${path}.recommendations`,
  ).map((recommendation, index) =>
    parseRecommendation(recommendation, `${path}.recommendations[${index}]`),
  );
  if (recommendationStatus === "scored" && recommendations.length === 0) {
    fail(`${path}.recommendations`, "must not be empty for a scored cell");
  }
  if (
    recommendationStatus === "insufficient_evidence" &&
    recommendations.length !== 0
  ) {
    fail(
      `${path}.recommendations`,
      "must be empty when evidence is insufficient",
    );
  }
  for (let index = 1; index < recommendations.length; index += 1) {
    if (recommendations[index].score > recommendations[index - 1].score) {
      fail(`${path}.recommendations`, "must be sorted by descending score");
    }
  }

  const features = array(cell.features, `${path}.features`).map(
    (feature, index) =>
      parseFeature(feature, `${path}.features[${index}]`, sourceIds),
  );
  const featureIds = new Set<string>();
  for (const feature of features) {
    if (featureIds.has(feature.id)) {
      fail(`${path}.features`, `contains duplicate feature id ${feature.id}`);
    }
    featureIds.add(feature.id);
  }

  const observedLabelCount = finiteNumber(
    cell.observedLabelCount,
    `${path}.observedLabelCount`,
    { min: 0, integer: true },
  );
  if (observedLabelCount !== 0) {
    fail(
      `${path}.observedLabelCount`,
      "must remain zero for this non-observed pilot release",
    );
  }

  return {
    id: string(cell.id, `${path}.id`),
    region: string(cell.region, `${path}.region`),
    month: yearMonth(cell.month, `${path}.month`),
    latitude,
    longitude,
    polygon,
    dataCoverage: finiteNumber(cell.dataCoverage, `${path}.dataCoverage`, {
      min: 0,
      max: 1,
    }),
    uncertainty: oneOf(
      cell.uncertainty,
      `${path}.uncertainty`,
      ["low", "medium", "high"] as const,
    ),
    labelSource: oneOf(
      cell.labelSource,
      `${path}.labelSource`,
      ["rule_based"] as const,
    ),
    observedLabelCount,
    usableForTraining: boolean(
      cell.usableForTraining,
      `${path}.usableForTraining`,
    ),
    recommendationStatus,
    features,
    recommendations,
  };
}

export function parsePilotBundle(value: unknown): PilotBundle {
  const bundle = record(value, "bundle");
  const schemaVersion = string(bundle.schemaVersion, "bundle.schemaVersion");
  if (schemaVersion !== PILOT_BUNDLE_SCHEMA_VERSION) {
    fail(
      "bundle.schemaVersion",
      `unsupported version ${schemaVersion}; expected ${PILOT_BUNDLE_SCHEMA_VERSION}`,
    );
  }

  const metaRecord = record(bundle.meta, "bundle.meta");
  const sources = array(metaRecord.sources, "bundle.meta.sources").map(
    (source, index) => parseSource(source, `bundle.meta.sources[${index}]`),
  );
  if (sources.length === 0) fail("bundle.meta.sources", "must not be empty");
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) {
      fail("bundle.meta.sources", `contains duplicate source id ${source.id}`);
    }
    sourceIds.add(source.id);
  }

  const meta: PilotBundleMeta = {
    releaseId: string(metaRecord.releaseId, "bundle.meta.releaseId"),
    dataContract: string(metaRecord.dataContract, "bundle.meta.dataContract"),
    dataMode: oneOf(
      metaRecord.dataMode,
      "bundle.meta.dataMode",
      [PILOT_DATA_MODE] as const,
    ),
    region: string(metaRecord.region, "bundle.meta.region"),
    periodStart: isoDate(metaRecord.periodStart, "bundle.meta.periodStart"),
    periodEnd: isoDate(metaRecord.periodEnd, "bundle.meta.periodEnd"),
    generatedAt: isoDateTime(metaRecord.generatedAt, "bundle.meta.generatedAt"),
    rowCount: finiteNumber(metaRecord.rowCount, "bundle.meta.rowCount", {
      min: 0,
      integer: true,
    }),
    scoredCellCount: finiteNumber(
      metaRecord.scoredCellCount,
      "bundle.meta.scoredCellCount",
      { min: 0, integer: true },
    ),
    abstainedCellCount: finiteNumber(
      metaRecord.abstainedCellCount,
      "bundle.meta.abstainedCellCount",
      { min: 0, integer: true },
    ),
    usableCellCount: finiteNumber(
      metaRecord.usableCellCount,
      "bundle.meta.usableCellCount",
      { min: 0, integer: true },
    ),
    grid: (() => {
      const grid = record(metaRecord.grid, "bundle.meta.grid");
      return {
        crs: string(grid.crs, "bundle.meta.grid.crs"),
        sizeM: finiteNumber(grid.sizeM, "bundle.meta.grid.sizeM", {
          min: 1,
          integer: true,
        }),
        cellAreaKm2: finiteNumber(
          grid.cellAreaKm2,
          "bundle.meta.grid.cellAreaKm2",
          { min: 0 },
        ),
      };
    })(),
    qa: (() => {
      const qa = record(metaRecord.qa, "bundle.meta.qa");
      return {
        valid: boolean(qa.valid, "bundle.meta.qa.valid"),
        warningCount: finiteNumber(
          qa.warningCount,
          "bundle.meta.qa.warningCount",
          { min: 0, integer: true },
        ),
        errorCount: finiteNumber(
          qa.errorCount,
          "bundle.meta.qa.errorCount",
          { min: 0, integer: true },
        ),
      };
    })(),
    sources,
    splitPolicy: string(metaRecord.splitPolicy, "bundle.meta.splitPolicy"),
    limitations: stringArray(
      metaRecord.limitations,
      "bundle.meta.limitations",
    ),
    sourceCsvSha256: optionalSha256(
      metaRecord.sourceCsvSha256,
      "bundle.meta.sourceCsvSha256",
    ),
    qaReportSha256: optionalSha256(
      metaRecord.qaReportSha256,
      "bundle.meta.qaReportSha256",
    ),
    sourceManifestSha256: sha256(
      metaRecord.sourceManifestSha256,
      "bundle.meta.sourceManifestSha256",
    ),
    artifacts:
      metaRecord.artifacts === undefined
        ? undefined
        : array(metaRecord.artifacts, "bundle.meta.artifacts").map(
            (artifact, index) => {
              const item = record(
                artifact,
                `bundle.meta.artifacts[${index}]`,
              );
              return {
                name: string(
                  item.name,
                  `bundle.meta.artifacts[${index}].name`,
                ),
                sha256: sha256(
                  item.sha256,
                  `bundle.meta.artifacts[${index}].sha256`,
                ),
              };
            },
          ),
  };

  if (!meta.qa.valid || meta.qa.errorCount !== 0) {
    fail("bundle.meta.qa", "only a QA-valid release with zero errors may be served");
  }
  if (meta.periodEnd <= meta.periodStart) {
    fail("bundle.meta.periodEnd", "must be later than periodStart");
  }
  const sourceCsvHash =
    meta.sourceCsvSha256 ??
    meta.artifacts?.find((artifact) => artifact.name.endsWith(".csv"))?.sha256;
  const qaReportHash =
    meta.qaReportSha256 ??
    meta.artifacts?.find((artifact) =>
      artifact.name.includes("qa_report"),
    )?.sha256;
  if (!sourceCsvHash) {
    fail(
      "bundle.meta",
      "must publish a source CSV SHA-256 directly or in artifacts",
    );
  }
  if (!qaReportHash) {
    fail(
      "bundle.meta",
      "must publish a QA report SHA-256 directly or in artifacts",
    );
  }

  const cells = array(bundle.cells, "bundle.cells").map((cell, index) =>
    parseCell(cell, `bundle.cells[${index}]`, sourceIds),
  );
  const cellKeys = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.id}\u0000${cell.month}`;
    if (cellKeys.has(key)) {
      fail("bundle.cells", `contains duplicate cell/month key ${cell.id}/${cell.month}`);
    }
    cellKeys.add(key);
  }

  const scoredCellCount = cells.filter(
    (cell) => cell.recommendationStatus === "scored",
  ).length;
  const abstainedCellCount = cells.length - scoredCellCount;
  const usableCellCount = cells.filter((cell) => cell.usableForTraining).length;
  if (meta.rowCount !== cells.length) {
    fail(
      "bundle.meta.rowCount",
      `declares ${meta.rowCount}, but bundle contains ${cells.length} cells`,
    );
  }
  if (meta.scoredCellCount !== scoredCellCount) {
    fail(
      "bundle.meta.scoredCellCount",
      `declares ${meta.scoredCellCount}, but found ${scoredCellCount}`,
    );
  }
  if (meta.abstainedCellCount !== abstainedCellCount) {
    fail(
      "bundle.meta.abstainedCellCount",
      `declares ${meta.abstainedCellCount}, but found ${abstainedCellCount}`,
    );
  }
  if (meta.usableCellCount !== usableCellCount) {
    fail(
      "bundle.meta.usableCellCount",
      `declares ${meta.usableCellCount}, but found ${usableCellCount}`,
    );
  }

  return {
    schemaVersion: PILOT_BUNDLE_SCHEMA_VERSION,
    meta,
    cells,
  };
}

const cachedBundles: Record<string, PilotBundle> = {};

export async function loadPilotBundle(region: string = "ayeyawaddy"): Promise<PilotBundle> {
  const normalizedRegion = region.toLowerCase();
  if (!cachedBundles[normalizedRegion]) {
    let rawBundle;
    try {
      if (normalizedRegion === "ayeyawaddy") {
        rawBundle = (await import("../../data/output/pilot_ayeyawaddy_2018_01/pilot_ayeyawaddy_2018_01.json", { with: { type: "json" } })).default;
      } else if (normalizedRegion === "magway") {
        rawBundle = (await import("../../data/output/pilot_magway_2018_01/pilot_magway_2018_01.json", { with: { type: "json" } })).default;
      } else if (normalizedRegion === "mandalay") {
        rawBundle = (await import("../../data/output/pilot_mandalay_2018_01/pilot_mandalay_2018_01.json", { with: { type: "json" } })).default;
      } else if (normalizedRegion === "sagaing") {
        rawBundle = (await import("../../data/output/pilot_sagaing_2018_01/pilot_sagaing_2018_01.json", { with: { type: "json" } })).default;
      } else {
        throw new Error(`Unknown region: ${region}`);
      }
    } catch (e: any) {
      throw new Error(`Data for region ${region} not found. Error: ${e.message}`);
    }
    
    cachedBundles[normalizedRegion] = parsePilotBundle(rawBundle as unknown);
  }
  return cachedBundles[normalizedRegion];
}
