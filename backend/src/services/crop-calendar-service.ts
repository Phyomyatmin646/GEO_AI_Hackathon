import type {
  AppStore,
  CropCalendar,
  CropCalendarCropSummary,
} from '../db/store.js';
import {
  CROP_CALENDAR_MODEL_KEYS,
  type CropCalendarModelKey,
  type CropCalendarRegion,
} from '../schemas/crop-calendars.js';

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTHS_MM = [
  'ဇန်နဝါရီ',
  'ဖေဖော်ဝါရီ',
  'မတ်',
  'ဧပြီ',
  'မေ',
  'ဇွန်',
  'ဇူလိုင်',
  'ဩဂုတ်',
  'စက်တင်ဘာ',
  'အောက်တိုဘာ',
  'နိုဝင်ဘာ',
  'ဒီဇင်ဘာ',
] as const;

type MonthWindow = {
  start_month: number | null;
  end_month: number | null;
  start_label_en: string | null;
  start_label_mm: string | null;
  end_label_en: string | null;
  end_label_mm: string | null;
  label_en: string | null;
  label_mm: string | null;
  is_complete: boolean;
};

export class CropCalendarService {
  constructor(private readonly store: AppStore) {}

  async crops(): Promise<{ crops: CropCalendarCropSummary[] }> {
    const crops = await this.store.listCropCalendarCrops();
    const order = new Map(CROP_CALENDAR_MODEL_KEYS.map((key, index) => [key, index]));
    crops.sort(
      (left, right) =>
        (order.get(left.model_key) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.model_key) ?? Number.MAX_SAFE_INTEGER),
    );
    return { crops };
  }

  async byRegion(region: CropCalendarRegion) {
    const records = await this.store.listCropCalendarsByRegion(region);
    return { calendars: records.map(formatCropCalendar) };
  }

  async one(input: {
    modelKey: CropCalendarModelKey;
    region: CropCalendarRegion;
    season?: string;
  }) {
    const record = await this.store.getCropCalendar(input);
    return record ? formatCropCalendar(record) : undefined;
  }
}

export function formatCropCalendar(record: CropCalendar) {
  const source =
    record.source_code ||
    record.source_name ||
    record.source_title ||
    record.source_url ||
    record.publication_year !== null
      ? {
          code: record.source_code,
          organization: record.source_name,
          title: record.source_title,
          url: record.source_url,
          publication_year: record.publication_year,
        }
      : null;
  const notes =
    record.notes_en || record.notes_mm || record.data_quality_note
      ? {
          en: record.notes_en,
          mm: record.notes_mm,
          data_quality: record.data_quality_note,
        }
      : null;

  return {
    model_key: record.model_key,
    crop_name_en: record.crop_name_en,
    crop_name_mm: record.crop_name_mm,
    crop_type: record.crop_type,
    region: record.region,
    township: record.township,
    season: record.season,
    planting:
      record.crop_type === 'annual'
        ? monthWindow(record.planting_start_month, record.planting_end_month)
        : null,
    harvest:
      record.crop_type === 'annual'
        ? monthWindow(record.harvest_start_month, record.harvest_end_month)
        : null,
    growing_duration:
      record.crop_type === 'annual' &&
      (record.growing_duration_min_days !== null || record.growing_duration_max_days !== null)
        ? {
            min_days: record.growing_duration_min_days,
            max_days: record.growing_duration_max_days,
          }
        : null,
    establishment:
      record.crop_type === 'perennial'
        ? monthWindow(record.establishment_start_month, record.establishment_end_month)
        : null,
    first_harvest:
      record.crop_type === 'perennial' &&
      (record.years_to_first_harvest_min !== null || record.years_to_first_harvest_max !== null)
        ? {
            min_years: record.years_to_first_harvest_min,
            max_years: record.years_to_first_harvest_max,
          }
        : null,
    harvest_season:
      record.crop_type === 'perennial'
        ? monthWindow(record.harvest_season_start_month, record.harvest_season_end_month)
        : null,
    verification: verification(record.verification_status, record.confidence),
    evidence_type: record.evidence_type,
    geographic_specificity: record.geographic_specificity,
    source,
    notes,
    last_verified_date: record.last_verified_date,
    last_updated: record.last_updated,
    dataset_version: record.dataset_version,
  };
}

function monthWindow(start: number | null, end: number | null): MonthWindow | null {
  if (start === null && end === null) return null;
  const startLabelEn = start === null ? null : MONTHS_EN[start - 1] ?? null;
  const endLabelEn = end === null ? null : MONTHS_EN[end - 1] ?? null;
  const startLabelMm = start === null ? null : MONTHS_MM[start - 1] ?? null;
  const endLabelMm = end === null ? null : MONTHS_MM[end - 1] ?? null;
  return {
    start_month: start,
    end_month: end,
    start_label_en: startLabelEn,
    start_label_mm: startLabelMm,
    end_label_en: endLabelEn,
    end_label_mm: endLabelMm,
    label_en: start !== null && end !== null ? monthLabel(start, end, MONTHS_EN) : null,
    label_mm: start !== null && end !== null ? monthLabel(start, end, MONTHS_MM) : null,
    is_complete: start !== null && end !== null,
  };
}

function monthLabel(
  start: number | null,
  end: number | null,
  labels: readonly string[],
): string | null {
  const startLabel = start === null ? null : labels[start - 1];
  const endLabel = end === null ? null : labels[end - 1];
  if (!startLabel && !endLabel) return null;
  if (!startLabel) return endLabel ?? null;
  if (!endLabel || end === start) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

function verification(status: CropCalendar['verification_status'], confidence: number | null) {
  const labels = {
    verified: {
      label_en: 'Source-backed regional calendar',
      label_mm: 'ဒေသအလိုက် အရင်းအမြစ်အထောက်အထားရှိသော ပြက္ခဒိန်',
    },
    needs_verification: {
      label_en: 'Calendar data requires verification',
      label_mm: 'စိုက်ပျိုးပြက္ခဒိန်အချက်အလက်ကို အတည်ပြုရန် လိုအပ်သည်',
    },
    insufficient_evidence: {
      label_en: 'Insufficient calendar evidence',
      label_mm: 'စိုက်ပျိုးပြက္ခဒိန်အထောက်အထား မလုံလောက်ပါ',
    },
    not_applicable: {
      label_en: 'Calendar not applicable',
      label_mm: 'စိုက်ပျိုးပြက္ခဒိန် မသက်ဆိုင်ပါ',
    },
    not_recommended: {
      label_en: 'Crop not recommended for this scope',
      label_mm: 'ဤဒေသအတွက် သီးနှံကို အကြံမပြုပါ',
    },
  } satisfies Record<
    CropCalendar['verification_status'],
    { label_en: string; label_mm: string }
  >;
  return { status, confidence, ...labels[status] };
}
