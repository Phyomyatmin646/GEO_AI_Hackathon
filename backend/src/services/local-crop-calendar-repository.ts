import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { parse } from 'csv-parse/sync';

import {
  CROP_CALENDAR_CROPS,
  parseCropCalendarDataset,
  type CropCalendarDatasetRecord,
} from '../crop-calendar-dataset.js';
import type { CropCalendar, CropCalendarCropSummary } from '../db/store.js';
import type {
  CropCalendarModelKey,
  CropCalendarRegion,
} from '../schemas/crop-calendars.js';
import {
  CropCalendarService,
  type CropCalendarRepository,
} from './crop-calendar-service.js';

const MAX_DATASET_BYTES = 5 * 1024 * 1024;

const CROP_CALENDAR_CSV_HEADERS = [
  'crop_id',
  'crop_name_en',
  'crop_name_mm',
  'region',
  'township',
  'crop_type',
  'planting_start_month',
  'planting_end_month',
  'harvest_start_month',
  'harvest_end_month',
  'growing_duration_min_days',
  'growing_duration_max_days',
  'establishment_start_month',
  'establishment_end_month',
  'years_to_first_harvest_min',
  'years_to_first_harvest_max',
  'harvest_season_start_month',
  'harvest_season_end_month',
  'season',
  'notes_en',
  'notes_mm',
  'source_name',
  'source_url',
  'verification_status',
  'last_updated',
] as const;

const NUMERIC_COLUMNS = new Set<string>([
  'planting_start_month',
  'planting_end_month',
  'harvest_start_month',
  'harvest_end_month',
  'growing_duration_min_days',
  'growing_duration_max_days',
  'establishment_start_month',
  'establishment_end_month',
  'years_to_first_harvest_min',
  'years_to_first_harvest_max',
  'harvest_season_start_month',
  'harvest_season_end_month',
]);

export async function loadLocalCropCalendarService(
  datasetPath: string,
): Promise<CropCalendarService> {
  const resolvedPath = path.resolve(datasetPath);
  let file: Awaited<ReturnType<typeof fs.stat>>;
  try {
    file = await fs.stat(resolvedPath);
  } catch (error) {
    throw new Error('The local Crop Calendar CSV is unavailable.', { cause: error });
  }
  if (!file.isFile()) throw new Error('The local Crop Calendar path must identify a file.');
  if (file.size === 0) throw new Error('The local Crop Calendar CSV is empty.');
  if (file.size > MAX_DATASET_BYTES) {
    throw new Error(`The local Crop Calendar CSV exceeds ${MAX_DATASET_BYTES} bytes.`);
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(resolvedPath);
  } catch (error) {
    throw new Error('The local Crop Calendar CSV could not be read.', { cause: error });
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The local Crop Calendar CSV is not valid UTF-8.');
  }

  let rows: string[][];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    }) as string[][];
  } catch (error) {
    throw new Error('The local Crop Calendar CSV could not be parsed.', { cause: error });
  }
  const [headers, ...dataRows] = rows;
  validateHeaders(headers);
  const rawRecords = dataRows.map((row) => csvRecord(headers, row));
  const dataset = parseCropCalendarDataset(rawRecords);
  const datasetVersion = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const records = dataset.records.map((record, index) =>
    storedRecord(record, datasetVersion, index),
  );
  return new CropCalendarService(new LocalCropCalendarRepository(records));
}

function validateHeaders(headers: string[] | undefined): asserts headers is string[] {
  if (!headers) throw new Error('The local Crop Calendar CSV header is missing.');
  if (new Set(headers).size !== headers.length) {
    throw new Error('The local Crop Calendar CSV headers must be unique.');
  }
  if (
    headers.length !== CROP_CALENDAR_CSV_HEADERS.length ||
    CROP_CALENDAR_CSV_HEADERS.some((header, index) => headers[index] !== header)
  ) {
    throw new Error('The local Crop Calendar CSV must use the exact canonical 25-column header.');
  }
}

function csvRecord(headers: string[], row: string[]): Record<string, unknown> {
  if (row.length !== headers.length) {
    throw new Error('Every local Crop Calendar CSV row must contain exactly 25 columns.');
  }
  return Object.fromEntries(
    headers.map((header, index) => {
      const value = row[index]?.trim() ?? '';
      if (value === '') return [header, null];
      return [header, NUMERIC_COLUMNS.has(header) ? Number(value) : value];
    }),
  );
}

function storedRecord(
  record: CropCalendarDatasetRecord,
  datasetVersion: string,
  index: number,
): CropCalendar {
  const timestamp = `${record.last_updated}T00:00:00.000Z`;
  return {
    id: `local-calendar-${index + 1}`,
    ...record,
    dataset_version: datasetVersion,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

class LocalCropCalendarRepository implements CropCalendarRepository {
  private readonly cropOrder = new Map(
    CROP_CALENDAR_CROPS.map((crop, index) => [crop.model_key, index]),
  );

  constructor(private readonly records: readonly CropCalendar[]) {}

  async listCropCalendarCrops(): Promise<CropCalendarCropSummary[]> {
    return CROP_CALENDAR_CROPS.map((crop) => ({ ...crop }));
  }

  async listCropCalendarsByRegion(region: CropCalendarRegion): Promise<CropCalendar[]> {
    return this.records
      .filter((record) => record.region === region)
      .sort(
        (left, right) =>
          (this.cropOrder.get(left.model_key) ?? Number.MAX_SAFE_INTEGER) -
          (this.cropOrder.get(right.model_key) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((record) => ({ ...record }));
  }

  async getCropCalendar(input: {
    modelKey: CropCalendarModelKey;
    region: CropCalendarRegion;
    season?: string;
  }): Promise<CropCalendar | undefined> {
    const requestedSeason = input.season?.toLocaleLowerCase('en');
    const record = this.records.find(
      (candidate) =>
        candidate.model_key === input.modelKey &&
        candidate.region === input.region &&
        (requestedSeason === undefined ||
          candidate.season?.toLocaleLowerCase('en') === requestedSeason),
    );
    return record ? { ...record } : undefined;
  }
}
