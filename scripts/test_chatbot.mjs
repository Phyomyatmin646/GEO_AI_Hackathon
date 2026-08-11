#!/usr/bin/env node

/**
 * Myanmar Agricultural GeoAI Chatbot Test Script
 *
 * Runs end-to-end test scenarios against the Chatbot backend endpoint:
 *   - Case 1: English farmer query with profile & coordinates
 *   - Case 2: Myanmar Unicode query with flood & weather risk inquiry
 *   - Case 3: Complete 40+ GeoAI model prediction context & composite features
 *   - Case 4: Market prices & economic commodity advice
 *
 * Usage:
 *   node scripts/test_chatbot.mjs
 *   BACKEND_URL=http://localhost:8000 node scripts/test_chatbot.mjs --case 1
 */

const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';
const apiKey = process.env.API_KEY ?? 'dev-public-gateway-key-replace-before-production';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function logHeader(title) {
  console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════════════${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.yellow}▶ ${title}${colors.reset}`);
}

async function sendChatbotRequest(testName, payload) {
  logHeader(testName);

  console.log(`${colors.magenta}Target Endpoint:${colors.reset} ${backendUrl}/api/v1/chatbot`);
  console.log(`${colors.magenta}Prompt / Message:${colors.reset} "${payload.message}"`);
  if (payload.user_info) {
    console.log(`${colors.magenta}Farmer Profile:${colors.reset}`, JSON.stringify(payload.user_info, null, 2));
  }
  if (payload.locator) {
    console.log(`${colors.magenta}Location Locator:${colors.reset}`, JSON.stringify(payload.locator, null, 2));
  }

  const startTime = performance.now();

  try {
    const response = await fetch(`${backendUrl}/api/v1/chatbot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const elapsedMs = Math.round(performance.now() - startTime);
    const json = await response.json();

    if (!response.ok) {
      console.log(`\n${colors.red}✖ FAILED (Status ${response.status}) [${elapsedMs}ms]${colors.reset}`);
      console.log(JSON.stringify(json, null, 2));
      return false;
    }

    console.log(`\n${colors.green}✔ SUCCESS (Status 200 OK) [${elapsedMs}ms]${colors.reset}`);

    logSection('Context & GeoAI Summary Ingested');
    if (json.context_used?.user) {
      console.log(`  👤 Farmer: ${json.context_used.user.username ?? 'N/A'} (${json.context_used.user.location ?? 'N/A'})`);
    }
    if (json.context_used?.location_matched) {
      const loc = json.context_used.location_matched;
      console.log(`  📍 Matched Grid: ${loc.grid_id ?? 'N/A'} | Region: ${loc.region ?? 'N/A'} | Lat: ${loc.matched_lat}, Lon: ${loc.matched_lon}`);
    }
    if (json.context_used?.model_predictions_summary) {
      const preds = json.context_used.model_predictions_summary;
      console.log(`  🌾 Model Predictions: ${preds.total_targets_loaded} targets loaded`);
      if (preds.crop_health_score !== undefined) console.log(`     - Crop Health: ${(preds.crop_health_score * 100).toFixed(1)}%`);
      if (preds.crop_yield_t_ha !== undefined) console.log(`     - Yield Forecast: ${preds.crop_yield_t_ha} t/ha`);
      if (preds.flood_risk !== undefined) console.log(`     - Flood Risk: ${preds.flood_risk}`);
      if (preds.top_suitable_crops?.length > 0) {
        console.log(`     - Top Crops: ${preds.top_suitable_crops.map((c) => `${c.crop} (${c.suitability})`).join(', ')}`);
      }
    }
    if (json.context_used?.market_prices_summary?.length > 0) {
      console.log(`  💰 Market Prices Referenced: ${json.context_used.market_prices_summary.length} commodities`);
      for (const p of json.context_used.market_prices_summary.slice(0, 3)) {
        console.log(`     - ${p.commodity}: ${p.price_min ?? ''} - ${p.price_max ?? ''} ${p.currency}/${p.unit} (${p.source})`);
      }
    }

    logSection('AI Chatbot Response');
    console.log(`${colors.cyan}Language: [${json.language}] | Model: [${json.metadata?.model}]${colors.reset}`);
    console.log('──────────────────────────────────────────────────────────────────────');
    console.log(json.response);
    console.log('──────────────────────────────────────────────────────────────────────');

    return true;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startTime);
    console.log(`\n${colors.red}✖ ERROR: ${error.message} [${elapsedMs}ms]${colors.reset}`);
    return false;
  }
}

async function runAllTests() {
  console.log(`\n${colors.bright}${colors.green}🌱 Myanmar Agricultural GeoAI Chatbot Test Suite${colors.reset}`);
  console.log(`Connecting to: ${backendUrl}`);

  const args = process.argv.slice(2);
  const caseArgIndex = args.indexOf('--case');
  const selectedCase = caseArgIndex !== -1 ? args[caseArgIndex + 1] : 'all';

  const testCases = [
    {
      id: '1',
      name: 'Test 1: English Farmer Profile & Crop Advisory (Ayeyawaddy)',
      payload: {
        message: 'What crops should I plant this season and what fertilizer ratio is best for clay loam soil?',
        user_info: {
          username: 'U Kyaw',
          location: 'Hinthada, Ayeyawaddy',
          farm_size_acres: 5,
          crops_grown: ['monsoon_rice'],
          soil_type: 'clay loam',
          irrigation_access: true,
          preferred_language: 'en',
        },
        locator: {
          lat: 17.65,
          lon: 95.45,
          observation_month: '2024-01',
        },
      },
    },
    {
      id: '2',
      name: 'Test 2: Myanmar Unicode Query (မိုးလေဝသနှင့် ရေကြီးနိုင်ခြေ သတိပေးချက်)',
      payload: {
        message: 'ယခုလတွင် မိုးရွာသွန်းမှုနှင့် ရေကြီးနိုင်ခြေ အခြေအနေ ဘယ်လိုရှိပါသလဲ? စပါးစိုက်ပျိုးရန် သင့်တော်ပါသလား?',
        user_info: {
          username: 'ဦးအောင်',
          location: 'မအူပင်၊ ဧရာဝတီ',
          farm_size_acres: 10,
          preferred_language: 'my',
        },
        locator: {
          lat: 16.73,
          lon: 95.65,
          observation_month: '2024-01',
        },
      },
    },
    {
      id: '3',
      name: 'Test 3: Dry Zone (Magway) Sesame & Groundnut Advisory with Risk Alerts',
      payload: {
        message: 'I want to grow sesame and groundnut in Magway. What are the drought and heat risks?',
        user_info: {
          username: 'Ko Min',
          location: 'Magway Township',
          farm_size_acres: 8,
          crops_grown: ['sesame', 'groundnut'],
          soil_type: 'sandy loam',
          irrigation_access: false,
        },
        locator: {
          lat: 20.15,
          lon: 94.93,
          observation_month: '2024-01',
        },
      },
    },
    {
      id: '4',
      name: 'Test 4: Real-World Commodity Market Prices & Harvest Advisory',
      payload: {
        message: 'စပါးနှင့် မတ်ပဲ လက်ရှိ ပေါက်စျေး အခြေအနေနှင့် သိုလှောင်ရောင်းချမှု အကြံပြုချက် သိပါရစေ။',
        user_info: {
          username: 'ဒေါ်ခင်လှ',
          location: 'ပဲခူးတိုင်း',
          preferred_language: 'my',
        },
        include_market_prices: true,
      },
    },
  ];

  let passed = 0;
  let total = 0;

  for (const testCase of testCases) {
    if (selectedCase !== 'all' && selectedCase !== testCase.id) {
      continue;
    }
    total++;
    const success = await sendChatbotRequest(testCase.name, testCase.payload);
    if (success) passed++;
  }

  logHeader(`Test Summary: ${passed}/${total} Scenarios Passed`);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
