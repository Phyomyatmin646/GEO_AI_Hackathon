import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { GeminiChatbotService } from '../src/services/gemini-chatbot-service.js';
import type { ModelServerGateway } from '../src/services/model-server-client.js';
import {
  MemoryStore,
  predictionFixture,
  testConfig,
} from './helpers.js';

function fakeModelServer(overrides: Partial<ModelServerGateway> = {}): ModelServerGateway {
  return {
    predict: vi.fn(async (_request, requestId) => predictionFixture(requestId)),
    batchInfer: vi.fn(async () => {
      throw new Error('Not implemented');
    }),
    getModels: vi.fn(async () => {
      throw new Error('Not implemented');
    }),
    getReadiness: vi.fn(async () => {
      throw new Error('Not implemented');
    }),
    getCircuitState: vi.fn(() => ({ state: 'closed' as const, consecutive_failures: 0 })),
    ...overrides,
  };
}

function fakeGeminiFetch(replyText: string, status = 200) {
  return vi.fn(async () => {
    if (status !== 200) {
      return {
        ok: false,
        status,
        json: async () => ({ error: { message: 'Gemini error' } }),
        text: async () => 'Gemini error',
      } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: replyText }],
            },
            finishReason: 'STOP',
          },
        ],
      }),
    } as unknown as Response;
  });
}

describe('Chatbot endpoint /api/v1/chatbot', () => {
  it('rejects an empty request body or missing message', async () => {
    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('rejects invalid coordinates in locator', async () => {
    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'How is my soil health?',
        locator: {
          lat: 99.0, // Invalid lat for Myanmar (must be 9..29)
          lon: 95.0,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('generates a successful advice response for a farmer query in English', async () => {
    const mockReply = 'For Ayeyawaddy in January, we recommend preparing seed beds for dry season rice with balanced NPK.';
    const fakeFetch = fakeGeminiFetch(mockReply);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);

    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'What crops should I plant this season in Ayeyawaddy?',
        user_info: {
          username: 'U Kyaw',
          location: 'Hinthada, Ayeyawaddy',
          farm_size_acres: 5,
          crops_grown: ['monsoon_rice'],
          soil_type: 'clay loam',
          irrigation_access: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.status).toBe('success');
    expect(json.response).toBe(mockReply);
    expect(json.language).toBe('en');
    expect(json.context_used.user.username).toBe('U Kyaw');
    expect(json.context_used.user.location).toBe('Hinthada, Ayeyawaddy');
    expect(json.context_used.user.farm_size_acres).toBe(5);
    expect(json.metadata.model).toBe('gemini-2.5-flash');
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('detects Myanmar Unicode language and answers in Burmese context', async () => {
    const mockReply = 'ဧရာဝတီတိုင်းအတွက် နွေစပါး စိုက်ပျိုးရန် အထူးသင့်လျော်ပါသည်။ မြေဆီလွှာ ကျန်းမာရေးကောင်းမွန်ပါသည်။';
    const fakeFetch = fakeGeminiFetch(mockReply);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);

    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot/chat',
      payload: {
        message: 'ယခုလတွင် မည်သည့်သီးနှံစိုက်ပျိုးသင့်ပါသလဲ?',
        user_info: {
          username: 'ဦးအောင်',
          location: 'မအူပင်၊ ဧရာဝတီ',
          preferred_language: 'my',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.status).toBe('success');
    expect(json.response).toBe(mockReply);
    expect(json.language).toBe('my');
    expect(json.context_used.user.username).toBe('ဦးအောင်');

    await app.close();
  });

  it('automatically fetches 40+ GeoAI model prediction targets when locator is provided', async () => {
    const mockReply = 'Based on your GeoAI prediction, crop health score is 72% with low flood risk.';
    const fakeFetch = fakeGeminiFetch(mockReply);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);
    const modelServer = fakeModelServer();

    const app = await buildApp({
      config: testConfig(),
      modelServer,
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'Tell me about the risks for my farm.',
        locator: {
          lat: 16.8,
          lon: 95.2,
          observation_month: '2024-01',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(modelServer.predict).toHaveBeenCalledTimes(1);

    const json = response.json();
    expect(json.status).toBe('success');
    expect(json.context_used.location_matched).toMatchObject({
      region: 'Ayeyawaddy',
      sample_id: 'sample-001',
    });
    expect(json.context_used.model_predictions_summary).toMatchObject({
      crop_health_score: 0.72,
    });

    await app.close();
  });

  it('integrates market prices from the store into context', async () => {
    const mockReply = 'Paddy prices are currently 1,800,000 MMK per 100 baskets in Ayeyawaddy.';
    const fakeFetch = fakeGeminiFetch(mockReply);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);
    const store = new MemoryStore();

    await store.upsertMarketPrices([
      {
        crop_key: 'monsoon_rice',
        commodity_name_raw: 'Emata Rice (Rough Paddy)',
        variety: 'Emata',
        region: 'Ayeyawaddy',
        price_min: '1800000',
        price_max: '1900000',
        currency: 'MMK',
        quantity: '100',
        unit: 'basket',
        source_name: 'DOA MIS',
        source_date: '2026-08-01',
        source_url: 'https://example.test/doa',
        fetched_at: '2026-08-01T00:00:00Z',
        raw_payload: {},
      },
    ]);

    const app = await buildApp({
      config: testConfig(),
      store,
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'What is the current market price for rice?',
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.status).toBe('success');
    expect(json.context_used.market_prices_summary).toHaveLength(1);
    expect(json.context_used.market_prices_summary[0].commodity).toBe('Emata Rice (Rough Paddy)');
    expect(json.context_used.market_prices_summary[0].price_min).toBe('1800000');

    await app.close();
  });

  it('handles missing Gemini API key with a 503 error', async () => {
    const chatbotService = new GeminiChatbotService(
      testConfig({ geminiApiKey: undefined }),
    );

    const app = await buildApp({
      config: testConfig({ geminiApiKey: undefined }),
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'Hello, what should I plant?',
      },
    });

    expect(response.statusCode).toBe(503);
    const json = response.json();
    expect(json.error.code).toBe('CHATBOT_API_KEY_NOT_CONFIGURED');

    await app.close();
  });

  it('handles upstream AI service errors with 502', async () => {
    const fakeFetch = fakeGeminiFetch('', 500);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);

    const app = await buildApp({
      config: testConfig(),
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'Hello!',
      },
    });

    expect(response.statusCode).toBe(502);
    const json = response.json();
    expect(json.error.code).toBe('UPSTREAM_AI_UNAVAILABLE');

    await app.close();
  });

  it('handles rate limiting from Gemini with 429', async () => {
    const fakeFetch = fakeGeminiFetch('', 429);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);

    const app = await buildApp({
      config: testConfig(),
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      payload: {
        message: 'Hello!',
      },
    });

    expect(response.statusCode).toBe(429);
    const json = response.json();
    expect(json.error.code).toBe('AI_RATE_LIMITED');

    await app.close();
  });

  it('works on the /api/v1/chat alias route', async () => {
    const mockReply = 'Welcome to the chat alias endpoint!';
    const fakeFetch = fakeGeminiFetch(mockReply);
    const chatbotService = new GeminiChatbotService(testConfig(), fakeFetch);

    const app = await buildApp({
      config: testConfig(),
      chatbotService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        message: 'Testing alias',
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.status).toBe('success');
    expect(json.response).toBe(mockReply);

    await app.close();
  });
});
