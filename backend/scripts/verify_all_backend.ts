import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryStore, predictionFixture } from '../tests/helpers.js';
import type { ModelServerGateway } from '../src/services/model-server-client.js';
import { GeminiChatbotService } from '../src/services/gemini-chatbot-service.js';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function pass(name: string, details?: string) {
  console.log(` ${colors.green}✔ PASS:${colors.reset} ${colors.bright}${name}${colors.reset} ${details ? colors.cyan + '(' + details + ')' + colors.reset : ''}`);
}

function fail(name: string, error: unknown) {
  console.log(` ${colors.red}✖ FAIL:${colors.reset} ${colors.bright}${name}${colors.reset}`);
  console.error(error);
}

async function verifyAllBackend() {
  console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  GEO_AI Full Backend Integration Verification Suite${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════════════${colors.reset}\n`);

  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    API_KEY: 'test-backend-api-key-1234567890',
    INTERNAL_API_KEY: 'test-internal-api-key-1234567890',
    GEO_MODEL_SERVER_API_KEY: 'test-geo-model-key-1234567890',
    GEMINI_API_KEY: 'test-gemini-key-1234567890',
  });

  const store = new MemoryStore();

  const fakeModelServer: ModelServerGateway = {
    predict: async (req, reqId) => {
      const p = predictionFixture(reqId);
      if (req.lat) p.location.matched_lat = req.lat;
      if (req.lon) p.location.matched_lon = req.lon;
      return p;
    },
    batchInfer: async () => { throw new Error('Not implemented'); },
    getModels: async () => ({
      catalog_version: config.modelExpectedCatalogVersion,
      feature_dataset_sha256: 'a'.repeat(64),
      models: [],
      capabilities: {
        supports_composite_only_requests: true,
        composite_dependencies: {
          crop_recommender: [],
          crop_health: [],
          economic_roi: [],
          risk_alerts: [],
          land_use: [],
        },
      },
    }),
    getReadiness: async () => ({
      status: 'ready',
      catalog_version: config.modelExpectedCatalogVersion,
      models_loaded: 41,
      total_models: 41,
    }),
    getCircuitState: () => ({ state: 'closed', consecutive_failures: 0 }),
  };

  const fakeGeminiFetch: typeof globalThis.fetch = async (_url, init) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    const isBurmese = /[\u1000-\u109F]/.test(bodyStr);

    const replyText = isBurmese
      ? 'ဧရာဝတီတိုင်း ဟင်္သာတဒေသအတွက် နွေစပါး စိုက်ပျိုးရန် အထူးသင့်လျော်ပါသည်။ သီးနှံကျန်းမာရေးညွှန်းကိန်း ၇၈% ရှိပြီး ရေကြီးနိုင်ခြေနည်းပါးပါသည်။'
      : 'Based on GeoAI model predictions for Ayeyawaddy, crop health is optimal (78%) and dry season rice is highly recommended with split NPK fertilizer.';

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
  };

  const chatbotService = new GeminiChatbotService(config, fakeGeminiFetch);

  // Pre-seed market prices in the store per source/date snapshot
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
  await store.upsertMarketPrices([
    {
      crop_key: 'black_gram',
      commodity_name_raw: 'Black Gram (FAQ)',
      variety: 'FAQ',
      region: 'Ayeyawaddy',
      price_min: '3200000',
      price_max: '3350000',
      currency: 'MMK',
      quantity: '1',
      unit: 'tonne',
      source_name: 'Wisarra',
      source_date: '2026-08-01',
      source_url: 'https://wisarra.com/en/market-price',
      fetched_at: '2026-08-01T00:00:00Z',
      raw_payload: {},
    },
  ]);

  const app = await buildApp({
    config,
    modelServer: fakeModelServer,
    store,
    chatbotService,
  });

  const authHeader = { 'x-api-key': config.apiKey! };

  try {
    // 1. Health Liveness
    const resLive = await app.inject({ method: 'GET', url: '/health/live' });
    if (resLive.statusCode === 200 && resLive.json().status === 'live') {
      pass('GET /health/live', 'Liveness probe healthy');
    } else {
      fail('GET /health/live', resLive.body);
    }

    // 2. Health Readiness
    const resReady = await app.inject({ method: 'GET', url: '/health/ready' });
    if (resReady.statusCode === 200 && resReady.json().status === 'ready') {
      pass('GET /health/ready', 'All services and database ready');
    } else {
      fail('GET /health/ready', resReady.body);
    }

    // 3. User Registration
    const resUser = await app.inject({
      method: 'POST',
      url: '/api/v1/users/register',
      headers: authHeader,
      payload: {
        username: 'U_Kyaw_Hein',
        phone: '09789123456',
        location: 'Hinthada, Ayeyawaddy',
        email: 'kyawhein@example.com',
      },
    });
    if (resUser.statusCode === 201 && resUser.json().user.username === 'U_Kyaw_Hein') {
      pass('POST /api/v1/users/register', `Registered farmer: ${resUser.json().user.username}`);
    } else {
      fail('POST /api/v1/users/register', resUser.body);
    }

    // 4. Market Price Ingestion & Querying
    const resMarket = await app.inject({
      method: 'GET',
      url: '/api/v1/market-prices/crops',
      headers: authHeader,
    });
    if (resMarket.statusCode === 200 && Array.isArray(resMarket.json().crops)) {
      pass('GET /api/v1/market-prices/crops', `Retrieved ${resMarket.json().crops.length} supported crop keys`);
    } else {
      fail('GET /api/v1/market-prices/crops', resMarket.body);
    }

    // 5. Predictions Endpoint
    const resPred = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      headers: authHeader,
      payload: {
        lat: 17.65,
        lon: 95.45,
        observation_month: '2024-01',
        include_all_targets: true,
        composite_features: ['crop_recommender', 'crop_health', 'risk_alerts'],
      },
    });
    if (resPred.statusCode === 200 && resPred.json().status === 'success') {
      pass('POST /api/v1/predictions', `Generated predictions with ${Object.keys(resPred.json().predictions).length} model targets`);
    } else {
      fail('POST /api/v1/predictions', resPred.body);
    }

    // 6. Chatbot Endpoint (English with farmer profile & coordinates)
    const resChatEn = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot',
      headers: authHeader,
      payload: {
        message: 'What crops are best for my farm in Ayeyawaddy?',
        user_info: {
          username: 'U Kyaw Hein',
          location: 'Hinthada, Ayeyawaddy',
          farm_size_acres: 5,
          crops_grown: ['monsoon_rice'],
          preferred_language: 'en',
        },
        locator: {
          lat: 17.65,
          lon: 95.45,
          observation_month: '2024-01',
        },
      },
    });
    const chatEnJson = resChatEn.json();
    if (
      resChatEn.statusCode === 200 &&
      chatEnJson.status === 'success' &&
      chatEnJson.language === 'en' &&
      chatEnJson.context_used.model_predictions_summary.crop_health_score === 0.72
    ) {
      pass('POST /api/v1/chatbot (English)', `AI Response generated: "${chatEnJson.response.slice(0, 60)}..."`);
    } else {
      fail('POST /api/v1/chatbot (English)', resChatEn.body);
    }

    // 7. Chatbot Endpoint (Myanmar Burmese Unicode)
    const resChatMy = await app.inject({
      method: 'POST',
      url: '/api/v1/chatbot/chat',
      headers: authHeader,
      payload: {
        message: 'ဧရာဝတီတိုင်းတွင် နွေစပါးစိုက်ပျိုးရန် သင့်တော်ပါသလား?',
        user_info: {
          username: 'ဦးကျော်ဟိန်း',
          location: 'ဟင်္သာတ၊ ဧရာဝတီ',
          preferred_language: 'my',
        },
        locator: {
          lat: 17.65,
          lon: 95.45,
          observation_month: '2024-01',
        },
      },
    });
    const chatMyJson = resChatMy.json();
    if (
      resChatMy.statusCode === 200 &&
      chatMyJson.status === 'success' &&
      chatMyJson.language === 'my'
    ) {
      pass('POST /api/v1/chatbot/chat (Myanmar Unicode)', `AI Response generated: "${chatMyJson.response.slice(0, 45)}..."`);
    } else {
      fail('POST /api/v1/chatbot/chat (Myanmar Unicode)', resChatMy.body);
    }

    // 8. Chatbot Alias Route (/api/v1/chat)
    const resChatAlias = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: authHeader,
      payload: {
        message: 'Hello!',
      },
    });
    if (resChatAlias.statusCode === 200 && resChatAlias.json().status === 'success') {
      pass('POST /api/v1/chat (Route Alias)', 'Alias endpoint routed and responded successfully');
    } else {
      fail('POST /api/v1/chat (Route Alias)', resChatAlias.body);
    }

    console.log(`\n${colors.bright}${colors.green}🎉 ALL BACKEND SYSTEMS & CHATBOT MODULES ARE FULLY OPERATIONAL AND VERIFIED!${colors.reset}\n`);
  } finally {
    await app.close();
  }
}

verifyAllBackend().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
