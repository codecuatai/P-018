import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

abstract class InternalServiceClient {
  constructor(protected readonly config: ConfigService, private readonly urlKey: string) {}

  get baseUrl(): string {
    return this.config.getOrThrow<string>(this.urlKey);
  }

  protected get internalToken(): string {
    return this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
  }
}

@Injectable()
export class AgentClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'AGENT_SERVICE_URL'); }

  async chat(input: { message: string; workflow_id: string; context: Record<string, unknown>; actor_id?: string; client_turn_id?: string }): Promise<AgentChatResult> {
    const response = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Token': this.internalToken,
        ...(input.actor_id ? { 'X-Actor-Id': input.actor_id } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Agent service error: ${response.status}`);
    return await response.json() as AgentChatResult;
  }
}
@Injectable()
export class RideClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RIDE_SERVICE_URL'); }
}
@Injectable()
export class RestaurantClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RESTAURANT_SERVICE_URL'); }

  async executeTool(tool: RestaurantTool, actorId: string, correlationId: string): Promise<unknown> {
    const headers: Record<string, string> = {
      'X-Internal-Service-Token': this.internalToken,
      'X-Actor-Id': actorId,
      'X-Correlation-Id': correlationId,
      'X-Workflow-Id': tool.workflow_id,
    };
    let url = `${this.baseUrl}/v1/restaurants`;
    let method = 'GET';
    let body: string | undefined;
    if (tool.tool_name === 'restaurant.get') {
      url += `/${encodeURIComponent(String(tool.arguments.restaurant_id))}`;
    } else if (tool.tool_name === 'restaurant.check_availability') {
      url += `/${encodeURIComponent(String(tool.arguments.restaurant_id))}/availability`;
      method = 'POST';
      headers['Content-Type'] = 'application/json';
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
      url += `?${query.toString()}`;
    } else if (tool.tool_name === 'restaurant.create_hold') {
      url = `${this.baseUrl}/v1/reservation-holds`;
      method = 'POST';
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`;
      body = JSON.stringify(tool.arguments);
    } else if (tool.tool_name === 'restaurant.create_reservation') {
      url = `${this.baseUrl}/v1/reservations`;
      method = 'POST';
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`;
      body = JSON.stringify(tool.arguments);
    } else {
      throw new Error(`Unsupported restaurant tool: ${tool.tool_name}`);
    }
    const response = await fetch(url, { method, headers, body });
    if (!response.ok) {
      let detail = `RESTAURANT_SERVICE_${response.status}`;
      try {
        const payload = await response.json() as { code?: string; detail?: string };
        detail = payload.code ?? payload.detail ?? detail;
      } catch {
        // Keep a safe status-based error when the service response is not JSON.
      }
      return { error: detail, status: response.status };
    }
    return await response.json();
  }
}

export interface AgentChatResult {
  data?: {
    response?: string;
    workflow_id?: string;
    intent?: string;
    slots?: Record<string, unknown>;
    tool_request?: RestaurantReadTool;
    status?: string;
  };
  response?: string;
  workflow_id: string;
  intent?: string;
  slots?: Record<string, unknown>;
  tool_request?: RestaurantReadTool;
  status?: string;
}

export interface RestaurantTool {
  tool_name: 'restaurant.search' | 'restaurant.get' | 'restaurant.check_availability' | 'restaurant.create_hold' | 'restaurant.create_reservation';
  risk_level: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  arguments: Record<string, unknown>;
  workflow_id: string;
  tool_call_id: string;
  idempotency_key?: string;
}

export type RestaurantReadTool = RestaurantTool;
@Injectable()
export class HealthcareClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'HEALTHCARE_SERVICE_URL'); }
}
@Injectable()
export class FoodClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'FOOD_SERVICE_URL'); }
}
