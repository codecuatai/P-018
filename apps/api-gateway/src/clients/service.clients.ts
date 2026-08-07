import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type JsonObject = Record<string, unknown>;

export class UpstreamClientError extends HttpException {
  constructor(public readonly code: string, public readonly retryable: boolean, message: string, status: number) {
    super({ code, detail: message, retryable }, status);
  }
}

abstract class InternalServiceClient {
  constructor(protected readonly config: ConfigService, private readonly urlKey: string) {}

  get baseUrl(): string {
    return this.config.getOrThrow<string>(this.urlKey);
  }

  protected async request<T extends JsonObject>(path: string, init: RequestInit, correlationId?: string, actorId?: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>('UPSTREAM_TIMEOUT_MS', 5000));
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-internal-service-token': this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN'),
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
      throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', detail: 'Food or agent service is unavailable.', retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function mapFoodErrorStatus(code: string, upstreamStatus: number): number {
  const statuses: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, UNAUTHORIZED: 401, INVALID_OPTION: 422, CROSS_RESTAURANT_CART: 409, VOUCHER_INVALID: 422, VOUCHER_EXPIRED: 422, VOUCHER_NOT_APPLICABLE: 422, VOUCHER_USAGE_LIMIT: 409, DELIVERY_OUT_OF_RANGE: 422, CART_EMPTY: 422, CART_CHANGED: 409, PAYLOAD_MISMATCH: 409, IDEMPOTENCY_KEY_REUSED: 409, INVALID_ORDER_TRANSITION: 409, WORKFLOW_CONFLICT: 409, ORDER_NOT_CANCELLABLE: 409, UPSTREAM_UNAVAILABLE: 503, PAYMENT_TIMEOUT: 504, PAYMENT_FAILED: 409, PAYMENT_UNKNOWN: 409, PAYMENT_RECOVERY_PENDING: 409, PAYMENT_NOT_REFUNDABLE: 409, REFUND_PENDING: 409, REFUND_FAILED: 409, REFUND_UNKNOWN: 409, REFUND_AMOUNT_EXCEEDED: 409 };
  return statuses[code] ?? (upstreamStatus >= 500 ? 503 : upstreamStatus);
}

@Injectable()
export class AgentClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'AGENT_SERVICE_URL'); }

  chat(payload: JsonObject, correlationId: string): Promise<JsonObject> {
    const actorId = typeof payload.user_id === 'string' ? payload.user_id : undefined;
    return this.request<JsonObject>('/api/v1/chat', { method: 'POST', body: JSON.stringify(payload), headers: actorId ? { 'x-actor-id': actorId } : {} }, correlationId);
  }
}

@Injectable()
export class FoodClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'FOOD_SERVICE_URL'); }

  get(path: string, correlationId: string, actorId?: string): Promise<JsonObject> {
    return this.request<JsonObject>(path, { method: 'GET' }, correlationId, actorId);
  }

  post(path: string, payload: JsonObject, correlationId: string, idempotencyKey?: string, actorId?: string): Promise<JsonObject> {
    return this.request<JsonObject>(path, { method: 'POST', body: JSON.stringify(payload), headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {} }, correlationId, actorId);
  }

  patch(path: string, payload: JsonObject, correlationId: string, actorId?: string): Promise<JsonObject> {
    return this.request<JsonObject>(path, { method: 'PATCH', body: JSON.stringify(payload) }, correlationId, actorId);
  }

  delete(path: string, correlationId: string, actorId?: string): Promise<JsonObject> {
    return this.request<JsonObject>(path, { method: 'DELETE' }, correlationId, actorId);
  }
}

@Injectable()
export class RideClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RIDE_SERVICE_URL'); }
}
@Injectable()
export class RestaurantClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RESTAURANT_SERVICE_URL'); }
}
@Injectable()
export class HealthcareClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'HEALTHCARE_SERVICE_URL'); }
}
