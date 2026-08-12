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

  protected get internalToken(): string {
    return this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
  }

  protected async legacyRequest<T extends JsonObject>(path: string, init: RequestInit, correlationId?: string, actorId?: string, timeoutMs?: number): Promise<T> {
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
  tool_name: 'restaurant.search' | 'restaurant.get' | 'restaurant.check_availability' | 'restaurant.create_hold' | 'restaurant.create_reservation';
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
      '/api/v1/ride-chat',
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

  chat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.user_id === 'string' ? payload.user_id : undefined;
    return this.legacyRequest<JsonObject>('/api/v1/chat', { method: 'POST', body: JSON.stringify(payload), headers: actorId ? { 'x-actor-id': actorId } : {} }, correlationId, actorId, 30000);
  }

  assistantChat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.user_id === 'string' ? payload.user_id : undefined;
    return this.legacyRequest<JsonObject>(
      '/api/v1/assistant-chat',
      { method: 'POST', body: JSON.stringify(payload), headers: actorId ? { 'x-actor-id': actorId } : {} },
      correlationId,
      actorId,
      30000,
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
  constructor(config: ConfigService) { super(config, 'RESTAURANT_SERVICE_URL'); }

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
      for (const key of ['location', 'cuisine_type', 'budget_range', 'limit', 'offset', 'query']) {
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

  get defaultPatientId(): number {
    return this.config.get<number>('HEALTHCARE_DEFAULT_PATIENT_ID', 1);
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

  patch(path: string, payload: JsonObject, correlationId: string, actorId?: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(path, { method: 'PATCH', body: JSON.stringify(payload) }, correlationId, actorId);
  }

  delete(path: string, correlationId: string, actorId?: string): Promise<JsonObject> {
    return this.legacyRequest<JsonObject>(path, { method: 'DELETE' }, correlationId, actorId);
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
