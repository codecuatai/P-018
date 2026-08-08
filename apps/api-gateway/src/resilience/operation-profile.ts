import { ServiceId } from './service-call-error';

export type OperationProfile = {
  serviceId: ServiceId;
  operationId: string;
  contractVersion: string;
  risk: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  maxAttempts: number;
  perAttemptTimeoutMs: number;
  totalTimeoutMs: number;
  retryableStatuses: readonly number[];
  retryableDomainCodes: readonly string[];
  retryAfterCapMs: number;
};

const profiles: Record<string, OperationProfile> = {
  'agent.interpret': {
    serviceId: 'agent-service',
    operationId: 'agent.interpret',
    contractVersion: 'v1',
    risk: 'READ',
    maxAttempts: 2,
    perAttemptTimeoutMs: 5_000,
    totalTimeoutMs: 11_000,
    retryableStatuses: [408, 429, 502, 503, 504],
    retryableDomainCodes: [],
    retryAfterCapMs: 2_000,
  },
  'ride.quote.create': {
    serviceId: 'ride-service',
    operationId: 'ride.quote.create',
    contractVersion: 'v1',
    risk: 'READ',
    maxAttempts: 3,
    perAttemptTimeoutMs: 5_000,
    totalTimeoutMs: 17_000,
    retryableStatuses: [408, 429, 502, 503, 504],
    retryableDomainCodes: [],
    retryAfterCapMs: 2_000,
  },
  'ride.booking.prepare': {
    serviceId: 'ride-service',
    operationId: 'ride.booking.prepare',
    contractVersion: 'v1',
    risk: 'REVERSIBLE_WRITE',
    maxAttempts: 2,
    perAttemptTimeoutMs: 5_000,
    totalTimeoutMs: 11_000,
    retryableStatuses: [408, 429, 502, 503, 504],
    retryableDomainCodes: [],
    retryAfterCapMs: 2_000,
  },
  'ride.booking.confirm': {
    serviceId: 'ride-service',
    operationId: 'ride.booking.confirm',
    contractVersion: 'v1',
    risk: 'FINANCIAL_OR_FINAL',
    maxAttempts: 2,
    perAttemptTimeoutMs: 5_000,
    totalTimeoutMs: 11_000,
    retryableStatuses: [408, 429, 502, 503, 504],
    retryableDomainCodes: [],
    retryAfterCapMs: 2_000,
  },
  'ride.booking.get': {
    serviceId: 'ride-service',
    operationId: 'ride.booking.get',
    contractVersion: 'v1',
    risk: 'READ',
    maxAttempts: 2,
    perAttemptTimeoutMs: 5_000,
    totalTimeoutMs: 11_000,
    retryableStatuses: [408, 429, 502, 503, 504],
    retryableDomainCodes: [],
    retryAfterCapMs: 2_000,
  },
};

export function operationProfile(operationId: string): OperationProfile {
  const profile = profiles[operationId];
  if (!profile) {
    throw new Error('No operation profile is registered for ' + operationId + '.');
  }
  return profile;
}
