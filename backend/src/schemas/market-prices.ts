import { z } from 'zod';

import { CROP_KEYS } from '../contracts/weekly.js';

export const CropKeySchema = z.enum(CROP_KEYS);

export const MarketPriceQuerySchema = z
  .object({
    crop: CropKeySchema.optional(),
    region: z.string().trim().min(1).max(100).optional(),
    source: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const MarketHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const MarketCommodityQuerySchema = z
  .object({
    source: z.string().trim().min(1).max(200).default('Wisarra'),
    region: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();
