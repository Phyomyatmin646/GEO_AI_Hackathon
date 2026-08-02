import { AppError } from '../errors.js';

export type CircuitState = 'closed' | 'open' | 'half_open';
export type CircuitPermit = Readonly<{ generation: number; halfOpen: boolean }>;

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenRequestInFlight = false;
  private generation = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  beforeRequest(): CircuitPermit {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.resetAfterMs) {
        throw new AppError(
          503,
          'MODEL_SERVER_CIRCUIT_OPEN',
          'The model service is temporarily unavailable.',
        );
      }
      this.state = 'half_open';
      this.halfOpenRequestInFlight = false;
    }

    if (this.state === 'half_open') {
      if (this.halfOpenRequestInFlight) {
        throw new AppError(
          503,
          'MODEL_SERVER_CIRCUIT_OPEN',
          'The model service is temporarily unavailable.',
        );
      }
      this.halfOpenRequestInFlight = true;
      return { generation: this.generation, halfOpen: true };
    }

    return { generation: this.generation, halfOpen: false };
  }

  recordSuccess(permit: CircuitPermit): void {
    if (permit.generation !== this.generation) return;
    if (permit.halfOpen) {
      if (this.state !== 'half_open') return;
      this.state = 'closed';
      this.consecutiveFailures = 0;
      this.openedAt = 0;
      this.halfOpenRequestInFlight = false;
      return;
    }
    if (this.state === 'closed') this.consecutiveFailures = 0;
  }

  recordFailure(permit: CircuitPermit): void {
    if (permit.generation !== this.generation) return;
    if (permit.halfOpen && this.state !== 'half_open') return;
    if (!permit.halfOpen && this.state !== 'closed') return;

    if (permit.halfOpen) this.halfOpenRequestInFlight = false;
    this.consecutiveFailures += 1;
    if (this.state === 'half_open' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
      this.generation += 1;
    }
  }

  snapshot(): { state: CircuitState; consecutive_failures: number } {
    return {
      state: this.state,
      consecutive_failures: this.consecutiveFailures,
    };
  }
}
