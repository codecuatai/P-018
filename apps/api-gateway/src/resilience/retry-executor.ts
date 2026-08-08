import { OperationProfile } from './operation-profile';
import { ServiceCallError } from './service-call-error';

export type RetryDependencies = {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

const defaultDependencies: Required<RetryDependencies> = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: () => Math.random(),
};

export async function executeWithRetry<T>(
  profile: OperationProfile,
  operation: () => Promise<T>,
  dependencies: RetryDependencies = {},
): Promise<T> {
  const deps = { ...defaultDependencies, ...dependencies };
  const startedAt = deps.now();
  let lastError: ServiceCallError | undefined;

  for (let attempt = 1; attempt <= profile.maxAttempts; attempt += 1) {
    if (deps.now() - startedAt >= profile.totalTimeoutMs) {
      break;
    }
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ServiceCallError)) {
        throw error;
      }
      lastError = error;
      if (!shouldRetry(profile, error) || attempt === profile.maxAttempts) {
        throw error;
      }
      const delayMs = retryDelayMs(profile, error, attempt, deps.random);
      if (deps.now() - startedAt + delayMs >= profile.totalTimeoutMs) {
        throw error;
      }
      await deps.sleep(delayMs);
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Retry executor finished without an operation result for ' + profile.operationId + '.');
}

export function shouldRetry(profile: OperationProfile, error: ServiceCallError): boolean {
  if (error.category === 'CONTRACT' || error.category === 'BUSINESS' || error.category === 'CLIENT') {
    return false;
  }
  if (error.httpStatus !== null && profile.retryableStatuses.includes(error.httpStatus)) {
    return true;
  }
  if (
    error.category === 'TRANSIENT'
    && error.retryable
    && (error.httpStatus === null || error.httpStatus === 500)
  ) {
    return true;
  }
  return profile.retryableDomainCodes.includes(error.code);
}

export function retryDelayMs(
  profile: OperationProfile,
  error: ServiceCallError,
  attempt: number,
  random: () => number,
): number {
  if (error.retryAfterMs !== null) {
    return Math.min(error.retryAfterMs, profile.retryAfterCapMs);
  }
  const base = attempt === 1 ? 250 : 750;
  const jitter = Math.floor(random() * (attempt === 1 ? 150 : 250));
  return base + jitter;
}
