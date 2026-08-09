import type { AppConfig } from '../config.js';
import { MODEL_TARGETS, type ModelTarget } from '../catalog.js';
import {
  HEALTHY_MODEL_TARGETS,
  MODEL_FEATURE_NAMES,
  type ModelFeatureRow,
} from '../contracts/weekly.js';
import { AppError } from '../errors.js';
import {
  BatchInferResponseSchema,
  ModelCatalogResponseSchema,
  ModelServerErrorResponseSchema,
  ModelServerReadyResponseSchema,
  type BatchInferResponse,
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

export type BatchInferenceRequest = {
  rows: ModelFeatureRow[];
  targets: ModelTarget[];
  observation_month: string;
};

export interface ModelServerGateway {
  predict(
    request: PredictionRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<PredictionResponse>;
  batchInfer(
    request: BatchInferenceRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<BatchInferResponse>;
  getModels(requestId: string): Promise<ModelCatalogResponse>;
  getReadiness(requestId: string): Promise<ModelServerReadyResponse>;
  getCircuitState(): { state: 'closed' | 'open' | 'half_open'; consecutive_failures: number };
}

export class ModelServerClient implements ModelServerGateway {
  private readonly circuitBreaker: CircuitBreaker;
  private activeRequests = 0;
  private catalogCache?: { value: ModelCatalogResponse; expiresAt: number };
  private catalogRequest?: Promise<ModelCatalogResponse>;
  private readinessCache?: { value: ModelServerReadyResponse; expiresAt: number };
  private readonly healthyTargets = new Set<ModelTarget>(HEALTHY_MODEL_TARGETS);

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
    const upstreamRequest: PredictionRequest = { ...request, request_id: requestId };
    const upstream = await this.requestJson(
      '/api/v1/predict',
      { method: 'POST', body: JSON.stringify(upstreamRequest) },
      requestId,
      signal,
    );
    const parsed = PredictionResponseSchema.safeParse(upstream.payload);
    if (!parsed.success) this.failContract(upstream.permit, parsed.error);
    this.circuitBreaker.recordSuccess(upstream.permit);
    return parsed.data;
  }

  async batchInfer(
    request: BatchInferenceRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<BatchInferResponse> {
    this.validateBatchRequest(request);
    await this.getReadiness(requestId);
    const upstream = await this.requestJson(
      '/api/v1/infer/batch',
      { method: 'POST', body: JSON.stringify(request) },
      requestId,
      signal,
    );
    const parsed = BatchInferResponseSchema.safeParse(upstream.payload);
    if (!parsed.success) this.failContract(upstream.permit, parsed.error);
    this.validateBatchResponse(request, parsed.data, upstream.permit);
    this.circuitBreaker.recordSuccess(upstream.permit);
    return parsed.data;
  }

  async getModels(requestId: string): Promise<ModelCatalogResponse> {
    return this.getValidatedCatalog(requestId);
  }

  async getReadiness(requestId: string): Promise<ModelServerReadyResponse> {
    if (this.readinessCache && this.readinessCache.expiresAt > this.now()) {
      return this.readinessCache.value;
    }
    const upstream = await this.requestJson('/api/v1/ready', { method: 'GET' }, requestId);
    const parsed = ModelServerReadyResponseSchema.safeParse(upstream.payload);
    if (!parsed.success) this.failContract(upstream.permit, parsed.error);
    if (parsed.data.catalog_version !== this.config.modelExpectedCatalogVersion) {
      this.failContract(
        upstream.permit,
        new Error('model server catalog version differs from the audited release'),
      );
    }
    this.circuitBreaker.recordSuccess(upstream.permit);
    this.readinessCache = {
      value: parsed.data,
      expiresAt: this.now() + this.config.modelCatalogCacheTtlMs,
    };
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

  private validateBatchRequest(request: BatchInferenceRequest): void {
    if (request.rows.length < 1 || request.rows.length > 500) {
      throw new AppError(500, 'INVALID_MODEL_BATCH', 'The model batch is invalid.');
    }
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(request.observation_month)) {
      throw new AppError(500, 'INVALID_MODEL_BATCH', 'The model batch is invalid.');
    }
    if (
      request.targets.length < 1 ||
      request.targets.length > MODEL_TARGETS.length ||
      new Set(request.targets).size !== request.targets.length
    ) {
      throw new AppError(500, 'INVALID_MODEL_BATCH', 'The model batch is invalid.');
    }
    for (const target of request.targets) {
      if (!MODEL_TARGETS.includes(target)) {
        throw new AppError(500, 'INVALID_MODEL_BATCH', 'The model batch is invalid.');
      }
      if (!this.config.allowFlaggedModels && !this.healthyTargets.has(target)) {
        throw new AppError(
          500,
          'FLAGGED_MODEL_DISABLED',
          'A disabled flagged model was selected for inference.',
        );
      }
    }

    for (const row of request.rows) {
      if (!/^mm_\d+_\d+$/.test(row.grid_id)) {
        throw new AppError(500, 'INVALID_MODEL_BATCH', 'The model batch is invalid.');
      }
      const keys = Object.keys(row).filter((key) => key !== 'grid_id');
      if (
        keys.length !== MODEL_FEATURE_NAMES.length ||
        MODEL_FEATURE_NAMES.some((feature, index) => keys[index] !== feature)
      ) {
        throw new AppError(
          500,
          'MODEL_FEATURE_SCHEMA_MISMATCH',
          'Weekly features do not match the audited model schema.',
        );
      }
      for (const feature of MODEL_FEATURE_NAMES) {
        if (!Number.isFinite(row[feature])) {
          throw new AppError(
            500,
            'NON_FINITE_MODEL_FEATURE',
            'Weekly features contain a non-finite value.',
          );
        }
      }
    }
  }

  private validateBatchResponse(
    request: BatchInferenceRequest,
    response: BatchInferResponse,
    permit: CircuitPermit,
  ): void {
    if (
      response.total_rows !== request.rows.length ||
      response.results.length !== request.rows.length
    ) {
      this.failContract(permit, new Error('batch response omitted or added request rows'));
    }
    if (
      response.catalog_version !== 'unknown' &&
      response.catalog_version !== this.config.modelExpectedCatalogVersion
    ) {
      this.failContract(permit, new Error('batch response used an unexpected model catalog'));
    }

    const requestedTargets = new Set<ModelTarget>(request.targets);
    for (const [index, result] of response.results.entries()) {
      if (result.grid_id !== request.rows[index]?.grid_id) {
        this.failContract(permit, new Error('batch response grid_id did not match the request'));
      }
      const predictionTargets = Object.keys(result.predictions) as ModelTarget[];
      const errorTargets = Object.keys(result.errors) as ModelTarget[];
      for (const target of [...predictionTargets, ...errorTargets]) {
        if (!requestedTargets.has(target)) {
          this.failContract(permit, new Error('batch response returned an unrequested target'));
        }
      }
      for (const target of request.targets) {
        const prediction = result.predictions[target];
        const error = result.errors[target];
        if ((prediction === undefined) === (error === undefined)) {
          this.failContract(
            permit,
            new Error('each requested target must have exactly one prediction or error'),
          );
        }
        if (prediction) {
          const expectedStatus = this.healthyTargets.has(target) ? 'healthy' : 'flagged';
          if (
            prediction.validation_status !== expectedStatus ||
            !/^sha256-[a-f0-9]{12}$/i.test(prediction.model_version) ||
            prediction.warnings.some((warning) => /prototype|fallback/i.test(warning))
          ) {
            this.failContract(
              permit,
              new Error('batch prediction cannot be tied to the audited primary release'),
            );
          }
        }
      }
    }
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
          ? AbortSignal.any([externalSignal, AbortSignal.timeout(this.config.modelServerTimeoutMs)])
          : AbortSignal.timeout(this.config.modelServerTimeoutMs),
      });

      const contentType = response.headers.get('content-type')?.toLowerCase();
      if (!contentType?.includes('application/json')) {
        await response.body?.cancel();
        throw this.contractError(new Error('model server returned a non-JSON content type'));
      }
      if (!response.ok) {
        const payload = await readJsonWithLimit(response, this.config.modelServerMaxResponseBytes);
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
        throw new AppError(499, 'CLIENT_CLOSED_REQUEST', 'The client closed the request.');
      }
      if (!circuitRecorded) this.circuitBreaker.recordFailure(permit);
      if (error instanceof AppError) throw error;
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
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
        return new AppError(422, 'MODEL_REQUEST_REJECTED', 'The model service rejected the validated request.');
      case 'REQUEST_TOO_LARGE':
        this.requireUpstreamStatus(status, [413], code);
        return new AppError(413, 'REQUEST_TOO_LARGE', 'The request is too large.');
      case 'REQUEST_TOO_EXPENSIVE':
        this.requireUpstreamStatus(status, [413, 422], code);
        return new AppError(413, 'REQUEST_TOO_EXPENSIVE', 'The request expands to too many model predictions.');
      case 'INFERENCE_CAPACITY_EXCEEDED':
        this.requireUpstreamStatus(status, [429, 503], code);
        return new AppError(503, 'MODEL_SERVER_BUSY', 'The model service is temporarily busy.', true, {
          retryAfterSeconds: 2,
        });
      case 'INFERENCE_TIMEOUT':
        this.requireUpstreamStatus(status, [504], code);
        return new AppError(504, 'MODEL_SERVER_TIMEOUT', 'The model service did not complete inference in time.', true, {
          retryAfterSeconds: 2,
        });
      case 'MODEL_UNAVAILABLE':
        this.requireUpstreamStatus(status, [503], code);
        return new AppError(503, 'MODEL_UNAVAILABLE', 'One or more requested models are unavailable.', true, {
          retryAfterSeconds: 5,
        });
      case 'SPATIAL_DATA_UNAVAILABLE':
      case 'MODEL_CATALOG_UNAVAILABLE':
      case 'SERVICE_NOT_READY':
        this.requireUpstreamStatus(status, [503], code);
        return new AppError(503, 'MODEL_SERVER_NOT_READY', 'The model service is not ready.', true, {
          retryAfterSeconds: 5,
        });
      case 'COMPOSITE_CALCULATION_FAILED':
        this.requireUpstreamStatus(status, [500], code);
        return new AppError(502, 'MODEL_COMPOSITE_ERROR', 'The model service could not build the requested composite.');
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        this.requireUpstreamStatus(status, [401, 403], code);
        return new AppError(503, 'MODEL_SERVER_AUTH_FAILED', 'The gateway could not authenticate to the model service.');
      case 'INTERNAL_ERROR':
        this.requireUpstreamStatus(status, [500], code);
        return new AppError(502, 'MODEL_SERVER_ERROR', 'The model service encountered an internal error.', true, {
          retryAfterSeconds: 2,
        });
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
    throw new AppError(502, 'MODEL_SERVER_INVALID_JSON', 'The model service returned an invalid response.', true);
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
