import { GeminiChatbotService } from '../src/services/gemini-chatbot-service.js';
import { loadConfig } from '../src/config.js';
import type { ChatbotRequest } from '../src/schemas/chatbot.js';
import type { PredictionResponse } from '../src/schemas/prediction.js';

const config = loadConfig();

console.log('🤖 Initializing Direct Chatbot Service Test...');
console.log(`Model: ${config.geminiModel}`);
console.log(`API Key Configured: ${config.geminiApiKey ? 'Yes (' + config.geminiApiKey.slice(0, 8) + '...)' : 'No'}`);

const chatbotService = new GeminiChatbotService(config);

const mockPrediction: PredictionResponse = {
  api_version: 'v1',
  contract_version: 'model-inference-v1',
  catalog_version: config.modelExpectedCatalogVersion,
  request_id: 'test-req-direct-001',
  status: 'success',
  location: {
    sample_id: 'sample-hinthada-001',
    grid_id: 'grid-ayeyawaddy-102',
    region: 'Ayeyawaddy',
    observation_month: '2024-01',
    requested_lat: 17.65,
    requested_lon: 95.45,
    matched_lat: 17.65,
    matched_lon: 95.45,
    distance_km: 0.12,
  },
  predictions: {
    crop_health_score: {
      value: 0.78,
      label: null,
      unit: 'score_0_to_1',
      task_type: 'regression',
      confidence: null,
      confidence_kind: null,
      probabilities: null,
      model_version: '1.0.0',
      artifact_sha256: 'a'.repeat(64),
      input_schema_sha256: 'b'.repeat(64),
      model_source: 'primary',
      deployment_status: 'experimental',
      validation_status: 'healthy',
      warnings: [],
    },
    crop_yield_t_ha: {
      value: 4.12,
      label: null,
      unit: 't_ha',
      task_type: 'regression',
      confidence: null,
      confidence_kind: null,
      probabilities: null,
      model_version: '1.0.0',
      artifact_sha256: 'a'.repeat(64),
      input_schema_sha256: 'b'.repeat(64),
      model_source: 'primary',
      deployment_status: 'experimental',
      validation_status: 'healthy',
      warnings: [],
    },
    current_month_precipitation_mm: {
      value: 12.5,
      label: null,
      unit: 'mm',
      task_type: 'regression',
      confidence: null,
      confidence_kind: null,
      probabilities: null,
      model_version: '1.0.0',
      artifact_sha256: 'a'.repeat(64),
      input_schema_sha256: 'b'.repeat(64),
      model_source: 'primary',
      deployment_status: 'experimental',
      validation_status: 'healthy',
      warnings: [],
    },
    current_month_mean_temperature_c: {
      value: 26.8,
      label: null,
      unit: 'celsius',
      task_type: 'regression',
      confidence: null,
      confidence_kind: null,
      probabilities: null,
      model_version: '1.0.0',
      artifact_sha256: 'a'.repeat(64),
      input_schema_sha256: 'b'.repeat(64),
      model_source: 'primary',
      deployment_status: 'experimental',
      validation_status: 'healthy',
      warnings: [],
    },
  },
  composite_features: {
    crop_health: {
      status: 'experimental',
      health_score: 0.78,
      health_class: 'Good',
      ndvi_median: 0.62,
      map_color_hex: '#22c55e',
      field_validated: false,
    },
    crop_recommender: {
      status: 'experimental',
      strict_ranking_available: false,
      reason_code: 'CROSS_MODEL_CALIBRATION_REQUIRED',
      recommendation_basis: 'Aggregated tree ensemble suitability predictions for Delta agro-ecological zone.',
      top_suitability_tier: 'excellent',
      top_recommendations: [
        { crop: 'dry_season_rice', suitability: 'excellent', tree_vote_agreement: 0.88, color_code: '#22c55e' },
        { crop: 'black_gram', suitability: 'good', tree_vote_agreement: 0.75, color_code: '#3b82f6' },
      ],
      suitability_tiers: {
        poor: [],
        moderate: [],
        good: [{ crop: 'black_gram', suitability: 'good', tree_vote_agreement: 0.75, color_code: '#3b82f6' }],
        excellent: [{ crop: 'dry_season_rice', suitability: 'excellent', tree_vote_agreement: 0.88, color_code: '#22c55e' }],
      },
      probability_calibrated: false,
      field_validated: false,
    },
    risk_alerts: {
      status: 'experimental',
      overall_level: 'low',
      risk_scores: {
        flood: 0.05,
        drought: 0.15,
        heat: 0.1,
        erosion: 0.08,
        water_scarcity: 0.12,
      },
      advisory_status: 'human_review_required',
      approved_action: null,
      field_validated: false,
    },
  },
  provenance: {
    feature_dataset_sha256: 'a'.repeat(64),
    spatial_index_sha256: 'b'.repeat(64),
    data_source: 'GEE & Sentinel-2/CHIRPS',
    source_date: '2024-01-01',
    source_version: '1.0.0',
    quality_flag: 1,
    label_source: 'rule_engineered_surrogate',
    field_validated: false,
  },
  execution_metadata: {
    response_time_ms: 45,
    queue_wait_ms: 2,
    cached: false,
    models_loaded_count: 4,
  },
};

const sampleRequest: ChatbotRequest = {
  message: 'ဧရာဝတီတိုင်း ဟင်္သာတမြို့နယ်တွင် နွေစပါး သို့မဟုတ် မတ်ပဲ စိုက်ပျိုးရန် အကြံပြုချက်နှင့် မြေဆီလွှာ ပြုပြင်နည်း သိပါရစေ။',
  user_info: {
    username: 'ဦးကျော်',
    location: 'ဟင်္သာတမြို့နယ်၊ ဧရာဝတီတိုင်း',
    farm_size_acres: 5,
    crops_grown: ['monsoon_rice'],
    soil_type: 'စနယ်မြေ (Clay Loam)',
    irrigation_access: true,
    preferred_language: 'my',
  },
  include_market_prices: true,
  include_model_predictions: true,
  history: [],
};

async function testDirectService() {
  console.log('\n--- Sending Prompt to Gemini Chatbot Service ---');
  console.log(`Prompt: "${sampleRequest.message}"`);

  try {
    const reply = await chatbotService.generateReply(
      sampleRequest,
      'test-direct-req-123',
      { prediction: mockPrediction },
    );

    console.log('\n✅ Chatbot Reply Received:');
    console.log(`Language: [${reply.language}] | Response Time: [${reply.metadata.response_time_ms}ms]`);
    console.log('────────────────────────────────────────────────');
    console.log(reply.response);
    console.log('────────────────────────────────────────────────');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ Service Call Error:', msg);
  }
}

testDirectService();
