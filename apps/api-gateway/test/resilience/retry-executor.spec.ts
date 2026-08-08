import { operationProfile } from '../../src/resilience/operation-profile';
import {
  executeWithRetry,
  retryDelayMs,
  shouldRetry,
} from '../../src/resilience/retry-executor';
import { ServiceCallError } from '../../src/resilience/service-call-error';

function serviceError(overrides: Partial<ConstructorParameters<typeof ServiceCallError>[0]> = {}): ServiceCallError {
  return new ServiceCallError({
    service: 'ride-service',
    operation: 'ride.booking.prepare',
    contractVersion: 'v1',
    httpStatus: 503,
    code: 'DOWNSTREAM_UNAVAILABLE',
    detail: 'temporarily unavailable',
    category: 'TRANSIENT',
    retryable: true,
    retryAfterMs: null,
    outcome: 'AMBIGUOUS',
    ...overrides,
  });
}

describe('retry executor', () => {
  it('retries a bounded transient failure then returns the authoritative result', async () => {
    const delays: number[] = [];
    let attempts = 0;

    const result = await executeWithRetry(
      operationProfile('ride.quote.create'),
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw serviceError({ operation: 'ride.quote.create', outcome: 'NOT_SENT' });
        }
        return 'quote';
      },
      {
        now: () => 0,
        random: () => 0,
        sleep: async (delay) => {
          delays.push(delay);
        },
      },
    );

    expect(result).toBe('quote');
    expect(attempts).toBe(2);
    expect(delays).toEqual([250]);
  });

  it('does not retry a domain conflict', async () => {
    const profile = operationProfile('ride.booking.prepare');
    const conflict = serviceError({
      httpStatus: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      category: 'BUSINESS',
      retryable: false,
    });

    expect(shouldRetry(profile, conflict)).toBe(false);
    await expect(
      executeWithRetry(profile, async () => {
        throw conflict;
      }),
    ).rejects.toBe(conflict);
  });

  it('caps Retry-After and accepts a retryable internal 500 hint', () => {
    const profile = operationProfile('ride.booking.confirm');
    const retryable500 = serviceError({ httpStatus: 500, retryAfterMs: 9_000 });

    expect(shouldRetry(profile, retryable500)).toBe(true);
    expect(retryDelayMs(profile, retryable500, 1, () => 0.5)).toBe(2_000);
  });
});
