import { describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../src/services/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('does not let a stale concurrent success close an opened circuit', () => {
    const breaker = new CircuitBreaker(1, 1_000);
    const failingPermit = breaker.beforeRequest();
    const staleSuccessPermit = breaker.beforeRequest();

    breaker.recordFailure(failingPermit);
    breaker.recordSuccess(staleSuccessPermit);

    expect(breaker.snapshot()).toEqual({ state: 'open', consecutive_failures: 1 });
    expect(() => breaker.beforeRequest()).toThrowError(
      expect.objectContaining({ code: 'MODEL_SERVER_CIRCUIT_OPEN' }),
    );
  });

  it('allows one half-open probe and closes only after its success', () => {
    let time = 1_000;
    const breaker = new CircuitBreaker(1, 500, () => time);
    const initial = breaker.beforeRequest();
    breaker.recordFailure(initial);
    time += 500;

    const probe = breaker.beforeRequest();
    expect(breaker.snapshot().state).toBe('half_open');
    expect(() => breaker.beforeRequest()).toThrowError(
      expect.objectContaining({ code: 'MODEL_SERVER_CIRCUIT_OPEN' }),
    );

    breaker.recordSuccess(probe);
    expect(breaker.snapshot()).toEqual({ state: 'closed', consecutive_failures: 0 });
  });

  it('reopens when the half-open probe fails', () => {
    let time = 1_000;
    const breaker = new CircuitBreaker(1, 500, () => time);
    breaker.recordFailure(breaker.beforeRequest());
    time += 500;
    breaker.recordFailure(breaker.beforeRequest());

    expect(breaker.snapshot()).toEqual({ state: 'open', consecutive_failures: 2 });
  });
});
