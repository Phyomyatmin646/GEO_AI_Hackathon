import type {
  GridCell,
  PilotBundle,
  RecommendationStatus,
} from "./pilot-data";
import { csvValue } from "./csv-value";

// The largest current regional release contains 3,766 cells. Keeping one
// region below this ceiling allows the interactive map to render the complete
// QA-approved regional grid without silently truncating it.
const MAX_PAGE_SIZE = 5000;
const DEFAULT_PAGE_SIZE = 250;
const CELL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_QUERY_PARAMETERS = new Set([
  "cell_id",
  "region",
  "month",
  "recommendation_status",
  "usable_for_training",
  "limit",
  "offset",
]);

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly parameter?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type CellFilters = {
  cellId?: string;
  region?: string;
  month?: string;
  recommendationStatus?: RecommendationStatus;
  usableForTraining?: boolean;
  limit: number;
  offset: number;
};

export function parseCellFilters(url: URL): CellFilters {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key)) {
      throw new ApiRequestError(
        400,
        "UNSUPPORTED_QUERY_PARAMETER",
        `Unsupported query parameter: ${key}`,
        key,
      );
    }
    if (url.searchParams.getAll(key).length > 1) {
      throw new ApiRequestError(
        400,
        "DUPLICATE_QUERY_PARAMETER",
        `Query parameter may only be supplied once: ${key}`,
        key,
      );
    }
  }

  const cellId = optionalTrimmed(url.searchParams.get("cell_id"));
  if (cellId && !CELL_ID_PATTERN.test(cellId)) {
    throw new ApiRequestError(
      400,
      "INVALID_QUERY_PARAMETER",
      "cell_id may contain only letters, digits, underscores, and hyphens",
      "cell_id",
    );
  }

  const region = optionalTrimmed(url.searchParams.get("region"));
  if (region && region.length > 100) {
    throw new ApiRequestError(
      400,
      "INVALID_QUERY_PARAMETER",
      "region must be at most 100 characters",
      "region",
    );
  }

  const month = optionalTrimmed(url.searchParams.get("month"));
  if (month && !MONTH_PATTERN.test(month)) {
    throw new ApiRequestError(
      400,
      "INVALID_QUERY_PARAMETER",
      "month must be in YYYY-MM form",
      "month",
    );
  }

  const rawRecommendationStatus = optionalTrimmed(
    url.searchParams.get("recommendation_status"),
  );
  let recommendationStatus: RecommendationStatus | undefined;
  if (rawRecommendationStatus) {
    if (
      rawRecommendationStatus !== "scored" &&
      rawRecommendationStatus !== "insufficient_evidence"
    ) {
      throw new ApiRequestError(
        400,
        "INVALID_QUERY_PARAMETER",
        "recommendation_status must be scored or insufficient_evidence",
        "recommendation_status",
      );
    }
    recommendationStatus = rawRecommendationStatus;
  }

  const rawUsable = optionalTrimmed(
    url.searchParams.get("usable_for_training"),
  );
  let usableForTraining: boolean | undefined;
  if (rawUsable) {
    if (rawUsable !== "true" && rawUsable !== "false") {
      throw new ApiRequestError(
        400,
        "INVALID_QUERY_PARAMETER",
        "usable_for_training must be true or false",
        "usable_for_training",
      );
    }
    usableForTraining = rawUsable === "true";
  }

  return {
    cellId,
    region,
    month,
    recommendationStatus,
    usableForTraining,
    limit: integerQueryParameter(
      url.searchParams.get("limit"),
      "limit",
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    ),
    offset: integerQueryParameter(
      url.searchParams.get("offset"),
      "offset",
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

/** Parse the only optional query parameter supported by a cell CSV download. */
export function parseDownloadRegion(url: URL): string | undefined {
  for (const key of url.searchParams.keys()) {
    if (key !== "region") {
      throw new ApiRequestError(
        400,
        "UNSUPPORTED_QUERY_PARAMETER",
        `Unsupported query parameter: ${key}`,
        key,
      );
    }
    if (url.searchParams.getAll(key).length > 1) {
      throw new ApiRequestError(
        400,
        "DUPLICATE_QUERY_PARAMETER",
        `Query parameter may only be supplied once: ${key}`,
        key,
      );
    }
  }
  return optionalTrimmed(url.searchParams.get("region"));
}

function optionalTrimmed(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiRequestError(
      400,
      "INVALID_QUERY_PARAMETER",
      "Query parameters must not be blank",
    );
  }
  return trimmed;
}

function integerQueryParameter(
  value: string | null,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new ApiRequestError(
      400,
      "INVALID_QUERY_PARAMETER",
      `${name} must be an integer`,
      name,
    );
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new ApiRequestError(
      400,
      "INVALID_QUERY_PARAMETER",
      `${name} must be between ${minimum} and ${maximum}`,
      name,
    );
  }
  return parsed;
}

export function filterCells(
  bundle: PilotBundle,
  filters: CellFilters,
): { cells: GridCell[]; total: number } {
  let cells = bundle.cells;
  if (filters.cellId) {
    cells = cells.filter((cell) => cell.id === filters.cellId);
  }
  if (filters.region) {
    const normalizedRegion = filters.region.toLocaleLowerCase("en");
    cells = cells.filter(
      (cell) => cell.region.toLocaleLowerCase("en") === normalizedRegion,
    );
  }
  if (filters.month) {
    cells = cells.filter((cell) => cell.month === filters.month);
  }
  if (filters.recommendationStatus) {
    cells = cells.filter(
      (cell) =>
        cell.recommendationStatus === filters.recommendationStatus,
    );
  }
  if (filters.usableForTraining !== undefined) {
    cells = cells.filter(
      (cell) => cell.usableForTraining === filters.usableForTraining,
    );
  }

  const total = cells.length;
  return {
    cells: cells.slice(filters.offset, filters.offset + filters.limit),
    total,
  };
}

export function findCell(bundle: PilotBundle, cellId: string): GridCell {
  if (!CELL_ID_PATTERN.test(cellId)) {
    throw new ApiRequestError(
      400,
      "INVALID_CELL_ID",
      "Cell ID may contain only letters, digits, underscores, and hyphens",
    );
  }
  const cell = bundle.cells.find((candidate) => candidate.id === cellId);
  if (!cell) {
    throw new ApiRequestError(
      404,
      "CELL_NOT_FOUND",
      `No pilot cell exists with ID ${cellId}`,
    );
  }
  return cell;
}

export function apiHeaders(bundle: PilotBundle): Record<string, string> {
  const hashes = provenanceHashes(bundle);
  return {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    "X-API-Version": "1",
    "X-Data-Contract": bundle.meta.dataContract,
    "X-Data-Mode": bundle.meta.dataMode,
    "X-Release-ID": bundle.meta.releaseId,
    "X-Source-CSV-SHA256": hashes.sourceCsvSha256,
    "X-QA-Report-SHA256": hashes.qaReportSha256,
    "X-Source-Manifest-SHA256": hashes.sourceManifestSha256,
  };
}

export function errorPayload(error: ApiRequestError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.parameter ? { parameter: error.parameter } : {}),
    },
  };
}

const CSV_COLUMNS = [
  "release_id",
  "schema_version",
  "data_contract",
  "source_csv_sha256",
  "qa_report_sha256",
  "source_manifest_sha256",
  "cell_id",
  "region",
  "year_month",
  "latitude",
  "longitude",
  "data_coverage",
  "uncertainty",
  "usable_for_training",
  "recommendation_status",
  "label_source",
  "observed_label_count",
  "crop_rank",
  "crop_id",
  "crop_name_mm",
  "crop_name_en",
  "suitability_score",
  "label_confidence",
  "why",
  "positive_factors_json",
  "limiting_factors_json",
  "missing_features_json",
  "features_json",
  "sources_json",
] as const;

export function selectedCellCsv(bundle: PilotBundle, cell: GridCell): string {
  const hashes = provenanceHashes(bundle);
  const recommendations =
    cell.recommendations.length > 0 ? cell.recommendations : [null];
  const rows = recommendations.map((recommendation, index) => {
    const record: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      release_id: bundle.meta.releaseId,
      schema_version: bundle.schemaVersion,
      data_contract: bundle.meta.dataContract,
      source_csv_sha256: hashes.sourceCsvSha256,
      qa_report_sha256: hashes.qaReportSha256,
      source_manifest_sha256: hashes.sourceManifestSha256,
      cell_id: cell.id,
      region: cell.region,
      year_month: cell.month,
      latitude: cell.latitude,
      longitude: cell.longitude,
      data_coverage: cell.dataCoverage,
      uncertainty: cell.uncertainty,
      usable_for_training: cell.usableForTraining,
      recommendation_status: cell.recommendationStatus,
      label_source: cell.labelSource,
      observed_label_count: cell.observedLabelCount,
      crop_rank: recommendation ? index + 1 : "",
      crop_id: recommendation?.id ?? "",
      crop_name_mm: recommendation?.nameMm ?? "",
      crop_name_en: recommendation?.nameEn ?? "",
      suitability_score: recommendation?.score ?? "",
      label_confidence: recommendation?.confidence ?? "",
      why: recommendation?.why ?? "",
      positive_factors_json: JSON.stringify(
        recommendation?.positiveFactors ?? [],
      ),
      limiting_factors_json: JSON.stringify(
        recommendation?.limitingFactors ?? [],
      ),
      missing_features_json: JSON.stringify(
        recommendation?.missingFeatures ?? [],
      ),
      features_json: JSON.stringify(cell.features),
      sources_json: JSON.stringify(bundle.meta.sources),
    };
    return CSV_COLUMNS.map((column) => csvValue(record[column])).join(",");
  });

  // A UTF-8 BOM keeps Myanmar text legible in spreadsheet software that does
  // not reliably auto-detect UTF-8.
  return `\uFEFF${CSV_COLUMNS.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

function provenanceHashes(bundle: PilotBundle): {
  sourceCsvSha256: string;
  qaReportSha256: string;
  sourceManifestSha256: string;
} {
  const sourceCsvSha256 =
    bundle.meta.sourceCsvSha256 ??
    bundle.meta.artifacts?.find((artifact) => artifact.name.endsWith(".csv"))
      ?.sha256;
  const qaReportSha256 =
    bundle.meta.qaReportSha256 ??
    bundle.meta.artifacts?.find((artifact) =>
      artifact.name.includes("qa_report"),
    )?.sha256;
  const sourceManifestSha256 = bundle.meta.sourceManifestSha256;
  // The runtime bundle validator guarantees all three values before API code
  // runs.
  if (!sourceCsvSha256 || !qaReportSha256 || !sourceManifestSha256) {
    throw new Error("Pilot provenance hashes are unavailable");
  }
  return { sourceCsvSha256, qaReportSha256, sourceManifestSha256 };
}
