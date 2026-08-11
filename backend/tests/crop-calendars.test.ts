import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { postgresDateText, type CropCalendar } from '../src/db/store.js';
import { formatCropCalendar } from '../src/services/crop-calendar-service.js';
import { MemoryStore, testConfig } from './helpers.js';

const MONTH_LABELS = [
  ['January', 'ဇန်နဝါရီ'],
  ['February', 'ဖေဖော်ဝါရီ'],
  ['March', 'မတ်'],
  ['April', 'ဧပြီ'],
  ['May', 'မေ'],
  ['June', 'ဇွန်'],
  ['July', 'ဇူလိုင်'],
  ['August', 'ဩဂုတ်'],
  ['September', 'စက်တင်ဘာ'],
  ['October', 'အောက်တိုဘာ'],
  ['November', 'နိုဝင်ဘာ'],
  ['December', 'ဒီဇင်ဘာ'],
] as const;

describe('Crop Calendar API', () => {
  it('lists database-backed crops and region calendars without reading a source file at runtime', async () => {
    const store = new MemoryStore();
    store.cropCalendars.push(
      cropCalendarFixture(),
      cropCalendarFixture({
        id: 'calendar-mango',
        model_key: 'crop_suitability_mango',
        crop_name_en: 'Mango',
        crop_name_mm: 'သရက်',
        crop_type: 'perennial',
        planting_start_month: null,
        planting_end_month: null,
        harvest_start_month: null,
        harvest_end_month: null,
        harvest_season_start_month: 4,
        harvest_season_end_month: 7,
      }),
    );
    const app = await buildApp({ config: testConfig(), store });

    const crops = await app.inject({ method: 'GET', url: '/api/v1/crop-calendars/crops' });
    expect(crops.statusCode).toBe(200);
    expect(crops.json()).toEqual({
      crops: [
        {
          model_key: 'crop_suitability_black_gram',
          crop_name_en: 'Black Gram',
          crop_name_mm: 'မတ်ပဲ',
          crop_type: 'annual',
        },
        {
          model_key: 'crop_suitability_mango',
          crop_name_en: 'Mango',
          crop_name_mm: 'သရက်',
          crop_type: 'perennial',
        },
      ],
    });

    const region = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars?region=ayeyawaddy',
    });
    expect(region.statusCode).toBe(200);
    expect(region.json().calendars).toHaveLength(2);
    expect(region.json().calendars[0].region).toBe('Ayeyarwady');
    await app.close();
  });

  it('returns a source-backed annual record with English and Burmese month labels', async () => {
    const store = new MemoryStore();
    store.cropCalendars.push(cropCalendarFixture());
    const app = await buildApp({ config: testConfig(), store });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crop_suitability_black_gram?region=Ayeyarwady',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      calendar: {
        model_key: 'crop_suitability_black_gram',
        crop_name_mm: 'မတ်ပဲ',
        region: 'Ayeyarwady',
        planting: {
          start_month: 10,
          end_month: 10,
          label_en: 'October',
          label_mm: 'အောက်တိုဘာ',
          is_complete: true,
        },
        harvest: {
          start_month: 3,
          end_month: 4,
          label_en: 'March – April',
          label_mm: 'မတ် – ဧပြီ',
        },
        establishment: null,
        verification: { status: 'verified', confidence: null },
        source: {
          code: 'S2',
          organization: 'IFPRI/CGIAR',
          url: 'https://example.test/black-gram',
        },
      },
    });
    await app.close();
  });

  it('preserves partial perennial evidence and fully missing needs-verification calendars', async () => {
    const store = new MemoryStore();
    store.cropCalendars.push(
      cropCalendarFixture({
        id: 'calendar-rubber',
        model_key: 'crop_suitability_rubber',
        crop_name_en: 'Rubber',
        crop_name_mm: 'ရော်ဘာ',
        crop_type: 'perennial',
        region: 'Bago',
        planting_start_month: null,
        planting_end_month: null,
        harvest_start_month: null,
        harvest_end_month: null,
        harvest_season_start_month: 9,
        harvest_season_end_month: null,
        verification_status: 'needs_verification',
      }),
      cropCalendarFixture({
        id: 'calendar-longan',
        model_key: 'crop_suitability_longan',
        crop_name_en: 'Longan',
        crop_name_mm: 'တညင်း',
        crop_type: 'perennial',
        region: 'Mandalay',
        planting_start_month: null,
        planting_end_month: null,
        harvest_start_month: null,
        harvest_end_month: null,
        harvest_season_start_month: null,
        harvest_season_end_month: null,
        source_code: null,
        source_name: null,
        source_title: null,
        source_url: null,
        publication_year: null,
        verification_status: 'needs_verification',
        data_quality_note: 'Burmese display name requires authoritative review.',
      }),
    );
    const app = await buildApp({ config: testConfig(), store });

    const rubber = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crop_suitability_rubber?region=Bago',
    });
    expect(rubber.statusCode).toBe(200);
    expect(rubber.json().calendar).toMatchObject({
      planting: null,
      harvest: null,
      harvest_season: {
        start_month: 9,
        end_month: null,
        start_label_en: 'September',
        label_en: null,
        is_complete: false,
      },
      verification: { status: 'needs_verification' },
    });

    const longan = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crop_suitability_longan?region=Mandalay',
    });
    expect(longan.statusCode).toBe(200);
    expect(longan.json().calendar).toMatchObject({
      crop_name_mm: 'တညင်း',
      establishment: null,
      first_harvest: null,
      harvest_season: null,
      source: null,
      notes: { data_quality: 'Burmese display name requires authoritative review.' },
    });
    await app.close();
  });

  it('validates model keys, regions, filters, missing rows, authentication, and missing DB safely', async () => {
    const apiKey = 'calendar-public-key-123456';
    const store = new MemoryStore();
    const app = await buildApp({ config: testConfig({ apiKey }), store });

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crops',
    });
    expect(unauthorized.statusCode).toBe(401);

    for (const url of [
      '/api/v1/crop-calendars/not_a_model?region=Bago',
      '/api/v1/crop-calendars/crop_suitability_black_gram?region=Shan',
      '/api/v1/crop-calendars/crop_suitability_black_gram?region=Bago&unknown=true',
    ]) {
      const invalid = await app.inject({
        method: 'GET',
        url,
        headers: { 'x-api-key': apiKey },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crop_suitability_black_gram?region=Bago',
      headers: { 'x-api-key': apiKey },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'CROP_CALENDAR_NOT_FOUND' } });
    await app.close();

    const withoutStore = await buildApp({ config: testConfig() });
    const unavailable = await withoutStore.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crops',
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      error: { code: 'CROP_CALENDAR_DATABASE_UNAVAILABLE' },
    });
    await withoutStore.close();
  });

  it('sanitizes database failures', async () => {
    const store = new MemoryStore();
    store.getCropCalendar = async () => {
      throw new Error('postgresql://secret@database.example/private');
    };
    const app = await buildApp({ config: testConfig(), store });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crop_suitability_black_gram?region=Bago',
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_SERVER_ERROR' } });
    expect(response.body).not.toContain('secret');
    await app.close();
  });

  it('formats all twelve English and Burmese month labels without inferring missing bounds', () => {
    for (const [index, [english, burmese]] of MONTH_LABELS.entries()) {
      const month = index + 1;
      const formatted = formatCropCalendar(
        cropCalendarFixture({
          planting_start_month: month,
          planting_end_month: month,
        }),
      );
      expect(formatted.planting).toMatchObject({ label_en: english, label_mm: burmese });
    }
  });

  it('preserves publication-year-only provenance instead of dropping it', () => {
    const formatted = formatCropCalendar(
      cropCalendarFixture({
        source_code: null,
        source_name: null,
        source_title: null,
        source_url: null,
        publication_year: 2024,
      }),
    );

    expect(formatted.source).toEqual({
      code: null,
      organization: null,
      title: null,
      url: null,
      publication_year: 2024,
    });
  });

  it('preserves PostgreSQL DATE values in positive UTC-offset timezones', () => {
    const localMidnight = new Date(2026, 7, 10, 0, 0, 0, 0);
    expect(postgresDateText(localMidnight)).toBe('2026-08-10');
  });
});

function cropCalendarFixture(overrides: Partial<CropCalendar> = {}): CropCalendar {
  return {
    id: 'calendar-black-gram',
    model_key: 'crop_suitability_black_gram',
    crop_name_en: 'Black Gram',
    crop_name_mm: 'မတ်ပဲ',
    crop_type: 'annual',
    region: 'Ayeyarwady',
    township: null,
    season: 'winter/post-monsoon',
    planting_start_month: 10,
    planting_end_month: 10,
    harvest_start_month: 3,
    harvest_end_month: 4,
    growing_duration_min_days: null,
    growing_duration_max_days: null,
    establishment_start_month: null,
    establishment_end_month: null,
    years_to_first_harvest_min: null,
    years_to_first_harvest_max: null,
    harvest_season_start_month: null,
    harvest_season_end_month: null,
    notes_en: 'Source-backed regional record.',
    notes_mm: 'အရင်းအမြစ်အထောက်အထားရှိသော ဒေသဆိုင်ရာမှတ်တမ်း။',
    source_code: 'S2',
    source_name: 'IFPRI/CGIAR',
    source_title: 'Myanmar pulse calendar',
    source_url: 'https://example.test/black-gram',
    publication_year: 2023,
    evidence_type: 'research_report',
    geographic_specificity: 'national_with_regional_relevance',
    verification_status: 'verified',
    confidence: null,
    last_verified_date: null,
    last_updated: '2026-08-10',
    dataset_version: '2026-08-10',
    data_quality_note: null,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    ...overrides,
  };
}
