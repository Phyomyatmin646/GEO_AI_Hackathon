import { z } from 'zod';

import {
  MODEL_INPUT_SCHEMA_SHA256,
  WEEKLY_REGIONS,
} from '../contracts/weekly.js';

export const DateOnlySchema = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine((value) => parseDateOnly(value) !== undefined, 'date is not valid');

export const WeekStartSchema = DateOnlySchema.refine(
  (value) => parseDateOnly(value)?.getUTCDay() === 1,
  'week_start must be a Monday in Asia/Yangon',
);

export const WeeklyRegionSchema = z.enum(WEEKLY_REGIONS);

const SourceDateListSchema = z
  .array(DateOnlySchema)
  .max(366)
  .refine((dates) => new Set(dates).size === dates.length, 'source dates must be unique')
  .refine(
    (dates) => dates.every((date, index) => index === 0 || dates[index - 1]! < date),
    'source dates must be sorted',
  );

export const CoverageMetadataSchema = z
  .object({
    week_start: WeekStartSchema,
    week_end: DateOnlySchema,
    observation_days: z.number().int().min(0).max(7),
    expected_days: z.literal(7),
    coverage_ratio: z.number().finite().min(0).max(1),
    is_partial_week: z.boolean(),
    source_coverage: z.record(z.string().min(1), z.number().finite().min(0).max(1)),
    source_observation_dates: z.record(z.string().min(1), SourceDateListSchema),
    source_dates_used: z.record(z.string().min(1), SourceDateListSchema),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (coverage.week_end !== addDays(coverage.week_start, 7)) {
      context.addIssue({
        code: 'custom',
        path: ['week_end'],
        message: 'coverage week_end must be the next Monday (exclusive)',
      });
    }
    const expectedRatio = coverage.observation_days / coverage.expected_days;
    if (Math.abs(coverage.coverage_ratio - expectedRatio) > 0.001) {
      context.addIssue({
        code: 'custom',
        path: ['coverage_ratio'],
        message: 'coverage_ratio must equal observation_days / expected_days',
      });
    }
    if (coverage.is_partial_week !== (coverage.observation_days < coverage.expected_days)) {
      context.addIssue({
        code: 'custom',
        path: ['is_partial_week'],
        message: 'is_partial_week is inconsistent with observation_days',
      });
    }

    const coverageSources = Object.keys(coverage.source_coverage).sort();
    const observationSources = Object.keys(coverage.source_observation_dates).sort();
    if (
      coverageSources.length !== observationSources.length ||
      coverageSources.some((source, index) => source !== observationSources[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['source_coverage'],
        message: 'source coverage keys must match source observation-date keys',
      });
    }
    for (const [source, dates] of Object.entries(coverage.source_observation_dates)) {
      const expectedSourceCoverage = Math.min(dates.length, 7) / 7;
      if (Math.abs((coverage.source_coverage[source] ?? -1) - expectedSourceCoverage) > 0.001) {
        context.addIssue({
          code: 'custom',
          path: ['source_coverage', source],
          message: 'source coverage must match its unique observation dates',
        });
      }
      for (const date of dates) {
        if (date < coverage.week_start || date >= coverage.week_end) {
          context.addIssue({
            code: 'custom',
            path: ['source_observation_dates', source],
            message: 'source observation dates must fall inside the weekly interval',
          });
          break;
        }
      }
    }

    const chirpsDates = coverage.source_observation_dates.chirps;
    const era5Dates = coverage.source_observation_dates.era5;
    if (!chirpsDates || !era5Dates) {
      context.addIssue({
        code: 'custom',
        path: ['source_observation_dates'],
        message: 'chirps and era5 observation dates are required',
      });
    } else {
      const era5 = new Set(era5Dates);
      const jointDailyCoverage = chirpsDates.filter((date) => era5.has(date)).length;
      if (coverage.observation_days !== jointDailyCoverage) {
        context.addIssue({
          code: 'custom',
          path: ['observation_days'],
          message: 'observation_days must equal the CHIRPS/ERA5 date intersection',
        });
      }
    }
  });

export const WeeklyIngestRequestSchema = z
  .object({
    week_start: WeekStartSchema,
    week_end: DateOnlySchema,
    schema_checksum: z.literal(MODEL_INPUT_SCHEMA_SHA256),
    regions: z
      .array(
        z
          .object({
            region: WeeklyRegionSchema,
            row_count: z.number().int().nonnegative(),
            source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
            coverage_metadata: CoverageMetadataSchema,
          })
          .strict(),
      )
      .length(WEEKLY_REGIONS.length),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.week_end !== addDays(request.week_start, 7)) {
      context.addIssue({
        code: 'custom',
        path: ['week_end'],
        message: 'week_end must be the next Monday (exclusive)',
      });
    }
    if (new Set(request.regions.map((region) => region.region)).size !== request.regions.length) {
      context.addIssue({ code: 'custom', path: ['regions'], message: 'regions must be unique' });
    }
    for (const [index, manifest] of request.regions.entries()) {
      if (
        manifest.coverage_metadata.week_start !== request.week_start ||
        manifest.coverage_metadata.week_end !== request.week_end
      ) {
        context.addIssue({
          code: 'custom',
          path: ['regions', index, 'coverage_metadata'],
          message: 'regional coverage interval must match the weekly ingest interval',
        });
      }
    }
    const submittedRegions = new Set(request.regions.map((region) => region.region));
    if (WEEKLY_REGIONS.some((region) => !submittedRegions.has(region))) {
      context.addIssue({
        code: 'custom',
        path: ['regions'],
        message: 'weekly ingest must include the complete six-region manifest',
      });
    }
  });

export const PipelineRunsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  if (!date) throw new Error('Invalid date-only value.');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date | undefined {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}

export type WeeklyIngestRequest = z.infer<typeof WeeklyIngestRequestSchema>;
export type CoverageMetadata = z.infer<typeof CoverageMetadataSchema>;
