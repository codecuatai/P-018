import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { operationProfile, OperationProfile } from '../resilience/operation-profile';
import { executeWithRetry } from '../resilience/retry-executor';
import {
  classifyHttpStatus,
  parseRetryAfterMs,
  ServiceCallError,
  ServiceCallOutcome,
} from '../resilience/service-call-error';

export type JsonObject = Record<string, unknown>;


export class UpstreamClientError extends HttpException {
  constructor(public readonly code: string, public readonly retryable: boolean, message: string, status: number) {
    super({ code, detail: message, retryable }, status);
  }
}
export type AgentContext = {
  active_domain: 'ride' | 'restaurant' | 'healthcare' | 'food' | null;
  ride: {
    pickup_address: string | null;
    dropoff_address: string | null;
    vehicle_type: 'BIKE' | 'CAR_4' | 'CAR_7';
    passenger_count: number;
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
  status: 'QUOTE_CREATED' | 'AWAITING_CONFIRMATION' | 'CONSUMED' | 'EXPIRED';
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: 'BIKE' | 'CAR_4' | 'CAR_7';
  passenger_count: number;
  capacity_policy_version: string;
  distance_km: number;
  duration_minutes: number;
  amount: number;
  currency: string;
  tariff_version: string;
  quote_version: string;
  expires_at: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
  route_provider?: string;
  route_distance_meters?: number | null;
  route_duration_seconds?: number | null;
  route_polyline?: string | null;
  route_geometry?: Array<{ latitude: number; longitude: number }> | null;
  route_snapshot_hash?: string | null;
  tariff_snapshot?: Record<string, unknown> | null;
  stopovers?: Array<{ address: string; latitude: number; longitude: number }>;
};

export type RideBooking = {
  id: string;
  quote_id: string;
  quote_version: string;
  passenger_count: number;
  capacity_policy_version: string;
  amount: number;
  currency: string;
  status: 'AWAITING_CONFIRMATION' | 'AWAITING_PAYMENT_CONFIRMATION' | 'SEARCHING_DRIVER' | 'DRIVER_ASSIGNED' | 'DRIVER_TO_PICKUP' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'ARRIVED_DESTINATION' | 'COMPLETED' | 'NO_DRIVER' | 'FAILED' | 'PAYMENT_FAILED' | 'CANCELLED';
  resource_version: number;
  payment_reference: string | null;
  driver: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  driver_id?: string | null;
  tracking_started_at?: string | null;
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

const rideBookingCancelProfile: OperationProfile = {
  serviceId: 'ride-service',
  operationId: 'ride.booking.cancel',
  contractVersion: 'v1',
  risk: 'REVERSIBLE_WRITE',
  maxAttempts: 2,
  perAttemptTimeoutMs: 5_000,
  totalTimeoutMs: 11_000,
  retryableStatuses: [408, 429, 502, 503, 504],
  retryableDomainCodes: [],
  retryAfterCapMs: 2_000,
};

abstract class InternalServiceClient {
  constructor(
    protected readonly config: ConfigService,
    private readonly urlKey: string,
  ) {}

  get baseUrl(): string {
    return this.config.getOrThrow<string>(this.urlKey);
  }

  protected get internalToken(): string {
    return this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
  }

  protected async legacyRequest<T>(path: string, init: RequestInit, correlationId?: string, actorId?: string, timeoutMs?: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.config.get<number>('UPSTREAM_TIMEOUT_MS', 5000));
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-internal-service-token': this.internalToken,
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
          ...(actorId ? { 'x-actor-id': actorId } : {}),
          ...init.headers,
        },
      });
      const body = (await response.json().catch(() => ({}))) as JsonObject;
      if (!response.ok) {
        const detail = typeof body.detail === 'object' && body.detail !== null ? body.detail as JsonObject : body;
        const error = typeof detail.code === 'string' ? detail.code : typeof body.code === 'string' ? body.code : 'UPSTREAM_ERROR';
        const status = mapFoodErrorStatus(error, response.status);
        const message = typeof detail.detail === 'string' ? detail.detail : typeof detail.message === 'string' ? detail.message : 'Upstream request failed.';
        throw new UpstreamClientError(error, response.status >= 500 || status === 503, message, status);
      }
      return body.data as T;
    } catch (error) {
      if (error instanceof UpstreamClientError) throw error;
      throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', detail: 'Internal service is unavailable.', retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }

  async probeReady(path = '/health/ready', correlationId?: string, timeoutMs?: number): Promise<{ ok: boolean; status: number; body: JsonObject }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.config.get<number>('UPSTREAM_TIMEOUT_MS', 5000));
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-internal-service-token': this.internalToken,
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
      });
      if (response.status === 404 && path === '/health/ready') {
        // Fallback to /health/live if readiness endpoint is not supported on older deployment
        const liveRes = await fetch(`${this.baseUrl}/health/live`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'x-internal-service-token': this.internalToken,
            ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
          },
        }).catch(() => null);
        if (liveRes && liveRes.ok) {
          const liveBody = (await liveRes.json().catch(() => ({}))) as JsonObject;
          const liveData = typeof liveBody.data === 'object' && liveBody.data !== null ? (liveBody.data as JsonObject) : liveBody;
          return { ok: true, status: 200, body: { ...liveData, readiness_supported: false } };
        }
      }
      const body = (await response.json().catch(() => ({}))) as JsonObject;
      const data = typeof body.data === 'object' && body.data !== null ? (body.data as JsonObject) : body;
      return { ok: response.ok, status: response.status, body: data };
    } finally {
      clearTimeout(timeout);
    }
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

function mapFoodErrorStatus(code: string, upstreamStatus: number): number {
  const statuses: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, UNAUTHORIZED: 401, INVALID_OPTION: 422, CROSS_RESTAURANT_CART: 409, VOUCHER_INVALID: 422, VOUCHER_EXPIRED: 422, VOUCHER_NOT_APPLICABLE: 422, VOUCHER_USAGE_LIMIT: 409, DELIVERY_OUT_OF_RANGE: 422, CART_EMPTY: 422, CART_CHANGED: 409, PAYLOAD_MISMATCH: 409, IDEMPOTENCY_KEY_REUSED: 409, INVALID_ORDER_TRANSITION: 409, WORKFLOW_CONFLICT: 409, ORDER_NOT_CANCELLABLE: 409, UPSTREAM_UNAVAILABLE: 503, PAYMENT_TIMEOUT: 504, PAYMENT_FAILED: 409, PAYMENT_UNKNOWN: 409, PAYMENT_RECOVERY_PENDING: 409, PAYMENT_NOT_REFUNDABLE: 409, REFUND_PENDING: 409, REFUND_FAILED: 409, REFUND_UNKNOWN: 409, REFUND_AMOUNT_EXCEEDED: 409 };
  return statuses[code] ?? (upstreamStatus >= 500 ? 503 : upstreamStatus);
}

export interface RestaurantTool {
  tool_name: 'restaurant.search' | 'restaurant.get' | 'restaurant.check_availability' | 'restaurant.create_hold' | 'restaurant.cancel_hold' | 'restaurant.create_reservation';
  risk_level: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  arguments: Record<string, unknown>;
  workflow_id: string;
  tool_call_id: string;
  schema_version: string;
  idempotency_key?: string;
}

export interface HealthcareTool {
  tool_name: 'healthcare.list_departments' | 'healthcare.list_slots' | 'healthcare.hold_slot' | 'healthcare.confirm_appointment' | 'healthcare.cancel_appointment';
  risk_level: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  arguments: Record<string, unknown>;
  workflow_id: string;
  tool_call_id: string;
  schema_version: string;
  idempotency_key?: string;
}

export type RestaurantReadTool = RestaurantTool;
export type FoodCatalogResponse = JsonObject[] | JsonObject;

@Injectable()
export class AgentClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'AGENT_SERVICE_URL');
  }

  async live(correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/health/live', { method: 'GET' }, correlationId);
  }

  async ready(correlationId?: string): Promise<{ ok: boolean; status: number; body: JsonObject }> {
    return this.probeReady('/health/ready', correlationId);
  }

  async interpret(
    message: string,
    workflowId: string,
    context: AgentContext,
    callContext: ServiceCallContext,
    actorId: string,
  ): Promise<AgentDecision> {
    const payload = await this.request(
      '/api/v1/ride-chat',
      callContext,
      {
        method: 'POST',
        body: JSON.stringify({ message, workflow_id: workflowId, context }),
      },
      actorHeaders(actorId),
      operationProfile('agent.interpret'),
      (value) => parseAgentDecision(envelopeData(value)),
    );
    return payload;
  }

  chat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.user_id === 'string' ? payload.user_id : undefined;
    return this.legacyRequest<JsonObject>('/api/v1/chat', { method: 'POST', body: JSON.stringify(payload), headers: actorId ? { 'x-actor-id': actorId } : {} }, correlationId, actorId, 30000);
  }

  assistantChat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.user_id === 'string' ? payload.user_id : undefined;
    return this.request(
      '/api/v1/assistant-chat',
      {
        correlationId,
        workflowId: typeof payload.conversation_id === 'string' ? payload.conversation_id : undefined,
        toolCallId: 'assistant-chat',
      },
      { method: 'POST', body: JSON.stringify(payload) },
      actorId ? actorHeaders(actorId) : {},
      operationProfile('agent.assistant_chat'),
      (value) => asJsonObject(envelopeValue(value), 'Agent assistant chat'),
    );
  }

  restaurantChat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.actor_id === 'string' ? payload.actor_id : undefined;
    return this.legacyRequest<JsonObject>('/api/v1/restaurant-chat', { method: 'POST', body: JSON.stringify(payload), headers: actorId ? { 'x-actor-id': actorId } : {} }, correlationId, actorId, 30000);
  }

  healthcareChat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.actor_id === 'string' ? payload.actor_id : undefined;
    return this.legacyRequest<JsonObject>('/api/v1/healthcare-chat', { method: 'POST', body: JSON.stringify(payload), headers: actorId ? { 'x-actor-id': actorId } : {} }, correlationId, actorId, 30000);
  }
}
@Injectable()
export class RideClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'RIDE_SERVICE_URL');
  }

  async live(correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/health/live', { method: 'GET' }, correlationId);
  }

  async ready(correlationId?: string): Promise<{ ok: boolean; status: number; body: JsonObject }> {
    return this.probeReady('/health/ready', correlationId);
  }

  async opsSummary(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/v1/internal/ops/summary', { method: 'GET' }, correlationId); }
  async opsDatasetStatus(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/v1/internal/ops/dataset-status', { method: 'GET' }, correlationId); }
  async opsTransactions(correlationId: string, limit = 20, offset = 0): Promise<JsonObject> { return this.legacyRequest<JsonObject>(`/v1/internal/ops/transactions?limit=${limit}&offset=${offset}`, { method: 'GET' }, correlationId); }

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

  async getQuote(
    actorId: string,
    callContext: ServiceCallContext,
    quoteId: string,
  ): Promise<RideQuote> {
    return this.request(
      '/v1/quotes/' + encodeURIComponent(quoteId),
      callContext,
      { method: 'GET' },
      actorHeaders(actorId),
      operationProfile('ride.quote.get'),
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

  async cancelBooking(
    actorId: string,
    idempotencyKey: string,
    callContext: ServiceCallContext,
    bookingId: string,
    serializedBody: string,
  ): Promise<RideBooking> {
    return this.request(
      '/v1/bookings/' + encodeURIComponent(bookingId) + ':cancel',
      callContext,
      { method: 'POST', body: serializedBody },
      writeHeaders(actorId, idempotencyKey),
      rideBookingCancelProfile,
      (value) => parseBooking(envelopeData(value)),
    );
  }


  async updateBookingStatus(
    actorId: string,
    idempotencyKey: string,
    callContext: ServiceCallContext,
    bookingId: string,
    payload: JsonObject,
  ): Promise<RideBooking> {
    return this.request(
      '/v1/bookings/' + encodeURIComponent(bookingId) + ':status',
      callContext,
      { method: 'PATCH', body: JSON.stringify(payload) },
      writeHeaders(actorId, idempotencyKey),
      operationProfile('ride.booking.status.update'),
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

  async listBookings(actorId: string, callContext: ServiceCallContext): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/v1/bookings', { method: 'GET' }, callContext.correlationId, actorId);
  }

  async listQuotes(actorId: string, callContext: ServiceCallContext): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/v1/quotes', { method: 'GET' }, callContext.correlationId, actorId);
  }

  async getTracking(actorId: string, callContext: ServiceCallContext, bookingId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/v1/bookings/${encodeURIComponent(bookingId)}/tracking`, { method: 'GET' }, callContext.correlationId, actorId);
  }
}

@Injectable()
export class RestaurantClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RESTAURANT_SERVICE_URL'); }

  async live(correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/health/live', { method: 'GET' }, correlationId);
  }

  async ready(correlationId?: string): Promise<{ ok: boolean; status: number; body: JsonObject }> {
    return this.probeReady('/health/ready', correlationId);
  }

  async opsSummary(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/v1/internal/ops/summary', { method: 'GET' }, correlationId); }
  async opsDatasetStatus(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/v1/internal/ops/dataset-status', { method: 'GET' }, correlationId); }
  async opsTransactions(correlationId: string, limit = 20, offset = 0): Promise<JsonObject> { return this.legacyRequest<JsonObject>(`/v1/internal/ops/transactions?limit=${limit}&offset=${offset}`, { method: 'GET' }, correlationId); }

  async searchCatalog(filters: { location?: string; cuisineType?: string; budgetRange?: string; limit?: number }, correlationId: string): Promise<JsonObject> {
    const query = new URLSearchParams();
    if (filters.location) query.set('location', filters.location);
    if (filters.cuisineType) query.set('cuisine_type', filters.cuisineType);
    if (filters.budgetRange) query.set('budget_range', filters.budgetRange);
    query.set('limit', String(filters.limit ?? 8));
    return this.legacyRequest<JsonObject>(`/v1/restaurants?${query.toString()}`, { method: 'GET' }, correlationId);
  }

  async listReservations(actorId: string, correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/v1/reservations', { method: 'GET' }, correlationId, actorId);
  }

  async checkAvailability(actorId: string, correlationId: string, restaurantId: string, payload: JsonObject): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/v1/restaurants/${encodeURIComponent(restaurantId)}/availability`, { method: 'POST', body: JSON.stringify(payload) }, correlationId, actorId);
  }

  async createHold(actorId: string, correlationId: string, idempotencyKey: string, payload: JsonObject): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/v1/reservation-holds', { method: 'POST', body: JSON.stringify(payload), headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async createReservation(actorId: string, correlationId: string, idempotencyKey: string, payload: JsonObject): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/v1/reservations', { method: 'POST', body: JSON.stringify(payload), headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async cancelReservation(actorId: string, correlationId: string, idempotencyKey: string, reservationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/v1/reservations/${encodeURIComponent(reservationId)}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async listRestaurants(actorId: string, correlationId: string, keyword?: string, limit?: number, offset?: number): Promise<JsonObject> {
    const params = new URLSearchParams();
    if (keyword) params.set('q', keyword);
    if (limit !== undefined) params.set('limit', String(limit));
    if (offset !== undefined) params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.legacyRequest<JsonObject>(`/v1/restaurants${query}`, { method: 'GET' }, correlationId, actorId);
  }

  async getRestaurant(restaurantId: string, actorId: string, correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/v1/restaurants/${encodeURIComponent(restaurantId)}`, { method: 'GET' }, correlationId, actorId);
  }

  async getReservation(id: string, actorId: string, correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/v1/reservations/${encodeURIComponent(id)}`, { method: 'GET' }, correlationId, actorId);
  }

  async executeTool(tool: RestaurantTool, actorId: string, correlationId: string): Promise<unknown> {
    const context: ServiceCallContext = {
      correlationId,
      workflowId: tool.workflow_id,
      toolCallId: tool.tool_call_id,
    };
    let path = '/v1/restaurants';
    let method = 'GET';
    let body: string | undefined;
    let headers: Record<string, string> = actorHeaders(actorId);
    let profile = operationProfile('restaurant.search');
    if (tool.tool_name === 'restaurant.get') {
      path += `/${encodeURIComponent(String(tool.arguments.restaurant_id))}`;
      profile = operationProfile('restaurant.get');
    } else if (tool.tool_name === 'restaurant.check_availability') {
      path += `/${encodeURIComponent(String(tool.arguments.restaurant_id))}/availability`;
      method = 'POST';
      profile = operationProfile('restaurant.availability');
      body = JSON.stringify({
        party_size: tool.arguments.party_size,
        start_at: tool.arguments.start_at,
        duration_minutes: tool.arguments.duration_minutes ?? 120,
        seating_type: tool.arguments.seating_type,
      });
    } else if (tool.tool_name === 'restaurant.search') {
      const query = new URLSearchParams();
      for (const key of ['location', 'cuisine_type', 'budget_range', 'limit', 'offset']) {
        const value = tool.arguments[key];
        if (value !== undefined && value !== null) query.set(key, String(value));
      }
      path += `?${query.toString()}`;
    } else if (tool.tool_name === 'restaurant.create_hold') {
      path = '/v1/reservation-holds';
      method = 'POST';
      profile = operationProfile('restaurant.hold.create');
      headers = writeHeaders(actorId, tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`);
      body = JSON.stringify(tool.arguments);
    } else if (tool.tool_name === 'restaurant.cancel_hold') {
      path = `/v1/reservation-holds/${encodeURIComponent(String(tool.arguments.hold_id))}/cancel`;
      method = 'POST';
      profile = operationProfile('restaurant.hold.cancel');
      headers = writeHeaders(actorId, tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`);
    } else if (tool.tool_name === 'restaurant.create_reservation') {
      path = '/v1/reservations';
      method = 'POST';
      profile = operationProfile('restaurant.reservation.create');
      headers = writeHeaders(actorId, tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`);
      body = JSON.stringify(tool.arguments);
    } else {
      throw new Error(`Unsupported restaurant tool: ${tool.tool_name}`);
    }
    return this.request(path, context, { method, body }, headers, profile, envelopeValue);
  }

}

@Injectable()
export class HealthcareClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'HEALTHCARE_SERVICE_URL'); }

  async live(correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/health/live', { method: 'GET' }, correlationId);
  }

  async ready(correlationId?: string): Promise<{ ok: boolean; status: number; body: JsonObject }> {
    return this.probeReady('/health/ready', correlationId);
  }

  async opsSummary(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/api/v1/internal/ops/summary', { method: 'GET' }, correlationId); }
  async opsDatasetStatus(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/api/v1/internal/ops/dataset-status', { method: 'GET' }, correlationId); }
  async opsTransactions(correlationId: string, limit = 20, offset = 0): Promise<JsonObject> { return this.legacyRequest<JsonObject>(`/api/v1/internal/ops/transactions?limit=${limit}&offset=${offset}`, { method: 'GET' }, correlationId); }

  async listDepartmentsCatalog(correlationId: string): Promise<JsonObject[]> {
    return this.legacyRequest<JsonObject[]>('/api/v1/departments', { method: 'GET' }, correlationId);
  }

  async listAppointments(actorId: string, correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/api/v1/appointments', { method: 'GET' }, correlationId, actorId);
  }

  async listDepartments(actorId: string, correlationId: string, keyword?: string, limit?: number, offset?: number): Promise<JsonObject> {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (limit !== undefined) params.set('limit', String(limit));
    if (offset !== undefined) params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.legacyRequest<JsonObject>(`/api/v1/departments${query}`, { method: 'GET' }, correlationId, actorId);
  }

  async listDoctors(actorId: string, correlationId: string, department: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/doctors?department=${encodeURIComponent(department)}`, { method: 'GET' }, correlationId, actorId);
  }

  async holdSlot(actorId: string, correlationId: string, idempotencyKey: string, payload: JsonObject): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/api/v1/slots/hold', { method: 'POST', body: JSON.stringify(payload), headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async confirmAppointment(actorId: string, correlationId: string, idempotencyKey: string, appointmentId: number): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/appointments/${encodeURIComponent(String(appointmentId))}/confirm`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async cancelAppointment(actorId: string, correlationId: string, idempotencyKey: string, appointmentId: number): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/appointments/${encodeURIComponent(String(appointmentId))}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async getFacility(facilitySourceId: string, actorId: string, correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/facilities/${encodeURIComponent(facilitySourceId)}`, { method: 'GET' }, correlationId, actorId);
  }

  async listPatients(actorId: string, correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/api/v1/patients', { method: 'GET' }, correlationId, actorId);
  }

  async createPatient(actorId: string, correlationId: string, idempotencyKey: string, payload: JsonObject): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/api/v1/patients', { method: 'POST', body: JSON.stringify(payload), headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async setDefaultPatient(actorId: string, correlationId: string, idempotencyKey: string, patientId: number): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/patients/${encodeURIComponent(String(patientId))}/default`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async updatePatient(actorId: string, correlationId: string, idempotencyKey: string, patientId: number, payload: JsonObject): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/patients/${encodeURIComponent(String(patientId))}`, { method: 'PATCH', body: JSON.stringify(payload), headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  async unlinkPatient(actorId: string, correlationId: string, idempotencyKey: string, patientId: number): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(`/api/v1/patients/${encodeURIComponent(String(patientId))}`, { method: 'DELETE', headers: { 'Idempotency-Key': idempotencyKey } }, correlationId, actorId);
  }

  get defaultPatientId(): number {
    if (this.config.get<string>('APP_ENV') === 'production') {
      throw new ServiceUnavailableException({ code: 'PATIENT_LINK_REQUIRED', detail: 'A Healthcare patient link is required in production.' });
    }
    const configured = this.config.get<string>('HEALTHCARE_DEFAULT_PATIENT_ID');
    const patientId = Number(configured);
    if (!Number.isInteger(patientId) || patientId < 1) {
      throw new ServiceUnavailableException({ code: 'PATIENT_LINK_REQUIRED', detail: 'Chưa liên kết thông tin người bệnh cho tài khoản này.' });
    }
    return patientId;
  }

  async getAppointment(appointmentId: number, actorId: string, correlationId: string): Promise<JsonObject> {
    return this.request(
      `/api/v1/appointments/${encodeURIComponent(String(appointmentId))}`,
      { correlationId },
      { method: 'GET' },
      actorHeaders(actorId),
      operationProfile('healthcare.appointment.get'),
      (payload) => asJsonObject(envelopeValue(payload), 'Healthcare appointment'),
    );
  }

  async acknowledgePayment(appointmentId: number, actorId: string, correlationId: string, idempotencyKey: string): Promise<JsonObject> {
    return this.request(
      '/api/v1/payment/webhook',
      { correlationId },
      { method: 'POST', body: JSON.stringify({ appointment_id: appointmentId }) },
      writeHeaders(actorId, idempotencyKey),
      operationProfile('healthcare.payment.acknowledge'),
      (payload) => asJsonObject(envelopeValue(payload), 'Healthcare payment acknowledgement'),
    );
  }

  async executeTool(tool: HealthcareTool, actorId: string, correlationId: string, options: { allowFinal?: boolean } = {}): Promise<unknown> {
    if ((tool.risk_level === 'FINANCIAL_OR_FINAL' || tool.tool_name === 'healthcare.confirm_appointment') && !options.allowFinal) {
      throw new Error('CONFIRMATION_REQUIRED');
    }
    let path: string;
    let method = 'GET';
    let body: string | undefined;
    let headers: Record<string, string> = actorHeaders(actorId);
    let profile = operationProfile('healthcare.departments.list');
    if (tool.tool_name === 'healthcare.list_departments') {
      path = '/api/v1/departments';
    } else if (tool.tool_name === 'healthcare.list_slots') {
      const department = String(tool.arguments.department ?? '');
      path = `/api/v1/doctors?department=${encodeURIComponent(department)}`;
      profile = operationProfile('healthcare.doctors.list');
    } else if (tool.tool_name === 'healthcare.hold_slot') {
      path = '/api/v1/slots/hold';
      method = 'POST';
      profile = operationProfile('healthcare.hold.create');
      headers = writeHeaders(actorId, tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`);
      body = JSON.stringify(tool.arguments);
    } else if (tool.tool_name === 'healthcare.confirm_appointment') {
      path = `/api/v1/appointments/${encodeURIComponent(String(tool.arguments.appointment_id))}/confirm`;
      method = 'POST';
      profile = operationProfile('healthcare.appointment.confirm');
      headers = writeHeaders(actorId, tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`);
    } else if (tool.tool_name === 'healthcare.cancel_appointment') {
      path = `/api/v1/appointments/${encodeURIComponent(String(tool.arguments.appointment_id))}/cancel`;
      method = 'POST';
      profile = operationProfile('healthcare.appointment.cancel');
      headers = writeHeaders(actorId, tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`);
    } else {
      throw new Error(`Unsupported healthcare tool: ${tool.tool_name}`);
    }
    return this.request(
      path,
      { correlationId, workflowId: tool.workflow_id, toolCallId: tool.tool_call_id },
      { method, body },
      headers,
      profile,
      envelopeValue,
    );
  }
}

@Injectable()
export class FoodClient extends InternalServiceClient {
  constructor(config: ConfigService) {
    super(config, 'FOOD_SERVICE_URL');
  }

  async live(correlationId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/health/live', { method: 'GET' }, correlationId);
  }

  async ready(correlationId?: string): Promise<{ ok: boolean; status: number; body: JsonObject }> {
    return this.probeReady('/health/ready', correlationId);
  }

  async opsSummary(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/api/v1/internal/ops/summary', { method: 'GET' }, correlationId); }
  async opsDatasetStatus(correlationId: string): Promise<JsonObject> { return this.legacyRequest<JsonObject>('/api/v1/internal/ops/dataset-status', { method: 'GET' }, correlationId); }
  async opsTransactions(correlationId: string, limit = 20, offset = 0): Promise<JsonObject> { return this.legacyRequest<JsonObject>(`/api/v1/internal/ops/transactions?limit=${limit}&offset=${offset}`, { method: 'GET' }, correlationId); }

  get(path: string, correlationId: string, actorId?: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(path, { method: 'GET' }, correlationId, actorId);
  }

  post(path: string, payload: JsonObject, correlationId: string, idempotencyKey?: string, actorId?: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(
      path,
      { method: 'POST', body: JSON.stringify(payload), headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} },
      correlationId,
      actorId,
    );
  }

  patch(path: string, payload: JsonObject, correlationId: string, actorId?: string, idempotencyKey?: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(
      path,
      { method: 'PATCH', body: JSON.stringify(payload), headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} },
      correlationId,
      actorId,
    );
  }

  delete(path: string, correlationId: string, actorId?: string, idempotencyKey?: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(path, { method: 'DELETE', headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} }, correlationId, actorId);
  }

  async searchCatalog(filters: { keyword?: string; district?: string; category?: string; limit?: number }, correlationId: string): Promise<FoodCatalogResponse> {
    const query = new URLSearchParams({ keyword: filters.keyword ?? '', limit: String(filters.limit ?? 8) });
    if (filters.district) query.set('district', filters.district);
    if (filters.category) query.set('category', filters.category);
    return this.legacyRequest<FoodCatalogResponse>(`/api/v1/restaurants?${query.toString()}`, { method: 'GET' }, correlationId);
  }

  listOrders(correlationId: string, actorId: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>('/api/v1/orders', { method: 'GET' }, correlationId, actorId);
  }

  async createCart(actorId: string, correlationId: string, idempotencyKey: string, restaurantId: string): Promise<JsonObject> {
    return this.post('/api/v1/carts', { user_id: actorId, restaurant_id: restaurantId }, correlationId, idempotencyKey, actorId);
  }

  async getCart(actorId: string, correlationId: string, cartId: string): Promise<JsonObject> {
    return this.get(`/api/v1/carts/${encodeURIComponent(cartId)}`, correlationId, actorId);
  }

  async addCartItem(actorId: string, correlationId: string, cartId: string, payload: JsonObject, idempotencyKey: string): Promise<JsonObject> {
    return this.post(`/api/v1/carts/${encodeURIComponent(cartId)}/items`, payload, correlationId, idempotencyKey, actorId);
  }

  async updateCartItem(actorId: string, correlationId: string, cartId: string, cartItemId: string, payload: JsonObject, idempotencyKey: string): Promise<JsonObject> {
    return this.patch(`/api/v1/carts/${encodeURIComponent(cartId)}/items/${encodeURIComponent(cartItemId)}`, payload, correlationId, actorId, idempotencyKey);
  }

  async removeCartItem(actorId: string, correlationId: string, cartId: string, cartItemId: string, idempotencyKey: string): Promise<JsonObject> {
    return this.delete(`/api/v1/carts/${encodeURIComponent(cartId)}/items/${encodeURIComponent(cartItemId)}`, correlationId, actorId, idempotencyKey);
  }

  async applyVoucher(actorId: string, correlationId: string, cartId: string, code: string, idempotencyKey: string): Promise<JsonObject> {
    return this.post(`/api/v1/carts/${encodeURIComponent(cartId)}/voucher`, { code }, correlationId, idempotencyKey, actorId);
  }

  async removeVoucher(actorId: string, correlationId: string, cartId: string, idempotencyKey: string): Promise<JsonObject> {
    return this.delete(`/api/v1/carts/${encodeURIComponent(cartId)}/voucher`, correlationId, actorId, idempotencyKey);
  }

  async deliveryQuote(actorId: string, correlationId: string, payload: JsonObject): Promise<JsonObject> {
    return this.post('/api/v1/delivery/quote', payload, correlationId, undefined, actorId);
  }

  async previewOrder(actorId: string, correlationId: string, payload: JsonObject): Promise<JsonObject> {
    return this.post('/api/v1/orders/preview', payload, correlationId, undefined, actorId);
  }

  async getOrder(actorId: string, correlationId: string, orderId: string): Promise<JsonObject> {
    return this.get(`/api/v1/orders/${encodeURIComponent(orderId)}`, correlationId, actorId);
  }


  async updateOrderStatus(actorId: string, correlationId: string, orderId: string, payload: JsonObject, idempotencyKey?: string): Promise<JsonObject> {
    return this.patch(`/api/v1/orders/${encodeURIComponent(orderId)}:status`, payload, correlationId, actorId, idempotencyKey);
  }

  async getOrderTracking(actorId: string, correlationId: string, orderId: string): Promise<JsonObject> {
    return this.get(`/api/v1/orders/${encodeURIComponent(orderId)}/tracking`, correlationId, actorId);
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
  const nested = isRecord(problem.detail) ? problem.detail : {};
  const rawDetail = typeof problem.detail === 'string' ? problem.detail : typeof nested.detail === 'string' ? nested.detail : undefined;
  const code = typeof problem.code === 'string'
    ? problem.code
    : typeof nested.code === 'string'
      ? nested.code
      : rawDetail && /^[A-Z][A-Z0-9_]{2,}$/.test(rawDetail)
        ? rawDetail
        : 'DOWNSTREAM_HTTP_ERROR';
  const detail = rawDetail ?? 'Internal service request failed.';
  const retryableHint = problem.retryable === true || nested.retryable === true;
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

function envelopeValue(payload: unknown): unknown {
  if (!isRecord(payload) || !('data' in payload)) {
    throw new Error('Internal service returned an invalid envelope.');
  }

  return payload.data;
}

function asJsonObject(value: unknown, resource: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${resource} response is not an object.`);
  return value;
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
    || !['QUOTE_CREATED', 'AWAITING_CONFIRMATION', 'CONSUMED', 'EXPIRED'].includes(String(data.status))
    || typeof data.pickup_address !== 'string'
    || typeof data.dropoff_address !== 'string'
    || !['BIKE', 'CAR_4', 'CAR_7'].includes(String(data.vehicle_type))
    || typeof data.passenger_count !== 'number'
    || typeof data.capacity_policy_version !== 'string'
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
  const routeGeometry = Array.isArray(data.route_geometry)
    ? data.route_geometry.filter(isRecord).filter((point) => typeof point.latitude === 'number' && typeof point.longitude === 'number').map((point) => ({ latitude: point.latitude as number, longitude: point.longitude as number }))
    : undefined;
  return {
    id: data.id,
    status: data.status as RideQuote['status'],
    pickup_address: data.pickup_address,
    dropoff_address: data.dropoff_address,
    vehicle_type: data.vehicle_type as RideQuote['vehicle_type'],
    passenger_count: data.passenger_count,
    capacity_policy_version: data.capacity_policy_version,
    distance_km: data.distance_km,
    duration_minutes: data.duration_minutes,
    amount: data.amount,
    currency: data.currency,
    tariff_version: data.tariff_version,
    quote_version: data.quote_version,
    expires_at: data.expires_at,
    ...(typeof data.pickup_latitude === 'number' || data.pickup_latitude === null ? { pickup_latitude: data.pickup_latitude as number | null } : {}),
    ...(typeof data.pickup_longitude === 'number' || data.pickup_longitude === null ? { pickup_longitude: data.pickup_longitude as number | null } : {}),
    ...(typeof data.dropoff_latitude === 'number' || data.dropoff_latitude === null ? { dropoff_latitude: data.dropoff_latitude as number | null } : {}),
    ...(typeof data.dropoff_longitude === 'number' || data.dropoff_longitude === null ? { dropoff_longitude: data.dropoff_longitude as number | null } : {}),
    ...(typeof data.route_provider === 'string' ? { route_provider: data.route_provider } : {}),
    ...(typeof data.route_distance_meters === 'number' ? { route_distance_meters: data.route_distance_meters } : {}),
    ...(typeof data.route_duration_seconds === 'number' ? { route_duration_seconds: data.route_duration_seconds } : {}),
    ...(typeof data.route_polyline === 'string' || data.route_polyline === null ? { route_polyline: data.route_polyline as string | null } : {}),
    ...(routeGeometry ? { route_geometry: routeGeometry, route_polyline: typeof data.route_polyline === 'string' ? data.route_polyline : JSON.stringify(routeGeometry) } : {}),
    ...(typeof data.route_snapshot_hash === 'string' || data.route_snapshot_hash === null ? { route_snapshot_hash: data.route_snapshot_hash as string | null } : {}),
    ...(isRecord(data.tariff_snapshot) || data.tariff_snapshot === null ? { tariff_snapshot: data.tariff_snapshot as Record<string, unknown> | null } : {}),
    ...(Array.isArray(data.stopovers) ? {
      stopovers: data.stopovers.filter(isRecord).flatMap((stop) => (
        typeof stop.address === 'string' && typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
          ? [{ address: stop.address, latitude: stop.latitude, longitude: stop.longitude }]
          : []
      )),
    } : {}),
  };
}

function parseBooking(data: Record<string, unknown>): RideBooking {
  if (
    typeof data.id !== 'string'
    || typeof data.quote_id !== 'string'
    || typeof data.quote_version !== 'string'
    || typeof data.passenger_count !== 'number'
    || typeof data.capacity_policy_version !== 'string'
    || typeof data.amount !== 'number'
    || typeof data.currency !== 'string'
    || !['AWAITING_CONFIRMATION', 'AWAITING_PAYMENT_CONFIRMATION', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_TO_PICKUP', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'ARRIVED_DESTINATION', 'COMPLETED', 'NO_DRIVER', 'FAILED', 'PAYMENT_FAILED', 'CANCELLED'].includes(
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
    passenger_count: data.passenger_count,
    capacity_policy_version: data.capacity_policy_version,
    amount: data.amount,
    currency: data.currency,
    status: data.status as RideBooking['status'],
    resource_version: data.resource_version,
    payment_reference: data.payment_reference,
    driver: data.driver,
    created_at: data.created_at,
    updated_at: data.updated_at,
    ...(typeof data.driver_id === 'string' || data.driver_id === null ? { driver_id: data.driver_id as string | null } : {}),
    ...(typeof data.tracking_started_at === 'string' || data.tracking_started_at === null ? { tracking_started_at: data.tracking_started_at as string | null } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
