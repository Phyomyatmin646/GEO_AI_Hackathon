import type { AppConfig } from '../config.js';
import {
  resolveExpectedTargets,
  type ModelTarget,
} from '../catalog.js';
import { AppError } from '../errors.js';
import {
  ModelCatalogResponseSchema,
  ModelServerErrorResponseSchema,
  ModelServerReadyResponseSchema,
  type ModelCatalogResponse,
  type ModelServerErrorResponse,
  type ModelServerReadyResponse,
} from '../schemas/model-server.js';
import {
  PredictionResponseSchema,
  type PredictionRequest,
  type PredictionResponse,
} from '../schemas/prediction.js';
import { CircuitBreaker, type CircuitPermit } from './circuit-breaker.js';

type FetchImplementation = typeof globalThis.fetch;
type UpstreamJson = { payload: unknown; permit: CircuitPermit };

export interface ModelServerGateway {
  predict(
    request: PredictionRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<PredictionResponse>;
  getModels(requestId: string): Promise<ModelCatalogResponse>;
  getReadiness(requestId: string): Promise<ModelServerReadyResponse>;
  getCircuitState(): { state: 'closed' | 'open' | 'half_open'; consecutive_failures: number };
}

export class ModelServerClient implements ModelServerGateway {
  private readonly circuitBreaker: CircuitBreaker;
  private activeRequests = 0;
  private catalogCache?: { value: ModelCatalogResponse; expiresAt: number };
  private catalogRequest?: Promise<ModelCatalogResponse>;

  constructor(
    private readonly config: AppConfig,
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.circuitBreaker = new CircuitBreaker(
      config.circuitFailureThreshold,
      config.circuitResetMs,
      now,
    );
  }

  async predict(
    request: PredictionRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<PredictionResponse> {
    const catalog = await this.getValidatedCatalog(requestId);
    const expectedTargets = resolveExpectedTargets(request);
    if (expectedTargets.length > catalog.capabilities.max_expanded_sync_targets) {
      throw new AppError(
        413,
        'REQUEST_TOO_EXPENSIVE',
        'The synchronous request expands to too many model predictions.',
      );
    }
    const expectedCatalog = indexCatalog(catalog);
    for (const target of expectedTargets) {
      const item = expectedCatalog.get(target);
      if (!item?.ready) {
        throw new AppError(
          503,
          'MODEL_UNAVAILABLE',
          'One or more requested models are not ready.',
          false,
          { retryAfterSeconds: 5 },
        );
      }
    }

    const upstreamRequest: PredictionRequest = { ...request, request_id: requestId };
    const upstream = await this.requestJson(
      '/api/v1/predict',
      { method: 'POST', body: JSON.stringify(upstreamRequest) },
      requestId,
      signal,
    );
    const parsed = PredictionResponseSchema.safeParse(upstream.payload);
    if (!parsed.success) this.failContract(upstream.permit, parsed.error);

    try {
      this.validatePredictionSemantics(
        parsed.data,
        request,
        requestId,
        expectedTargets,
        catalog,
        expectedCatalog,
      );
    } catch (error) {
      this.failContract(upstream.permit, error);
    }

    this.circuitBreaker.recordSuccess(upstream.permit);
    return parsed.data;
  }

  async getModels(requestId: string): Promise<ModelCatalogResponse> {
    return this.getValidatedCatalog(requestId);
  }

  async getReadiness(requestId: string): Promise<ModelServerReadyResponse> {
    const upstream = await this.requestJson('/api/v1/ready', { method: 'GET' }, requestId);
    const parsed = ModelServerReadyResponseSchema.safeParse(upstream.payload);
    if (!parsed.success) this.failContract(upstream.permit, parsed.error);
    this.circuitBreaker.recordSuccess(upstream.permit);

    const catalog = await this.getValidatedCatalog(requestId, true);
    if (
      catalog.catalog_version !== parsed.data.catalog_version ||
      catalog.models.some((model) => !model.ready)
    ) {
      throw new AppError(
        503,
        'MODEL_SERVER_NOT_READY',
        'The model service catalog is not ready.',
        false,
        { retryAfterSeconds: 5 },
      );
    }
    return parsed.data;
  }

  getCircuitState() {
    return this.circuitBreaker.snapshot();
  }

  private async getValidatedCatalog(
    requestId: string,
    forceRefresh = false,
  ): Promise<ModelCatalogResponse> {
    if (!forceRefresh && this.catalogCache && this.catalogCache.expiresAt > this.now()) {
      return this.catalogCache.value;
    }
    if (this.catalogRequest) return this.catalogRequest;

    const request = this.fetchCatalog(requestId);
    this.catalogRequest = request;
    try {
      return await request;
    } finally {
      if (this.catalogRequest === request) this.catalogRequest = undefined;
    }
  }

  private async fetchCatalog(requestId: string): Promise<ModelCatalogResponse> {
    const upstream = await this.requestJson('/api/v1/models', { method: 'GET' }, requestId);
    const parsed = ModelCatalogResponseSchema.safeParse(upstream.payload);
    if (!parsed.success) this.failContract(upstream.permit, parsed.error);
    this.circuitBreaker.recordSuccess(upstream.permit);
    this.catalogCache = {
      value: parsed.data,
      expiresAt: this.now() + this.config.modelCatalogCacheTtlMs,
    };
    return parsed.data;
  }

  private async requestJson(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string },
    requestId: string,
    signal?: AbortSignal,
  ): Promise<UpstreamJson> {
    if (this.activeRequests >= this.config.modelServerMaxInFlight) {
      throw new AppError(
        503,
        'MODEL_GATEWAY_CAPACITY_EXCEEDED',
        'The inference gateway is temporarily at capacity.',
        false,
        { retryAfterSeconds: 1 },
      );
    }

    this.activeRequests += 1;
    try {
      return await this.performRequest(path, init, requestId, signal);
    } finally {
      this.activeRequests -= 1;
    }
  }

  private async performRequest(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string },
    requestId: string,
    externalSignal?: AbortSignal,
  ): Promise<UpstreamJson> {
    const permit = this.circuitBreaker.beforeRequest();
    let circuitRecorded = false;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Request-ID': requestId,
      };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.config.modelServerApiKey) {
        headers['X-Internal-API-Key'] = this.config.modelServerApiKey;
      }

      const response = await this.fetchImplementation(`${this.config.modelServerUrl}${path}`, {
        ...init,
        headers,
        redirect: 'error',
        signal: externalSignal
          ? AbortSignal.any([
              externalSignal,
              AbortSignal.timeout(this.config.modelServerTimeoutMs),
            ])
          : AbortSignal.timeout(this.config.modelServerTimeoutMs),
      });

      const contentType = response.headers.get('content-type')?.toLowerCase();
      if (!contentType?.includes('application/json')) {
        await response.body?.cancel();
        throw this.contractError(new Error('model server returned a non-JSON content type'));
      }

      if (!response.ok) {
        const payload = await readJsonWithLimit(
          response,
          this.config.modelServerMaxResponseBytes,
        );
        const parsedError = ModelServerErrorResponseSchema.safeParse(payload);
        if (!parsedError.success || parsedError.data.error.request_id !== requestId) {
          throw this.contractError(
            parsedError.success
              ? new Error('model error response request_id did not match the request')
              : parsedError.error,
          );
        }
        const mapped = this.mapUpstreamError(response.status, parsedError.data);
        if (response.status >= 500 || response.status === 429) {
          this.circuitBreaker.recordFailure(permit);
        } else {
          this.circuitBreaker.recordSuccess(permit);
        }
        circuitRecorded = true;
        throw mapped;
      }

      const payload = await readJsonWithLimit(response, this.config.modelServerMaxResponseBytes);
      return { payload, permit };
    } catch (error) {
      if (externalSignal?.aborted) {
        if (!circuitRecorded) this.circuitBreaker.recordSuccess(permit);
        throw new AppError(
          499,
          'CLIENT_CLOSED_REQUEST',
          'The client closed the request.',
        );
      }
      if (!circuitRecorded) this.circuitBreaker.recordFailure(permit);
      if (error instanceof AppError) throw error;
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new AppError(
          504,
          'MODEL_SERVER_TIMEOUT',
          'The model service did not respond in time.',
          true,
          { cause: error, retryAfterSeconds: 2 },
        );
      }
      throw new AppError(
        502,
        'MODEL_SERVER_UNAVAILABLE',
        'The model service could not be reached.',
        true,
        { cause: error, retryAfterSeconds: 2 },
      );
    }
  }

  private mapUpstreamError(status: number, response: ModelServerErrorResponse): AppError {
    const { code } = response.error;
    switch (code) {
      case 'LOCATION_NOT_FOUND':
        this.requireUpstreamStatus(status, [404], code);
        return new AppError(404, 'LOCATION_NOT_FOUND', 'No model input matched the locator.');
      case 'REQUEST_VALIDATION_FAILED':
        this.requireUpstreamStatus(status, [400, 422], code);
        return new AppError(
          422,
          'MODEL_REQUEST_REJECTED',
          'The model service rejected the validated request.',
        );
      case 'REQUEST_TOO_LARGE':
        this.requireUpstreamStatus(status, [413], code);
        return new AppError(413, 'REQUEST_TOO_LARGE', 'The request is too large.');
      case 'REQUEST_TOO_EXPENSIVE':
        this.requireUpstreamStatus(status, [413, 422], code);
        return new AppError(
          413,
          'REQUEST_TOO_EXPENSIVE',
          'The synchronous request expands to too many model predictions.',
        );
      case 'INFERENCE_CAPACITY_EXCEEDED':
        this.requireUpstreamStatus(status, [429, 503], code);
        return new AppError(
          503,
          'MODEL_SERVER_BUSY',
          'The model service is temporarily busy.',
          true,
          { retryAfterSeconds: 2 },
        );
      case 'INFERENCE_TIMEOUT':
        this.requireUpstreamStatus(status, [504], code);
        return new AppError(
          504,
          'MODEL_SERVER_TIMEOUT',
          'The model service did not complete inference in time.',
          true,
          { retryAfterSeconds: 2 },
        );
      case 'MODEL_UNAVAILABLE':
        this.requireUpstreamStatus(status, [503], code);
        return new AppError(
          503,
          'MODEL_UNAVAILABLE',
          'One or more requested models are unavailable.',
          true,
          { retryAfterSeconds: 5 },
        );
      case 'SPATIAL_DATA_UNAVAILABLE':
        this.requireUpstreamStatus(status, [503], code);
        return new AppError(
          503,
          'SPATIAL_DATA_UNAVAILABLE',
          'Verified spatial data is unavailable.',
          true,
          { retryAfterSeconds: 5 },
        );
      case 'MODEL_CATALOG_UNAVAILABLE':
        this.requireUpstreamStatus(status, [503], code);
        return new AppError(
          503,
          'MODEL_CATALOG_UNAVAILABLE',
          'The model catalog is unavailable.',
          true,
          { retryAfterSeconds: 5 },
        );
      case 'SERVICE_NOT_READY':
        this.requireUpstreamStatus(status, [503], code);
        return new AppError(
          503,
          'MODEL_SERVER_NOT_READY',
          'The model service is not ready.',
          true,
          { retryAfterSeconds: 5 },
        );
      case 'COMPOSITE_CALCULATION_FAILED':
        this.requireUpstreamStatus(status, [500], code);
        return new AppError(
          502,
          'MODEL_COMPOSITE_ERROR',
          'The model service could not build the requested composite.',
        );
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        this.requireUpstreamStatus(status, [401, 403], code);
        return new AppError(
          503,
          'MODEL_SERVER_AUTH_FAILED',
          'The gateway could not authenticate to the model service.',
        );
      case 'INTERNAL_ERROR':
        this.requireUpstreamStatus(status, [500], code);
        return new AppError(
          502,
          'MODEL_SERVER_ERROR',
          'The model service encountered an internal error.',
          true,
          { retryAfterSeconds: 2 },
        );
      default:
        throw this.contractError(new Error(`unsupported model-server error code: ${code}`));
    }
  }

  private requireUpstreamStatus(status: number, allowed: readonly number[], code: string): void {
    if (!allowed.includes(status)) {
      throw this.contractError(
        new Error(`model-server error ${code} used unexpected HTTP status ${status}`),
      );
    }
  }

  private validatePredictionSemantics(
    response: PredictionResponse,
    request: PredictionRequest,
    requestId: string,
    expectedTargets: readonly ModelTarget[],
    catalogRelease: ModelCatalogResponse,
    catalog: ReadonlyMap<ModelTarget, ModelCatalogResponse['models'][number]>,
  ): void {
    if (response.request_id !== requestId) {
      throw new Error('model response request_id did not match the request');
    }
    if (response.catalog_version !== catalogRelease.catalog_version) {
      throw new Error('model response catalog release did not match the validated catalog');
    }
    if (
      response.provenance.feature_dataset_sha256 !== catalogRelease.feature_dataset_sha256 ||
      response.provenance.spatial_index_sha256 !== catalogRelease.spatial_index_sha256
    ) {
      throw new Error('model response serving-data release did not match the validated catalog');
    }

    const responseTargets = Object.keys(response.predictions);
    assertExactKeys(responseTargets, expectedTargets, 'prediction targets');
    assertExactKeys(
      Object.keys(response.composite_features),
      request.composite_features,
      'composite features',
    );

    if (request.sample_id !== undefined) {
      if (response.location.sample_id !== request.sample_id) {
        throw new Error('model response sample_id did not match the request');
      }
      if (
        response.location.requested_lat !== null ||
        response.location.requested_lon !== null
      ) {
        throw new Error('sample lookup unexpectedly returned requested coordinates');
      }
    } else {
      if (
        response.location.requested_lat !== request.lat ||
        response.location.requested_lon !== request.lon ||
        response.location.observation_month !== request.observation_month
      ) {
        throw new Error('model response coordinate locator did not match the request');
      }
    }
    if (response.location.distance_km > this.config.modelServerMaxMatchDistanceKm) {
      throw new Error('model response exceeded the configured spatial match distance');
    }

    for (const target of expectedTargets) {
      const prediction = response.predictions[target];
      const model = catalog.get(target);
      if (!prediction || !model) throw new Error(`missing prediction metadata for ${target}`);
      const metadataMatches =
        prediction.task_type === model.task_type &&
        prediction.unit === model.unit &&
        prediction.model_version === model.model_version &&
        prediction.artifact_sha256 === model.artifact_sha256 &&
        prediction.input_schema_sha256 === model.input_schema_sha256 &&
        prediction.model_source === model.model_source &&
        prediction.deployment_status === model.deployment_status &&
        prediction.validation_status === model.validation_status;
      if (!metadataMatches) {
        throw new Error(`prediction metadata did not match the catalog for ${target}`);
      }
      if (prediction.task_type === 'regression' && model.task_type === 'regression') {
        const [minimum, maximum] = model.value_range;
        if (
          (minimum !== null && prediction.value < minimum) ||
          (maximum !== null && prediction.value > maximum)
        ) {
          throw new Error(`prediction value was outside the catalog range for ${target}`);
        }
      }
      if (prediction.task_type === 'classification' && model.task_type === 'classification') {
        const catalogClasses = model.classes.map(String);
        if (!catalogClasses.includes(prediction.label)) {
          throw new Error(`prediction class was not declared in the catalog for ${target}`);
        }
        if (prediction.probabilities !== null) {
          assertExactKeys(
            Object.keys(prediction.probabilities),
            catalogClasses,
            `probability classes for ${target}`,
          );
        }
      }
    }
  }

  private failContract(permit: CircuitPermit, cause: unknown): never {
    this.circuitBreaker.recordFailure(permit);
    throw this.contractError(cause);
  }

  private contractError(cause: unknown): AppError {
    return new AppError(
      502,
      'MODEL_SERVER_CONTRACT_ERROR',
      'The model service returned an invalid response.',
      true,
      { cause },
    );
  }
}

function indexCatalog(
  catalog: ModelCatalogResponse,
): ReadonlyMap<ModelTarget, ModelCatalogResponse['models'][number]> {
  return new Map(catalog.models.map((model) => [model.model_id, model]));
}

function assertExactKeys(
  actual: readonly string[],
  expected: readonly string[],
  description: string,
): void {
  if (actual.length !== expected.length) {
    throw new Error(`${description} did not match the request`);
  }
  const actualSet = new Set(actual);
  if (expected.some((value) => !actualSet.has(value))) {
    throw new Error(`${description} did not match the request`);
  }
}

async function readJsonWithLimit(response: Response, maximumBytes: number): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maximumBytes) {
      await response.body?.cancel();
      throw new AppError(
        502,
        'MODEL_SERVER_RESPONSE_TOO_LARGE',
        'The model service response exceeded the configured size limit.',
        true,
      );
    }
  }

  if (!response.body) {
    throw new AppError(
      502,
      'MODEL_SERVER_INVALID_JSON',
      'The model service returned an invalid response.',
      true,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new AppError(
        502,
        'MODEL_SERVER_RESPONSE_TOO_LARGE',
        'The model service response exceeded the configured size limit.',
        true,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new AppError(
      502,
      'MODEL_SERVER_INVALID_JSON',
      'The model service returned an invalid response.',
      true,
      { cause: error },
    );
  }
}
