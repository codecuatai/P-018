export type ServiceId =
  | 'agent-service'
  | 'ride-service'
  | 'restaurant-service'
  | 'healthcare-service'
  | 'food-service';

export type ServiceErrorCategory =
  | 'TRANSIENT'
  | 'BUSINESS'
  | 'CLIENT'
  | 'CONTRACT'
  | 'UNKNOWN';

export type ServiceCallOutcome = 'NOT_SENT' | 'RESPONSE_RECEIVED' | 'AMBIGUOUS';

export type ServiceCallErrorInit = {
  service: ServiceId;
  operation: string;
  contractVersion: string;
  httpStatus: number | null;
  code: string;
  detail: string;
  category: ServiceErrorCategory;
  retryable: boolean;
  retryAfterMs: number | null;
  outcome: ServiceCallOutcome;
};

export class ServiceCallError extends Error {
  readonly service: ServiceId;
  readonly operation: string;
  readonly contractVersion: string;
  readonly httpStatus: number | null;
  readonly code: string;
  readonly category: ServiceErrorCategory;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly outcome: ServiceCallOutcome;

  constructor(init: ServiceCallErrorInit) {
    super(init.detail);
    this.name = 'ServiceCallError';
    this.service = init.service;
    this.operation = init.operation;
    this.contractVersion = init.contractVersion;
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.category = init.category;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.outcome = init.outcome;
  }

  withOutcome(outcome: ServiceCallOutcome, code = this.code): ServiceCallError {
    return new ServiceCallError({
      service: this.service,
      operation: this.operation,
      contractVersion: this.contractVersion,
      httpStatus: this.httpStatus,
      code,
      detail: this.message,
      category: this.category,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      outcome,
    });
  }
}

export function classifyHttpStatus(status: number): ServiceErrorCategory {
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return 'TRANSIENT';
  }
  if (status === 409) {
    return 'BUSINESS';
  }
  if (status >= 400 && status < 500) {
    return 'CLIENT';
  }
  return 'UNKNOWN';
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1_000);
  }
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - nowMs);
}
