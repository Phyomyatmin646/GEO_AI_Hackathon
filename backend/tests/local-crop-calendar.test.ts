import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadLocalCropCalendarService } from '../src/services/local-crop-calendar-repository.js';
import { testConfig } from './helpers.js';

const datasetPath = fileURLToPath(
  new URL(
    '../data/crop-calendars/myanmar_crop_calendar_17x6_2026-08-10.csv',
    import.meta.url,
  ),
);

describe('local Crop Calendar CSV runtime', () => {
  it('validates and serves the complete project-owned dataset without a database store', async () => {
    const app = await buildApp({
      config: testConfig({ cropCalendarCsvPath: datasetPath }),
    });

    const crops = await app.inject({ method: 'GET', url: '/api/v1/crop-calendars/crops' });
    const region = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars?region=Ayeyarwady',
    });
    const crossYear = await app.inject({
      method: 'GET',
      url: '/api/v1/crop-calendars/crop_suitability_dry_season_rice?region=Ayeyarwady',
    });

    expect(crops.statusCode).toBe(200);
    expect(crops.json().crops).toHaveLength(17);
    expect(region.statusCode).toBe(200);
    expect(region.json().calendars).toHaveLength(17);
    expect(new Set(region.json().calendars.map((calendar: { dataset_version: string }) => calendar.dataset_version))).toEqual(
      new Set([
        'sha256:4d4eebe478eb540537a433c4628ee2ff253dd9a24e941ca1c412eea25316dd23',
      ]),
    );
    expect(crossYear.json()).toMatchObject({
      calendar: {
        season: 'dry-season',
        planting: { start_month: 12, end_month: 1, is_complete: true },
        harvest: { start_month: 3, end_month: 4, is_complete: true },
      },
    });
    await app.close();
  });

  it('loads all six regions from one validated in-memory snapshot', async () => {
    const service = await loadLocalCropCalendarService(datasetPath);
    for (const region of ['Ayeyarwady', 'Bago', 'Mandalay', 'Sagaing', 'Magway', 'Yangon'] as const) {
      await expect(service.byRegion(region)).resolves.toMatchObject({
        calendars: expect.arrayContaining([
          expect.objectContaining({ region, dataset_version: expect.stringMatching(/^sha256:/u) }),
        ]),
      });
      expect((await service.byRegion(region)).calendars).toHaveLength(17);
    }
  });
});
