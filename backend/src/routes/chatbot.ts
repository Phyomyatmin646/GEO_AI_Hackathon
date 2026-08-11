import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppStore, MarketPrice } from '../db/store.js';
import { RequestValidationError } from '../errors.js';
import {
  ChatbotRequestSchema,
  ChatbotResponseSchema,
} from '../schemas/chatbot.js';
import type { PredictionRequest, PredictionResponse } from '../schemas/prediction.js';
import type { ModelServerGateway } from '../services/model-server-client.js';
import type { ChatbotServiceGateway } from '../services/gemini-chatbot-service.js';

export default async function chatbotRoutes(
  fastify: FastifyInstance,
  options: {
    chatbotService: ChatbotServiceGateway;
    modelServer?: ModelServerGateway;
    store?: AppStore;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  const handleChatRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const parsed = ChatbotRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new RequestValidationError(parsed.error.issues);
    }

    const chatRequest = parsed.data;
    const controller = new AbortController();
    const handleClientAbort = () => controller.abort();
    request.raw.once('aborted', handleClientAbort);

    try {
      let prediction: PredictionResponse | undefined = chatRequest.prediction;

      // Automatically fetch 40+ GeoAI model prediction targets if locator is provided and predictions not yet loaded
      if (
        !prediction &&
        chatRequest.include_model_predictions &&
        options.modelServer &&
        chatRequest.locator
      ) {
        const loc = chatRequest.locator;
        const hasCoordinates = loc.lat !== undefined && loc.lon !== undefined;
        const hasSampleId = loc.sample_id !== undefined;

        if (hasCoordinates || hasSampleId) {
          try {
            const predictionQuery: PredictionRequest = {
              request_id: request.id,
              sample_id: loc.sample_id,
              lat: loc.lat,
              lon: loc.lon,
              observation_month: loc.observation_month,
              include_all_targets: true,
              composite_features: [
                'crop_recommender',
                'crop_health',
                'economic_roi',
                'risk_alerts',
                'land_use',
              ],
            };
            prediction = await options.modelServer.predict(
              predictionQuery,
              request.id,
              controller.signal,
            );
          } catch (modelError) {
            request.log.warn(
              { err: modelError, requestId: request.id },
              'Failed to fetch real-time GeoAI model predictions; continuing with baseline knowledge',
            );
          }
        }
      }

      // Fetch relevant real-world market prices if store is available
      let marketPrices: MarketPrice[] | undefined;
      if (chatRequest.include_market_prices && options.store) {
        try {
          marketPrices = await options.store.listMarketPrices({ limit: 20 });
        } catch (marketError) {
          request.log.warn(
            { err: marketError, requestId: request.id },
            'Failed to fetch market prices from store',
          );
        }
      }

      const chatbotReply = await options.chatbotService.generateReply(
        chatRequest,
        request.id,
        {
          prediction,
          marketPrices,
          signal: controller.signal,
        },
      );

      const validatedReply = ChatbotResponseSchema.parse(chatbotReply);
      return reply.status(200).send(validatedReply);
    } finally {
      request.raw.off('aborted', handleClientAbort);
    }
  };

  // Primary endpoint: POST /api/v1/chatbot
  fastify.post('/', { config: { rateLimit: options.rateLimit } }, handleChatRequest);

  // Ergonomic alias: POST /api/v1/chatbot/chat
  fastify.post('/chat', { config: { rateLimit: options.rateLimit } }, handleChatRequest);
}
