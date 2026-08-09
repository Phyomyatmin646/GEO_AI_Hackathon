import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { UserRegistrationRequestSchema } from '../src/schemas/users.js';
import type { ModelServerGateway } from '../src/services/model-server-client.js';
import {
  MemoryStore,
  batchResponseFixture,
  modelCatalogFixture,
  predictionFixture,
  readinessFixture,
  testConfig,
} from './helpers.js';

function fakeModelServer(): ModelServerGateway {
  return {
    predict: vi.fn(async (_request, requestId) => predictionFixture(requestId)),
    batchInfer: vi.fn(async (request) => batchResponseFixture(request)),
    getModels: vi.fn(async () => modelCatalogFixture()),
    getReadiness: vi.fn(async () => readinessFixture()),
    getCircuitState: vi.fn(() => ({ state: 'closed' as const, consecutive_failures: 0 })),
  };
}

describe('user registration contract', () => {
  it('normalizes safe profile fields and keeps email optional', () => {
    expect(
      UserRegistrationRequestSchema.parse({
        username: '  မြန်မာ_၁  ',
        phone: '09 123-456-789',
        location: '  Yangon  ',
        email: ' USER@Example.COM ',
      }),
    ).toEqual({
      username: 'မြန်မာ_၁',
      phone: '+959123456789',
      location: 'Yangon',
      email: 'user@example.com',
    });
    expect(
      UserRegistrationRequestSchema.parse({
        username: 'farmer_01',
        phone: '+959123456789',
        location: 'Bago',
        email: '   ',
      }),
    ).toEqual({
      username: 'farmer_01',
      phone: '+959123456789',
      location: 'Bago',
      email: undefined,
    });
  });

  it.each([
    { username: 'ab', phone: '09123456789', location: 'Yangon' },
    { username: 'farmer 1', phone: '09123456789', location: 'Yangon' },
    { username: 'farmer_1', phone: '12345', location: 'Yangon' },
    { username: 'farmer_1', phone: '00123456789', location: 'Yangon' },
    { username: 'farmer_1', phone: '+9509123456789', location: 'Yangon' },
    { username: 'farmer_1', phone: '09123456789', location: 'Y' },
    {
      username: 'farmer_1',
      phone: '09123456789',
      location: 'Yangon',
      email: 'not-an-email',
    },
    {
      username: 'farmer_1',
      phone: '09123456789',
      location: 'Yangon',
      password: 'must-not-be-accepted',
    },
    {
      username: 'farmer_1',
      phone: '09123456789',
      location: 'Yangon\nInjected',
    },
    { username: 'e\u0301e', phone: '09123456789', location: 'Yangon' },
    { username: '\ud801\udc00a', phone: '09123456789', location: 'Yangon' },
    { username: 'farmer_1', phone: '09123456789', location: 'e\u0301' },
    { username: 'farmer_1', phone: '09123456789', location: '\ud83d\ude00' },
    { username: 'farmer_1', phone: '09123456789', location: 'Yangon\u202e' },
  ])('rejects an invalid or unknown registration field set', (payload) => {
    expect(UserRegistrationRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe('POST /api/v1/users/register', () => {
  it('creates a profile without inventing a password, token, or authentication state', async () => {
    const store = new MemoryStore();
    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
      store,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/register',
      payload: {
        username: ' Farmer_01 ',
        phone: '09 123-456-789',
        location: ' Ayeyawaddy ',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        username: 'Farmer_01',
        phone: '+959123456789',
        location: 'Ayeyawaddy',
        email: null,
        created_at: '2026-08-09T00:00:00.000Z',
      },
    });
    expect(response.body).not.toMatch(/password|token|credential|secret/i);
    expect(store.users).toHaveLength(1);
    await app.close();
  });

  it('returns the same safe conflict response for username, phone, or email collisions', async () => {
    const store = new MemoryStore();
    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
      store,
    });
    const base = {
      username: 'Farmer_01',
      phone: '09 123-456-789',
      location: 'Yangon',
      email: 'farmer@example.com',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/users/register',
      payload: base,
    });
    expect(created.statusCode).toBe(201);

    const conflicts = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/users/register',
        payload: { ...base, username: 'farmer_01', phone: '09111111111', email: undefined },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/users/register',
        payload: {
          ...base,
          username: 'farmer_02',
          phone: '+959123456789',
          email: undefined,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/users/register',
        payload: { ...base, username: 'farmer_03', phone: '09222222222', email: 'FARMER@example.com' },
      }),
    ]);

    for (const conflict of conflicts) {
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'A user with those registration details already exists.',
        },
      });
      expect(conflict.body).not.toMatch(/username|phone|email/i);
    }
    expect(store.users).toHaveLength(1);
    await app.close();
  });

  it('validates strictly before persistence and respects public API authentication', async () => {
    const apiKey = 'public-registration-key-1234';
    const store = new MemoryStore();
    const app = await buildApp({
      config: testConfig({ apiKey }),
      modelServer: fakeModelServer(),
      store,
    });

    const unauthorized = await app.inject({
      method: 'POST',
      url: '/api/v1/users/register',
      payload: { username: 'farmer_1', phone: '09123456789', location: 'Yangon' },
    });
    expect(unauthorized.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/users/register',
      headers: { 'x-api-key': apiKey },
      payload: {
        username: 'farmer_1',
        phone: '09123456789',
        location: 'Yangon',
        password: 'not-supported',
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(store.users).toHaveLength(0);
    await app.close();
  });

  it('fails safely when PostgreSQL persistence is not configured', async () => {
    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/register',
      payload: { username: 'farmer_1', phone: '09123456789', location: 'Yangon' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'USER_REGISTRATION_UNAVAILABLE' },
    });
    await app.close();
  });
});
