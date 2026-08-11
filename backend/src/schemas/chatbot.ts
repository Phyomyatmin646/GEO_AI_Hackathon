import { z } from 'zod';

import { PredictionResponseSchema } from './prediction.js';

export const PreferredLanguageSchema = z.enum(['my', 'en', 'auto']);

export const ChatbotUserInfoSchema = z
  .object({
    username: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
    location: z.string().trim().min(2).max(200).optional(),
    email: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
    ),
    preferred_language: PreferredLanguageSchema.default('auto'),
    farm_size_acres: z.number().finite().positive().max(100_000).optional(),
    crops_grown: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    soil_type: z.string().trim().min(1).max(100).optional(),
    irrigation_access: z.boolean().optional(),
  })
  .strict();

export const ChatbotLocatorSchema = z
  .object({
    lat: z.number().finite().min(9).max(29).optional(),
    lon: z.number().finite().min(92).max(102).optional(),
    observation_month: z
      .string()
      .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'observation_month must use YYYY-MM')
      .optional(),
    sample_id: z.string().trim().min(1).max(160).optional(),
    region: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const ChatMessageSchema = z
  .object({
    role: z.enum(['user', 'model', 'assistant', 'system']),
    content: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const ChatbotRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, 'message cannot be empty')
      .max(4_000, 'message cannot exceed 4000 characters'),
    user_info: ChatbotUserInfoSchema.optional(),
    user_id: z.uuid().optional(),
    locator: ChatbotLocatorSchema.optional(),
    prediction: PredictionResponseSchema.optional(),
    history: z.array(ChatMessageSchema).max(30).default([]),
    include_market_prices: z.boolean().default(true),
    include_model_predictions: z.boolean().default(true),
  })
  .strict();

export const ChatbotResponseSchema = z
  .object({
    api_version: z.literal('v1'),
    request_id: z.string().min(1).max(128),
    status: z.literal('success'),
    response: z.string().min(1),
    language: z.string().min(2).max(10),
    context_used: z
      .object({
        user: z
          .object({
            username: z.string().optional(),
            location: z.string().optional(),
            phone: z.string().optional(),
            farm_size_acres: z.number().optional(),
            crops_grown: z.array(z.string()).optional(),
            soil_type: z.string().optional(),
            irrigation_access: z.boolean().optional(),
          })
          .nullable(),
        location_matched: z
          .object({
            sample_id: z.string().optional(),
            grid_id: z.string().optional(),
            region: z.string().optional(),
            observation_month: z.string().optional(),
            matched_lat: z.number().optional(),
            matched_lon: z.number().optional(),
            distance_km: z.number().optional(),
          })
          .nullable(),
        model_predictions_summary: z
          .object({
            crop_health_score: z.number().nullable().optional(),
            crop_yield_t_ha: z.number().nullable().optional(),
            irrigation_need: z.union([z.number(), z.string()]).nullable().optional(),
            precipitation_mm: z.number().nullable().optional(),
            temperature_c: z.number().nullable().optional(),
            flood_risk: z.union([z.number(), z.string()]).nullable().optional(),
            drought_risk: z.number().nullable().optional(),
            heat_stress_risk: z.union([z.number(), z.string()]).nullable().optional(),
            water_scarcity_risk: z.union([z.number(), z.string()]).nullable().optional(),
            top_suitable_crops: z
              .array(
                z.object({
                  crop: z.string(),
                  suitability: z.string(),
                }),
              )
              .optional(),
            total_targets_loaded: z.number().int().nonnegative(),
          })
          .nullable(),
        market_prices_summary: z
          .array(
            z.object({
              commodity: z.string(),
              variety: z.string().nullable().optional(),
              region: z.string().nullable().optional(),
              price_min: z.union([z.string(), z.number()]).nullable(),
              price_max: z.union([z.string(), z.number()]).nullable(),
              unit: z.string(),
              currency: z.string(),
              source: z.string(),
            }),
          )
          .nullable(),
        knowledge_sources: z
          .array(
            z.object({
              title: z.string(),
              reference: z.string().optional(),
            }),
          )
          .default([]),
      })
      .strict(),
    metadata: z
      .object({
        model: z.string(),
        response_time_ms: z.number().finite().nonnegative(),
        grounding_enabled: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ChatbotUserInfo = z.infer<typeof ChatbotUserInfoSchema>;
export type ChatbotLocator = z.infer<typeof ChatbotLocatorSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatbotRequest = z.infer<typeof ChatbotRequestSchema>;
export type ChatbotResponse = z.infer<typeof ChatbotResponseSchema>;
