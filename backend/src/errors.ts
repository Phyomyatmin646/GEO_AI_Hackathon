import type { z } from 'zod';

type AppErrorOptions = ErrorOptions & { retryAfterSeconds?: number };

export class AppError extends Error {
  readonly retryAfterSeconds?: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly publicMessage: string,
    readonly countsTowardCircuit = false,
    options?: AppErrorOptions,
  ) {
    super(publicMessage, options);
    this.name = 'AppError';
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export class RequestValidationError extends AppError {
  readonly issues: Array<{ path: string; code: string; message: string }>;

  constructor(issues: z.core.$ZodIssue[]) {
    super(400, 'VALIDATION_ERROR', 'The request body is invalid.');
    this.name = 'RequestValidationError';
    this.issues = issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    }));
  }
}
