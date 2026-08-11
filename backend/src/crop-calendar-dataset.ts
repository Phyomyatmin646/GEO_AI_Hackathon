import { z } from 'zod';

import {
  CROP_CALENDAR_MODEL_KEYS,
  CROP_CALENDAR_REGIONS,
  CropCalendarModelKeySchema,
  type CropCalendarModelKey,
  type CropCalendarRegion,
} from './schemas/crop-calendars.js';

export const CROP_CALENDAR_RECORDS_EXPECTED = 102;

export const CROP_CALENDAR_RESEARCH_BASELINE = {
  verified_records: 22,
  needs_verification_records: 80,
  annual_records: 72,
  perennial_records: 30,
  annual_rows_with_planting: 48,
  annual_rows_with_harvest: 44,
  perennial_rows_with_establishment: 0,
  perennial_rows_with_harvest_season: 24,
} as const;

export const CROP_CALENDAR_CROPS = [
  {
    model_key: 'crop_suitability_monsoon_rice',
    crop_name_en: 'Monsoon Rice',
    crop_name_mm: 'မိုးစပါး',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_dry_season_rice',
    crop_name_en: 'Dry Season Rice',
    crop_name_mm: 'နွေစပါး',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_black_gram',
    crop_name_en: 'Black Gram',
    crop_name_mm: 'မတ်ပဲ',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_groundnut',
    crop_name_en: 'Groundnut',
    crop_name_mm: 'မြေပဲ',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_maize',
    crop_name_en: 'Maize',
    crop_name_mm: 'ပြောင်း',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_sugarcane',
    crop_name_en: 'Sugarcane',
    crop_name_mm: 'ကြံ',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_cassava',
    crop_name_en: 'Cassava',
    crop_name_mm: 'ပီလောပီနံ',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_chili',
    crop_name_en: 'Chili',
    crop_name_mm: 'ငရုတ်',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_tomato',
    crop_name_en: 'Tomato',
    crop_name_mm: 'ခရမ်းချဉ်',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_green_gram',
    crop_name_en: 'Green Gram',
    crop_name_mm: 'ပဲတီစိမ်း',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_pigeon_pea',
    crop_name_en: 'Pigeon Pea',
    crop_name_mm: 'ပဲစဉ်းငုံ',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_sesame',
    crop_name_en: 'Sesame',
    crop_name_mm: 'နှမ်း',
    crop_type: 'annual',
  },
  {
    model_key: 'crop_suitability_rubber',
    crop_name_en: 'Rubber',
    crop_name_mm: 'ရော်ဘာ',
    crop_type: 'perennial',
  },
  {
    model_key: 'crop_suitability_durian',
    crop_name_en: 'Durian',
    crop_name_mm: 'ဒူးရင်း',
    crop_type: 'perennial',
  },
  {
    model_key: 'crop_suitability_mangosteen',
    crop_name_en: 'Mangosteen',
    crop_name_mm: 'မင်းကွတ်',
    crop_type: 'perennial',
  },
  {
    model_key: 'crop_suitability_longan',
    crop_name_en: 'Longan',
    crop_name_mm: 'တညင်း',
    crop_type: 'perennial',
  },
  {
    model_key: 'crop_suitability_mango',
    crop_name_en: 'Mango',
    crop_name_mm: 'သရက်',
    crop_type: 'perennial',
  },
] as const satisfies readonly {
  model_key: CropCalendarModelKey;
  crop_name_en: string;
  crop_name_mm: string;
  crop_type: 'annual' | 'perennial';
}[];

export const LONGAN_BURMESE_NAME_DATA_QUALITY_NOTE =
  "The supplied research Burmese Longan label 'တညင်း' differs from the project's 'လောင်ဂန်' and requires authoritative naming verification.";

export const CROP_CALENDAR_VERIFICATION_STATUSES = [
  'verified',
  'needs_verification',
  'insufficient_evidence',
  'not_applicable',
  'not_recommended',
] as const;

export type CropCalendarVerificationStatus =
  (typeof CROP_CALENDAR_VERIFICATION_STATUSES)[number];

const Month = z.number().int().min(1).max(12).nullable();
const PositiveInteger = z.number().int().positive().nullable();
const PositiveNumber = z.number().finite().positive().nullable();
const NullableScopeText = nullableTrimmedText(160, false);
const NullableNotes = nullableTrimmedText(20_000, true);
const NullableSourceText = nullableTrimmedText(1_000, false);
const NullableProvenanceText = nullableTrimmedText(256, false);
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected an ISO calendar date (YYYY-MM-DD)')
  .refine(isRealIsoDate, 'Expected a real ISO calendar date');

const NullableHttpUrl = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .url()
  .refine(isSafeHttpUrl, 'Expected an HTTP(S) URL without embedded credentials')
  .nullable();

const RawCropCalendarRecordSchema = z
  .object({
    crop_id: CropCalendarModelKeySchema,
    crop_name_en: z.string().trim().min(1).max(160),
    crop_name_mm: z.string().trim().min(1).max(160),
    region: z.enum(CROP_CALENDAR_REGIONS),
    township: NullableScopeText,
    crop_type: z.enum(['annual', 'perennial']),
    planting_start_month: Month,
    planting_end_month: Month,
    harvest_start_month: Month,
    harvest_end_month: Month,
    growing_duration_min_days: PositiveInteger,
    growing_duration_max_days: PositiveInteger,
    establishment_start_month: Month,
    establishment_end_month: Month,
    years_to_first_harvest_min: PositiveNumber,
    years_to_first_harvest_max: PositiveNumber,
    harvest_season_start_month: Month,
    harvest_season_end_month: Month,
    season: NullableScopeText,
    notes_en: NullableNotes,
    notes_mm: NullableNotes,
    source_name: NullableSourceText,
    source_url: NullableHttpUrl,
    verification_status: z.enum(CROP_CALENDAR_VERIFICATION_STATUSES),
    last_updated: IsoDate,

    // The Deep Research report's canonical format has 25 fields. These richer
    // provenance fields are accepted when supplied and otherwise remain NULL.
    source_code: nullableTrimmedText(64, false).optional().default(null),
    source_title: NullableSourceText.optional().default(null),
    publication_year: z.number().int().min(1800).max(2100).nullable().optional().default(null),
    evidence_type: NullableProvenanceText.optional().default(null),
    geographic_specificity: NullableProvenanceText.optional().default(null),
    confidence: z.number().finite().min(0).max(1).nullable().optional().default(null),
    last_verified_date: IsoDate.nullable().optional().default(null),
    data_quality_note: NullableNotes.optional().default(null),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.township !== null) {
      context.addIssue({
        code: 'custom',
        path: ['township'],
        message: 'the initial 17 by 6 regional dataset requires township to be null',
      });
    }
    validateOrderedRange(
      record.growing_duration_min_days,
      record.growing_duration_max_days,
      'growing_duration',
      context,
    );
    validateOrderedRange(
      record.years_to_first_harvest_min,
      record.years_to_first_harvest_max,
      'years_to_first_harvest',
      context,
    );

    if (
      record.last_verified_date !== null &&
      record.last_verified_date > record.last_updated
    ) {
      context.addIssue({
        code: 'custom',
        path: ['last_verified_date'],
        message: 'last_verified_date cannot be later than last_updated',
      });
    }

    if (
      record.verification_status === 'verified' &&
      (record.source_name === null || record.source_url === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['source_name'],
        message: 'verified records require source_name and source_url',
      });
    }

    const perennialValues = [
      record.establishment_start_month,
      record.establishment_end_month,
      record.years_to_first_harvest_min,
      record.years_to_first_harvest_max,
      record.harvest_season_start_month,
      record.harvest_season_end_month,
    ];
    if (record.crop_type === 'annual' && perennialValues.some((value) => value !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['crop_type'],
        message: 'annual records cannot populate perennial calendar fields',
      });
    }

    const annualValues = [
      record.planting_start_month,
      record.planting_end_month,
      record.harvest_start_month,
      record.harvest_end_month,
      record.growing_duration_min_days,
      record.growing_duration_max_days,
    ];
    if (record.crop_type === 'perennial' && annualValues.some((value) => value !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['crop_type'],
        message: 'perennial records cannot populate annual calendar fields',
      });
    }
  });

type ParsedCropCalendarRecord = z.infer<typeof RawCropCalendarRecordSchema>;

export type CropCalendarDatasetRecord = Omit<ParsedCropCalendarRecord, 'crop_id'> & {
  model_key: CropCalendarModelKey;
};

export type CropCalendarDatasetSummary = {
  total_records: number;
  crop_count: number;
  region_count: number;
  verification_statuses: Record<CropCalendarVerificationStatus, number>;
  annual_records: number;
  perennial_records: number;
  annual_rows_with_planting: number;
  annual_rows_with_harvest: number;
  perennial_rows_with_establishment: number;
  perennial_rows_with_harvest_season: number;
};

export type ValidatedCropCalendarDataset = {
  records: CropCalendarDatasetRecord[];
  summary: CropCalendarDatasetSummary;
};

export class CropCalendarDatasetValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid Crop Calendar dataset: ${issues.join('; ')}`);
    this.name = 'CropCalendarDatasetValidationError';
  }
}

export function parseCropCalendarDataset(input: unknown): ValidatedCropCalendarDataset {
  if (!Array.isArray(input)) {
    throw new CropCalendarDatasetValidationError([
      'the canonical JSON document must be a top-level array',
    ]);
  }
  if (input.length !== CROP_CALENDAR_RECORDS_EXPECTED) {
    throw new CropCalendarDatasetValidationError([
      `expected exactly ${CROP_CALENDAR_RECORDS_EXPECTED} records, received ${input.length}`,
    ]);
  }

  const parsed = z.array(RawCropCalendarRecordSchema).safeParse(input);
  if (!parsed.success) {
    throw new CropCalendarDatasetValidationError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'dataset';
        return `${path}: ${issue.message}`;
      }),
    );
  }

  const cropMetadata = new Map(CROP_CALENDAR_CROPS.map((crop) => [crop.model_key, crop]));
  const seenPairs = new Set<string>();
  const coverageIssues: string[] = [];
  const records = parsed.data.map((record, index): CropCalendarDatasetRecord => {
    const expected = cropMetadata.get(record.crop_id);
    if (!expected) {
      coverageIssues.push(`record ${index}: unsupported crop_id ${record.crop_id}`);
    } else {
      if (record.crop_name_en !== expected.crop_name_en) {
        coverageIssues.push(
          `record ${index}: crop_name_en for ${record.crop_id} must be ${expected.crop_name_en}`,
        );
      }
      if (record.crop_name_mm !== expected.crop_name_mm) {
        coverageIssues.push(
          `record ${index}: crop_name_mm for ${record.crop_id} does not match the provided dataset name`,
        );
      }
      if (record.crop_type !== expected.crop_type) {
        coverageIssues.push(
          `record ${index}: crop_type for ${record.crop_id} must be ${expected.crop_type}`,
        );
      }
    }

    const pair = `${record.crop_id}\u0000${record.region}`;
    if (seenPairs.has(pair)) {
      coverageIssues.push(`duplicate crop-region record: ${record.crop_id} + ${record.region}`);
    }
    seenPairs.add(pair);

    const expectedVerificationStatus = VERIFIED_CROP_REGION_PAIRS.has(pair)
      ? 'verified'
      : 'needs_verification';
    if (record.verification_status !== expectedVerificationStatus) {
      coverageIssues.push(
        `record ${index}: verification_status for ${record.crop_id} + ${record.region} must be ${expectedVerificationStatus}`,
      );
    }

    const { crop_id: model_key, ...values } = record;
    return {
      model_key,
      ...values,
      data_quality_note:
        model_key === 'crop_suitability_longan' && values.data_quality_note === null
          ? LONGAN_BURMESE_NAME_DATA_QUALITY_NOTE
          : values.data_quality_note,
    };
  });

  for (const crop of CROP_CALENDAR_CROPS) {
    for (const region of CROP_CALENDAR_REGIONS) {
      const pair = `${crop.model_key}\u0000${region}`;
      if (!seenPairs.has(pair)) {
        coverageIssues.push(`missing crop-region record: ${crop.model_key} + ${region}`);
      }
    }
  }
  const verification_statuses = Object.fromEntries(
    CROP_CALENDAR_VERIFICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<CropCalendarVerificationStatus, number>;
  for (const record of records) verification_statuses[record.verification_status] += 1;

  const annual_records = records.filter((record) => record.crop_type === 'annual').length;
  const perennial_records = records.filter((record) => record.crop_type === 'perennial').length;
  const annual_rows_with_planting = records.filter(
    (record) =>
      record.crop_type === 'annual' &&
      (record.planting_start_month !== null || record.planting_end_month !== null),
  ).length;
  const annual_rows_with_harvest = records.filter(
    (record) =>
      record.crop_type === 'annual' &&
      (record.harvest_start_month !== null || record.harvest_end_month !== null),
  ).length;
  const perennial_rows_with_establishment = records.filter(
    (record) =>
      record.crop_type === 'perennial' &&
      (record.establishment_start_month !== null ||
        record.establishment_end_month !== null),
  ).length;
  const perennial_rows_with_harvest_season = records.filter(
    (record) =>
      record.crop_type === 'perennial' &&
      (record.harvest_season_start_month !== null ||
        record.harvest_season_end_month !== null),
  ).length;

  const actualBaseline = {
    verified_records: verification_statuses.verified,
    needs_verification_records: verification_statuses.needs_verification,
    annual_records,
    perennial_records,
    annual_rows_with_planting,
    annual_rows_with_harvest,
    perennial_rows_with_establishment,
    perennial_rows_with_harvest_season,
  };
  for (const [field, expected] of Object.entries(CROP_CALENDAR_RESEARCH_BASELINE)) {
    const actual = actualBaseline[field as keyof typeof actualBaseline];
    if (actual !== expected) {
      coverageIssues.push(
        `research baseline ${field} must be ${expected}, received ${actual}`,
      );
    }
  }
  for (const status of [
    'insufficient_evidence',
    'not_applicable',
    'not_recommended',
  ] as const) {
    if (verification_statuses[status] !== 0) {
      coverageIssues.push(
        `research baseline verification_status ${status} must have 0 records`,
      );
    }
  }

  if (coverageIssues.length > 0) {
    throw new CropCalendarDatasetValidationError(coverageIssues);
  }

  return {
    records,
    summary: {
      total_records: records.length,
      crop_count: CROP_CALENDAR_MODEL_KEYS.length,
      region_count: CROP_CALENDAR_REGIONS.length,
      verification_statuses,
      annual_records,
      perennial_records,
      annual_rows_with_planting,
      annual_rows_with_harvest,
      perennial_rows_with_establishment,
      perennial_rows_with_harvest_season,
    },
  };
}

const VERIFIED_CROP_REGION_PAIRS = new Set<string>([
  ...CROP_CALENDAR_REGIONS.map(
    (region) => `crop_suitability_black_gram\u0000${region}`,
  ),
  'crop_suitability_sugarcane\u0000Mandalay',
  'crop_suitability_chili\u0000Mandalay',
  'crop_suitability_green_gram\u0000Ayeyarwady',
  'crop_suitability_green_gram\u0000Bago',
  'crop_suitability_green_gram\u0000Yangon',
  'crop_suitability_pigeon_pea\u0000Mandalay',
  'crop_suitability_pigeon_pea\u0000Sagaing',
  'crop_suitability_pigeon_pea\u0000Magway',
  'crop_suitability_sesame\u0000Sagaing',
  'crop_suitability_durian\u0000Bago',
  ...CROP_CALENDAR_REGIONS.map((region) => `crop_suitability_mango\u0000${region}`),
]);

function nullableTrimmedText(maximumLength: number, allowLineBreaks: boolean) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .refine(
      (value) =>
        ![...value].some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          if (codePoint === 127) return true;
          if (codePoint >= 32) return false;
          return !allowLineBreaks || ![9, 10, 13].includes(codePoint);
        }),
      'Control characters are not allowed',
    )
    .nullable();
}

function isRealIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      ![...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 32 || codePoint === 127;
      })
    );
  } catch {
    return false;
  }
}

function validateOrderedRange(
  minimum: number | null,
  maximum: number | null,
  field: string,
  context: z.RefinementCtx,
): void {
  if (minimum !== null && maximum !== null && minimum > maximum) {
    context.addIssue({
      code: 'custom',
      path: [`${field}_min`],
      message: `${field} minimum cannot exceed its maximum`,
    });
  }
}

export type { CropCalendarModelKey, CropCalendarRegion };
export { CROP_CALENDAR_MODEL_KEYS, CROP_CALENDAR_REGIONS };
