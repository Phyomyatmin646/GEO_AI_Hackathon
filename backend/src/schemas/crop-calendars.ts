import { z } from 'zod';

export const CROP_CALENDAR_MODEL_KEYS = [
  'crop_suitability_monsoon_rice',
  'crop_suitability_dry_season_rice',
  'crop_suitability_black_gram',
  'crop_suitability_groundnut',
  'crop_suitability_maize',
  'crop_suitability_sugarcane',
  'crop_suitability_cassava',
  'crop_suitability_chili',
  'crop_suitability_tomato',
  'crop_suitability_green_gram',
  'crop_suitability_pigeon_pea',
  'crop_suitability_sesame',
  'crop_suitability_rubber',
  'crop_suitability_durian',
  'crop_suitability_mangosteen',
  'crop_suitability_longan',
  'crop_suitability_mango',
] as const;

export type CropCalendarModelKey = (typeof CROP_CALENDAR_MODEL_KEYS)[number];

export const CROP_CALENDAR_REGIONS = [
  'Ayeyarwady',
  'Bago',
  'Mandalay',
  'Sagaing',
  'Magway',
  'Yangon',
] as const;

export type CropCalendarRegion = (typeof CROP_CALENDAR_REGIONS)[number];

export const CropCalendarModelKeySchema = z.enum(
  CROP_CALENDAR_MODEL_KEYS,
);

const REGION_ALIASES = new Map<string, CropCalendarRegion>([
  ['ayeyarwady', 'Ayeyarwady'],
  ['ayeyawaddy', 'Ayeyarwady'],
  ['bago', 'Bago'],
  ['mandalay', 'Mandalay'],
  ['sagaing', 'Sagaing'],
  ['magway', 'Magway'],
  ['yangon', 'Yangon'],
]);

export const CropCalendarRegionSchema = z
  .string()
  .trim()
  .transform((value) => REGION_ALIASES.get(value.toLocaleLowerCase('en')) ?? value)
  .pipe(z.enum(CROP_CALENDAR_REGIONS));

const OptionalScopeText = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(hasNoControlCharacters, 'Control characters are not allowed')
  .optional();

function hasNoControlCharacters(value: string): boolean {
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

export const CropCalendarLookupParamsSchema = z
  .object({ modelKey: CropCalendarModelKeySchema })
  .strict();

export const CropCalendarLookupQuerySchema = z
  .object({
    region: CropCalendarRegionSchema,
    season: OptionalScopeText,
  })
  .strict();

export const CropCalendarRegionQuerySchema = z
  .object({ region: CropCalendarRegionSchema })
  .strict();
