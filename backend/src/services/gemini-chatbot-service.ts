import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';
import type {
  ChatbotRequest,
  ChatbotResponse,
  ChatMessage,
} from '../schemas/chatbot.js';
import type { PredictionResponse } from '../schemas/prediction.js';
import type { MarketPrice } from '../db/store.js';

type FetchImplementation = typeof globalThis.fetch;

export interface ChatbotServiceGateway {
  generateReply(
    request: ChatbotRequest,
    requestId: string,
    options?: {
      prediction?: PredictionResponse;
      marketPrices?: MarketPrice[];
      signal?: AbortSignal;
    },
  ): Promise<ChatbotResponse>;
}

export class GeminiChatbotService implements ChatbotServiceGateway {
  constructor(
    private readonly config: AppConfig,
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async generateReply(
    request: ChatbotRequest,
    requestId: string,
    options: {
      prediction?: PredictionResponse;
      marketPrices?: MarketPrice[];
      signal?: AbortSignal;
    } = {},
  ): Promise<ChatbotResponse> {
    const startTime = this.now();
    const apiKey = this.config.geminiApiKey;

    if (!apiKey) {
      throw new AppError(
        503,
        'CHATBOT_API_KEY_NOT_CONFIGURED',
        'Gemini API key is not configured on the backend server.',
      );
    }

    const { prediction, marketPrices } = options;
    const isBurmeseQuery = this.detectBurmese(request.message, request.user_info?.preferred_language);
    const targetLanguage = isBurmeseQuery ? 'my' : 'en';

    const systemInstruction = this.buildSystemInstruction(targetLanguage);
    const promptPayload = this.buildPromptPayload(request, prediction, marketPrices, targetLanguage);

    const contents = this.formatConversationContents(request.history, promptPayload);

    const apiUrl = `${this.config.geminiApiUrl}/v1beta/models/${encodeURIComponent(
      this.config.geminiModel,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.chatbotRequestTimeoutMs);

    const abortHandler = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      const response = await this.fetchImplementation(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Myanmar-GeoAI-Backend/1.0',
        },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          generationConfig: {
            temperature: 0.3,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => '');
        }

        const statusCode = response.status;
        if (statusCode === 400 || statusCode === 403) {
          throw new AppError(
            502,
            'UPSTREAM_AI_ERROR',
            `Gemini AI upstream service returned status ${statusCode}: ${JSON.stringify(errorBody)}`,
          );
        } else if (statusCode === 429) {
          throw new AppError(
            429,
            'AI_RATE_LIMITED',
            'Gemini AI service rate limit reached. Please try again in a few moments.',
          );
        } else {
          throw new AppError(
            502,
            'UPSTREAM_AI_UNAVAILABLE',
            `Gemini AI service unavailable (upstream status ${statusCode}).`,
          );
        }
      }

      const rawJson = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
          finishReason?: string;
        }>;
      };

      const candidateText =
        rawJson.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') ?? '';

      if (!candidateText.trim()) {
        throw new AppError(
          502,
          'EMPTY_AI_RESPONSE',
          'Gemini AI returned an empty response candidate.',
        );
      }

      const responseTimeMs = this.now() - startTime;
      const predictionsSummary = prediction ? this.summarizePredictions(prediction) : null;
      const marketPricesSummary = marketPrices && marketPrices.length > 0
        ? marketPrices.slice(0, 15).map((price) => ({
            commodity: price.commodity_name_raw,
            variety: price.variety ?? null,
            region: price.region ?? null,
            price_min: price.price_min ?? null,
            price_max: price.price_max ?? null,
            unit: price.unit,
            currency: price.currency,
            source: price.source_name,
          }))
        : null;

      const locationMatched = prediction
        ? {
            sample_id: prediction.location.sample_id,
            grid_id: prediction.location.grid_id,
            region: prediction.location.region,
            observation_month: prediction.location.observation_month,
            matched_lat: prediction.location.matched_lat,
            matched_lon: prediction.location.matched_lon,
            distance_km: prediction.location.distance_km,
          }
        : request.locator
          ? {
              sample_id: request.locator.sample_id,
              region: request.locator.region,
              matched_lat: request.locator.lat,
              matched_lon: request.locator.lon,
            }
          : null;

      return {
        api_version: 'v1',
        request_id: requestId,
        status: 'success',
        response: candidateText.trim(),
        language: targetLanguage,
        context_used: {
          user: request.user_info
            ? {
                username: request.user_info.username,
                location: request.user_info.location,
                phone: request.user_info.phone,
                farm_size_acres: request.user_info.farm_size_acres,
                crops_grown: request.user_info.crops_grown,
                soil_type: request.user_info.soil_type,
                irrigation_access: request.user_info.irrigation_access,
              }
            : null,
          location_matched: locationMatched,
          model_predictions_summary: predictionsSummary,
          market_prices_summary: marketPricesSummary,
          knowledge_sources: [
            {
              title: 'Myanmar Department of Agriculture (DOA) Official Agronomic Guidelines',
              reference: 'DOA MIS & Good Agricultural Practices (GAP)',
            },
            {
              title: 'Myanmar Rice Federation (MRF) Domestic Market Indicators',
              reference: 'MRF Weekly Market Bulletins',
            },
            {
              title: 'Myanmar GeoAI Remote Sensing & Machine Learning Ensemble',
              reference: 'Multi-target satellite climate & soil models',
            },
          ],
        },
        metadata: {
          model: this.config.geminiModel,
          response_time_ms: responseTimeMs,
          grounding_enabled: this.config.chatbotSearchGroundingEnabled,
        },
      };
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) {
        throw new AppError(
          504,
          'CHATBOT_TIMEOUT',
          'The AI chatbot request timed out while generating a response.',
        );
      }
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new AppError(
        502,
        'UPSTREAM_NETWORK_ERROR',
        `Failed to communicate with Gemini API: ${message}`,
      );
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  private detectBurmese(text: string, preferredLanguage?: 'my' | 'en' | 'auto'): boolean {
    if (preferredLanguage === 'my') return true;
    if (preferredLanguage === 'en') return false;
    // Check if string contains Myanmar Unicode range (\u1000-\u109F, \uAA60-\uAA7F, \uA9E0-\uA9FE)
    const myanmarRegex = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FE]/;
    return myanmarRegex.test(text);
  }

  private buildSystemInstruction(language: 'my' | 'en'): string {
    if (language === 'my') {
      return `သင်သည် မြန်မာနိုင်ငံ စိုက်ပျိုးရေးဦးစီးဌာန (DOA) နှင့် ပူးပေါင်းဆောင်ရွက်သော "မြန်မာ့စိုက်ပျိုးရေး GeoAI အထူးအကြံပေးပညာရှင်" (Myanmar Agricultural GeoAI Expert) ဖြစ်ပါသည်။

တာဝန်နှင့် ရည်ရွယ်ချက်များ-
1. တောင်သူဦးကြီးများ၊ စိုက်ပျိုးရေးလုပ်ကိုင်သူများအား မိုးလေဝသ၊ မြေဆီလွှာ၊ သီးနှံဖြစ်ထွန်းမှု၊ ပိုးမွှားရောဂါ၊ စျေးကွက်ပေါက်စျေးနှင့် ရာသီဥတုဘေးအန္တရာယ် ကာကွယ်ရေးဆိုင်ရာ တိကျခိုင်မာပြီး လက်တွေ့ကျသော အကြံဉာဏ်များ ပေးအပ်ရန်။
2. ပေးပို့ထားသော စနစ်တွင်း အချက်အလက်များ (GeoAI Model Predictions - 40+ targets)၊ တောင်သူ၏ တည်နေရာဒေသ၊ မြေအမျိုးအစား၊ လက်ရှိပေါက်စျေးများနှင့် လက်တွေ့မြေပြင်အခြေအနေများကို ပေါင်းစပ်အဖြေထုတ်ပေးရန်။
3. လေးစားရင်းနှီးပြီး အားတက်စေသော လေသံ (တောင်သူဦးကြီးတို့အတွက် နားလည်လွယ်သော မြန်မာယူနီကုဒ်စာလုံး) ဖြင့် ရှင်းလင်းတိကျစွာ ရေးသားရန်။

အဖြေဖွဲ့စည်းမှု ပုံစံ-
- အဓိက အကြံပြုချက် (အနှစ်ချုပ်)
- အဆင့်ဆင့် လက်တွေ့ဆောင်ရွက်ရန် နည်းလမ်းများ (စိုက်ပျိုးချိန်၊ မြေဩဇာ အချိုးအစား၊ ရေသွင်းရေထုတ်)
- ရာသီဥတုနှင့် ဘေးအန္တရာယ် ကြိုတင်ကာကွယ်ရန် သတိပြုချက်များ (ရေကြီး/မိုးခေါင်/အပူဒဏ် စသည်)
- စျေးကွက်နှင့် ဝင်ငွေတိုးတက်ရေး အကြံပြုချက်`;
    }

    return `You are the "Myanmar Agricultural GeoAI Expert Assistant", an advanced agricultural advisor partnering with Myanmar extension services and farmers.

Core Objectives:
1. Deliver highly actionable, scientifically grounded, and compassionate agronomic advice tailored for Myanmar agro-ecological zones (Delta, Dry Zone, Hilly, Coastal).
2. Integrate provided GeoAI model predictions (40+ satellite & ML prediction targets including crop health, yield, flood/drought/heat risks, soil nutrients, and crop suitabilities) and current real-world market prices.
3. Provide structured, practical guidance including planting calendars, fertilizer split ratios, pest/disease prevention, irrigation management, and harvest market timing.

Response Format:
- **Key Takeaways & Direct Advice**
- **Actionable Step-by-Step Guidance** (Sowing, Soil & Fertilizer NPK, Water Management)
- **Climate & Risk Mitigation** (Flood, Drought, Heat, Pest Alerts)
- **Market & Economic Outlook** (Commodity Prices & Harvest Value)`;
  }

  private buildPromptPayload(
    request: ChatbotRequest,
    prediction?: PredictionResponse,
    marketPrices?: MarketPrice[],
    language: 'my' | 'en' = 'en',
  ): string {
    const sections: string[] = [];

    // Section 1: Farmer & User Context
    sections.push(`=== 1. FARMER & USER PROFILE ===`);
    if (request.user_info) {
      const u = request.user_info;
      sections.push(`Name/Username: ${u.username ?? 'Farmer'}`);
      sections.push(`Location / Township: ${u.location ?? 'Myanmar'}`);
      if (u.phone) sections.push(`Phone: ${u.phone}`);
      if (u.farm_size_acres !== undefined) sections.push(`Farm Size: ${u.farm_size_acres} acres`);
      if (u.crops_grown && u.crops_grown.length > 0) sections.push(`Crops Grown: ${u.crops_grown.join(', ')}`);
      if (u.soil_type) sections.push(`Soil Type: ${u.soil_type}`);
      if (u.irrigation_access !== undefined) sections.push(`Irrigation Access: ${u.irrigation_access ? 'Yes' : 'No / Rainfed'}`);
    } else if (request.locator) {
      sections.push(`Location Coordinates: Lat ${request.locator.lat ?? 'N/A'}, Lon ${request.locator.lon ?? 'N/A'}`);
      if (request.locator.region) sections.push(`Region: ${request.locator.region}`);
      if (request.locator.sample_id) sections.push(`Sample ID: ${request.locator.sample_id}`);
    } else {
      sections.push(`General Myanmar Farmer Inquiry`);
    }

    // Section 2: GeoAI 40+ Model Predictions & Composite Features
    sections.push(`\n=== 2. GEOAI MODEL PREDICTIONS & COMPOSITE TARGETS (40+ SATELLITE/ML FEATURES) ===`);
    if (prediction) {
      const loc = prediction.location;
      sections.push(`Matched Grid: ${loc.grid_id} (Region: ${loc.region}, Sample: ${loc.sample_id})`);
      sections.push(`Matched Coordinates: Lat ${loc.matched_lat}, Lon ${loc.matched_lon} (Distance: ${loc.distance_km.toFixed(2)} km)`);
      sections.push(`Observation Period: ${loc.observation_month}`);

      sections.push(`\n--- Core Agro-Climate & Risk Predictions ---`);
      for (const [targetName, pred] of Object.entries(prediction.predictions)) {
        if (!pred) continue;
        const valStr = pred.task_type === 'classification' ? `${pred.label} (value: ${pred.value})` : `${pred.value} ${pred.unit}`;
        const confStr = pred.confidence !== null ? ` [confidence: ${(pred.confidence * 100).toFixed(1)}%]` : '';
        sections.push(`- ${targetName}: ${valStr}${confStr}`);
      }

      sections.push(`\n--- Composite Intelligence Features ---`);
      if (prediction.composite_features.crop_health) {
        const ch = prediction.composite_features.crop_health;
        sections.push(`- Crop Health Score: ${(ch.health_score * 100).toFixed(1)}% (${ch.health_class}, NDVI: ${ch.ndvi_median ?? 'N/A'})`);
      }
      if (prediction.composite_features.crop_recommender) {
        const cr = prediction.composite_features.crop_recommender;
        sections.push(`- Crop Recommendation Basis: ${cr.recommendation_basis}`);
        if (cr.top_recommendations && cr.top_recommendations.length > 0) {
          sections.push(`- Top Suitable Crops: ${cr.top_recommendations.map((c) => `${c.crop} (${c.suitability})`).join(', ')}`);
        }
      }
      if (prediction.composite_features.risk_alerts) {
        const ra = prediction.composite_features.risk_alerts;
        sections.push(`- Overall Risk Level: ${ra.overall_level.toUpperCase()}`);
        sections.push(`  Risk Breakdown: Flood=${(ra.risk_scores.flood * 100).toFixed(0)}%, Drought=${(ra.risk_scores.drought * 100).toFixed(0)}%, Heat=${(ra.risk_scores.heat * 100).toFixed(0)}%, Erosion=${(ra.risk_scores.erosion * 100).toFixed(0)}%, Water Scarcity=${(ra.risk_scores.water_scarcity * 100).toFixed(0)}%`);
      }
      if (prediction.composite_features.land_use) {
        const lu = prediction.composite_features.land_use;
        sections.push(`- Land Conversion Risk: ${(lu.conversion_risk_score * 100).toFixed(0)}%, Urban Encroachment: ${(lu.urban_encroachment_score * 100).toFixed(0)}%`);
      }
    } else {
      sections.push(`No direct coordinate locator provided. Using regional agro-ecological baselines.`);
    }

    // Section 3: Real-World Market Prices
    sections.push(`\n=== 3. REAL-WORLD CURRENT MARKET PRICES & AGRICULTURAL COMMODITIES ===`);
    if (marketPrices && marketPrices.length > 0) {
      sections.push(`Recent verified market price points (DOA / MRF / CSO / Wisarra):`);
      for (const p of marketPrices.slice(0, 10)) {
        const priceRange = p.price_min && p.price_max
          ? `${p.price_min} - ${p.price_max} ${p.currency}/${p.unit}`
          : p.price_min
            ? `${p.price_min} ${p.currency}/${p.unit}`
            : 'Market quote pending';
        const regionStr = p.region ? ` (${p.region})` : '';
        sections.push(`- ${p.commodity_name_raw}${p.variety ? ` [${p.variety}]` : ''}${regionStr}: ${priceRange} [Source: ${p.source_name}, Date: ${p.source_date}]`);
      }
    } else {
      sections.push(`Standard national wholesale reference ranges for paddy, pulses, and oilseeds.`);
    }

    // Section 4: Farmer's Inquiry
    sections.push(`\n=== 4. FARMER'S QUESTION / MESSAGE ===`);
    sections.push(request.message);
    sections.push(`\nInstruction: Answer the farmer comprehensively in ${language === 'my' ? 'fluent Myanmar Unicode' : 'clear English'} based on all the above GeoAI predictions and market facts.`);

    return sections.join('\n');
  }

  private formatConversationContents(
    history: ChatMessage[],
    latestUserPrompt: string,
  ): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
    const formatted: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const item of history) {
      const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
      formatted.push({
        role,
        parts: [{ text: item.content }],
      });
    }

    formatted.push({
      role: 'user',
      parts: [{ text: latestUserPrompt }],
    });

    return formatted;
  }

  private summarizePredictions(prediction: PredictionResponse) {
    const p = prediction.predictions;
    const cf = prediction.composite_features;

    const health = cf.crop_health?.health_score ?? (typeof p.crop_health_score?.value === 'number' ? p.crop_health_score.value : null);
    const yieldEst = typeof p.crop_yield_t_ha?.value === 'number' ? p.crop_yield_t_ha.value : null;
    const irrigation = p.irrigation_need ? (p.irrigation_need.task_type === 'classification' ? p.irrigation_need.label : p.irrigation_need.value) : null;
    const precip = typeof p.current_month_precipitation_mm?.value === 'number' ? p.current_month_precipitation_mm.value : null;
    const temp = typeof p.current_month_mean_temperature_c?.value === 'number' ? p.current_month_mean_temperature_c.value : null;
    const flood = p.flood_risk_level ? (p.flood_risk_level.task_type === 'classification' ? p.flood_risk_level.label : p.flood_risk_level.value) : (cf.risk_alerts?.risk_scores.flood ?? null);
    const drought = typeof p.drought_risk_score?.value === 'number' ? p.drought_risk_score.value : (cf.risk_alerts?.risk_scores.drought ?? null);
    const heat = p.heat_stress_risk ? (p.heat_stress_risk.task_type === 'classification' ? p.heat_stress_risk.label : p.heat_stress_risk.value) : (cf.risk_alerts?.risk_scores.heat ?? null);
    const waterScarcity = p.water_scarcity_risk ? (p.water_scarcity_risk.task_type === 'classification' ? p.water_scarcity_risk.label : p.water_scarcity_risk.value) : (cf.risk_alerts?.risk_scores.water_scarcity ?? null);

    const topSuitableCrops: Array<{ crop: string; suitability: string }> = [];
    if (cf.crop_recommender?.top_recommendations) {
      for (const item of cf.crop_recommender.top_recommendations) {
        topSuitableCrops.push({ crop: item.crop, suitability: item.suitability });
      }
    } else {
      for (const [targetName, pred] of Object.entries(p)) {
        if (targetName.startsWith('crop_suitability_') && pred) {
          const cropName = targetName.replace('crop_suitability_', '').replace(/_/g, ' ');
          const suitability = pred.task_type === 'classification' ? pred.label : String(pred.value);
          topSuitableCrops.push({ crop: cropName, suitability });
        }
      }
    }

    return {
      crop_health_score: health,
      crop_yield_t_ha: yieldEst,
      irrigation_need: irrigation,
      precipitation_mm: precip,
      temperature_c: temp,
      flood_risk: flood,
      drought_risk: drought,
      heat_stress_risk: heat,
      water_scarcity_risk: waterScarcity,
      top_suitable_crops: topSuitableCrops.slice(0, 5),
      total_targets_loaded: Object.keys(p).length,
    };
  }
}
