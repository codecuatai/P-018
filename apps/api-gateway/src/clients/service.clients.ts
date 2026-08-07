import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { operationProfile, OperationProfile } from '../resilience/operation-profile';
import { executeWithRetry } from '../resilience/retry-executor';
import {
  classifyHttpStatus,
  parseRetryAfterMs,
  ServiceCallError,
  ServiceCallOutcome,
} from '../resilience/service-call-error';

export type AgentContext = {
  active_domain: 'ride' | 'restaurant' | 'healthcare' | 'food' | null;
  ride: {
    pickup_address: string | null;
    dropoff_address: string | null;
    vehicle_type: 'BIKE' | 'CAR_4' | 'CAR_7';
    promo_code: string | null;
    latest_quote_id: string | null;
    latest_booking_id: string | null;
    quote_version: string | null;
    quote_amount: number | null;
    quote_currency: string | null;
    quote_expires_at: string | null;
    revision: number;
    pending_action: string | null;
  };
};

export type AgentDecision = {
  response: string;
  workflow_id: string;
  intent: string;
  missing_fields: string[];
  state_patch: {
    active_domain: AgentContext['active_domain'];
    slot_updates: Array<{ slot: string; value: string; source: 'user'; confidence: number }>;
    clear_fields: string[];
    revision: number;
    pending_action: string | null;
  };
  tool_request: {
    tool_name: string;
    risk_level: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
    arguments: Record<string, unknown>;
    workflow_id: string;
  } | null;
};

export type RideQuote = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: 'BIKE' | 'CAR_4' | 'CAR_7';
  distance_km: number;
  duration_minutes: number;
  amount: number;
  currency: string;
  tariff_version: string;
  quote_version: string;
  expires_at: string;
};

export type RideBooking = {
  id: string;
  quote_id: string;
  quote_version: string;
  amount: number;
  currency: string;
  status: 'AWAITING_PAYMENT_CONFIRMATION' | 'DRIVER_ASSIGNED' | 'CANCELLED';
  resource_version: number;
  payment_reference: string | null;
  driver: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ConfirmationEvidence = {
  confirmation_id: string;
  actor_id: string;
  action: string;
  payload_hash: string;
  quote_version: string;
  amount: number;
  currency: string;
  issued_at: string;
  expires_at: string;
};

export type ServiceCallContext = {
  correlationId: string;
  workflowId?: string;
  toolCallId?: string;
};

abstract class InternalServiceClient {
  constructor(
    protected readonly config: ConfigService,
    private readonly urlKey: string,
  ) {}

  get baseUrl(): string {
    return this.config.getOrThrow<string>(this.urlKey);
  }

  protected async request<T>(
    path: string,
    context: ServiceCallContext,
    init: RequestInit,
    domainHeaders: Record<string, string>,
    profile: OperationProfile,
    parse: (payload: unknown) => T,
  ): Promise<T> {
    const body = init.body;
    return executeWithRetry(profile, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), profile.perAttemptTimeoutMs);
      try {
        const response = await fetch(this.baseUrl + path, {
          ...init,
          body,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': context.correlationId,
            'X-Internal-Service-Token': this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN'),
            ...workflowHeaders(context),
            ...domainHeaders,
            ...(init.headers ?? {}),
          },
        });
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
          throw responseError(profile, response.status, response.headers.get('Retry-After'), payload);
        }
        try {
          return parse(payload);
        } catch (error) {
          if (error instanceof ServiceCallError) {
            throw error;
          }
          throw contractError(profile, 'Internal service returned an invalid response contract.');
        }
      } catch (error) {
        if (error instanceof ServiceCallError) {
          throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ServiceCallError({
            service: profile.serviceId,
            operation: profile.operationId,
            contractVersion: profile.contractVersion,
            httpStatus: null,
            code: 'DOWNSTREAM_TIMEOUT',
            detail: 'Internal service timed out.',
            category: 'TRANSIENT',
            retryable: true,
            retryAfterMs: null,
            outcome: outcomeForTransportFailure(profile),
          });
        }
        throw new ServiceCallError({
          service: profile.serviceId,
          operation: profile.operationId,
          contractVersion: profile.contractVersion,
          httpStatus: null,
          code: 'DOWNSTREAM_NETWORK',
          detail: 'Internal service is unavailable.',
          category: 'TRANSIENT',
          retryable: true,
          retryAfterMs: null,
          outcome: outcomeForTransportFailure(profile),
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}

@Injectable()
export class AgentClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'AGENT_SERVICE_URL');
  }

  async interpret(
    message: string,
    workflowId: string,
    context: AgentContext,
    callContext: ServiceCallContext,
  ): Promise<AgentDecision> {
    const payload = await this.request(
      '/api/v1/chat',
      callContext,
      {
        method: 'POST',
        body: JSON.stringify({ message, workflow_id: workflowId, context }),
      },
      {},
      operationProfile('agent.interpret'),
      (value) => parseAgentDecision(envelopeData(value)),
    );
    return payload;
  }
}

@Injectable()
export class RideClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'RIDE_SERVICE_URL');
  }

  async createQuote(
    actorId: string,
    idempotencyKey: string,
    callContext: ServiceCallContext,
    request: Record<string, unknown>,
  ): Promise<RideQuote> {
    return this.request(
      '/v1/quotes',
      callContext,
      { method: 'POST', body: JSON.stringify(request) },
      writeHeaders(actorId, idempotencyKey),
      operationProfile('ride.quote.create'),
      (value) => parseQuote(envelopeData(value)),
    );
  }

  async prepareBooking(
    actorId: string,
    idempotencyKey: string,
    callContext: ServiceCallContext,
    serializedBody: string,
  ): Promise<RideBooking> {
    return this.request(
      '/v1/bookings:prepare',
      callContext,
      { method: 'POST', body: serializedBody },
      writeHeaders(actorId, idempotencyKey),
      operationProfile('ride.booking.prepare'),
      (value) => parseBooking(envelopeData(value)),
    );
  }

  async confirmBooking(
    actorId: string,
    idempotencyKey: string,
    callContext: ServiceCallContext,
    bookingId: string,
    serializedBody: string,
  ): Promise<RideBooking> {
    return this.request(
      '/v1/bookings/' + encodeURIComponent(bookingId) + ':confirm',
      callContext,
      { method: 'POST', body: serializedBody },
      writeHeaders(actorId, idempotencyKey),
      operationProfile('ride.booking.confirm'),
      (value) => parseBooking(envelopeData(value)),
    );
  }

  async getBooking(
    actorId: string,
    callContext: ServiceCallContext,
    bookingId: string,
  ): Promise<RideBooking> {
    return this.request(
      '/v1/bookings/' + encodeURIComponent(bookingId),
      callContext,
      { method: 'GET' },
      actorHeaders(actorId),
      operationProfile('ride.booking.get'),
      (value) => parseBooking(envelopeData(value)),
    );
  }
}

@Injectable()
export class RestaurantClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'RESTAURANT_SERVICE_URL');
  }
}

@Injectable()
export class HealthcareClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'HEALTHCARE_SERVICE_URL');
  }
}

@Injectable()
export class FoodClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'FOOD_SERVICE_URL');
  }
}

function workflowHeaders(context: ServiceCallContext): Record<string, string> {
  return {
    ...(context.workflowId ? { 'X-Workflow-Id': context.workflowId } : {}),
    ...(context.toolCallId ? { 'X-Tool-Call-Id': context.toolCallId } : {}),
  };
}

function actorHeaders(actorId: string): Record<string, string> {
  return { 'X-Actor-Id': actorId };
}

function writeHeaders(actorId: string, idempotencyKey: string): Record<string, string> {
  return { ...actorHeaders(actorId), 'Idempotency-Key': idempotencyKey };
}

function responseError(
  profile: OperationProfile,
  status: number,
  retryAfterHeader: string | null,
  payload: unknown,
): ServiceCallError {
  const problem = isRecord(payload) ? payload : {};
  const code = typeof problem.code === 'string' ? problem.code : 'DOWNSTREAM_HTTP_ERROR';
  const detail = typeof problem.detail === 'string'
    ? problem.detail
    : 'Internal service request failed.';
  const retryableHint = problem.retryable === true;
  return new ServiceCallError({
    service: profile.serviceId,
    operation: profile.operationId,
    contractVersion: profile.contractVersion,
    httpStatus: status,
    code,
    detail,
    category: classifyHttpStatus(status),
    retryable: retryableHint,
    retryAfterMs: parseRetryAfterMs(retryAfterHeader),
    outcome: 'RESPONSE_RECEIVED',
  });
}

function contractError(profile: OperationProfile, detail: string): ServiceCallError {
  return new ServiceCallError({
    service: profile.serviceId,
    operation: profile.operationId,
    contractVersion: profile.contractVersion,
    httpStatus: null,
    code: 'DOWNSTREAM_CONTRACT_INVALID',
    detail,
    category: 'CONTRACT',
    retryable: false,
    retryAfterMs: null,
    outcome: 'RESPONSE_RECEIVED',
  });
}

function outcomeForTransportFailure(profile: OperationProfile): ServiceCallOutcome {
  return profile.risk === 'READ' ? 'NOT_SENT' : 'AMBIGUOUS';
}

function envelopeData(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('Internal service returned an invalid envelope.');
  }
  return payload.data;
}

function parseAgentDecision(data: Record<string, unknown>): AgentDecision {
  if (
    typeof data.response !== 'string'
    || typeof data.workflow_id !== 'string'
    || typeof data.intent !== 'string'
    || !Array.isArray(data.missing_fields)
    || !isRecord(data.state_patch)
  ) {
    throw new Error('Agent returned an invalid contract.');
  }
  return data as AgentDecision;
}

function parseQuote(data: Record<string, unknown>): RideQuote {
  if (
    typeof data.id !== 'string'
    || typeof data.pickup_address !== 'string'
    || typeof data.dropoff_address !== 'string'
    || !['BIKE', 'CAR_4', 'CAR_7'].includes(String(data.vehicle_type))
    || typeof data.distance_km !== 'number'
    || typeof data.duration_minutes !== 'number'
    || typeof data.amount !== 'number'
    || typeof data.currency !== 'string'
    || typeof data.tariff_version !== 'string'
    || typeof data.quote_version !== 'string'
    || typeof data.expires_at !== 'string'
  ) {
    throw new Error('Ride returned an invalid quote contract.');
  }
  return {
    id: data.id,
    pickup_address: data.pickup_address,
    dropoff_address: data.dropoff_address,
    vehicle_type: data.vehicle_type as RideQuote['vehicle_type'],
    distance_km: data.distance_km,
    duration_minutes: data.duration_minutes,
    amount: data.amount,
    currency: data.currency,
    tariff_version: data.tariff_version,
    quote_version: data.quote_version,
    expires_at: data.expires_at,
  };
}

function parseBooking(data: Record<string, unknown>): RideBooking {
  if (
    typeof data.id !== 'string'
    || typeof data.quote_id !== 'string'
    || typeof data.quote_version !== 'string'
    || typeof data.amount !== 'number'
    || typeof data.currency !== 'string'
    || !['AWAITING_PAYMENT_CONFIRMATION', 'DRIVER_ASSIGNED', 'CANCELLED'].includes(
      String(data.status),
    )
    || typeof data.resource_version !== 'number'
    || !(typeof data.payment_reference === 'string' || data.payment_reference === null)
    || !(isRecord(data.driver) || data.driver === null)
    || typeof data.created_at !== 'string'
    || typeof data.updated_at !== 'string'
  ) {
    throw new Error('Ride returned an invalid booking contract.');
  }
  return {
    id: data.id,
    quote_id: data.quote_id,
    quote_version: data.quote_version,
    amount: data.amount,
    currency: data.currency,
    status: data.status as RideBooking['status'],
    resource_version: data.resource_version,
    payment_reference: data.payment_reference,
    driver: data.driver,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
