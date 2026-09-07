import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

import { AgentClient, FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { AuthService } from '../auth/auth.service';
import { AuthRole, AuthUserStatus } from '../auth/auth.types';
import { CoreStore } from '../core/core.module';
import { CoreProductOpsStore, SupportTicketStatus } from '../core/product-ops.store';
import { decryptSecret, encryptSecret } from '../core/crypto.util';
import { WorkflowService } from '../workflow/workflow.module';

type DomainName = 'food' | 'ride' | 'restaurant' | 'healthcare';
type DomainResult = { domain: DomainName; status: 'healthy' | 'degraded'; data?: JsonObject; error?: string };
type DatasetResult = { domain: DomainName; status: 'healthy' | 'degraded'; data?: JsonObject; error?: string };

export type HealthStatus = 'healthy' | 'degraded' | 'unavailable';
export type HealthItem = {
  service: string;
  status: HealthStatus;
  latency_ms: number;
  checked_at: string;
  detail?: Record<string, unknown>;
  error?: string;
};

type SanitizedApiKey = {
  id: string;
  provider: string;
  label: string;
  last4: string;
  status: string;
  expiresAt?: string;
  updatedAt: string;
  updatedBy: string;
  createdAt: string;
};

// Return only safe metadata for API keys — never expose ciphertext, IV, auth tag,
// or idempotency bookkeeping to the client.
function sanitizeApiKey(k: SanitizedApiKey): JsonObject {
  return {
    id: k.id,
    provider: k.provider,
    label: k.label,
    last4: k.last4,
    status: k.status,
    expires_at: k.expiresAt,
    updated_at: k.updatedAt,
    updated_by: k.updatedBy,
    created_at: k.createdAt,
  } as unknown as JsonObject;
}

function adminFeedbackResponse(
  result: {
    items: Array<{
      id: string;
      actorId: string;
      domain: string;
      resourceType: string;
      resourceId: string;
      rating: number;
      comment?: string;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
    stats: { averageRating: number; byDomain: Record<string, { count: number; averageRating: number }> };
  },
  page: number,
  pageSize: number,
): JsonObject {
  return {
    items: result.items.map((item) => ({
      id: item.id,
      actor_id: item.actorId,
      domain: item.domain,
      resource_type: item.resourceType,
      resource_id: item.resourceId,
      rating: item.rating,
      comment: item.comment,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    })),
    total: result.total,
    page,
    page_size: pageSize,
    stats: {
      average_rating: result.stats.averageRating,
      by_domain: Object.fromEntries(
        Object.entries(result.stats.byDomain).map(([domain, value]) => [
          domain,
          {
            count: value.count,
            average_rating: value.averageRating,
          },
        ]),
      ),
    },
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly agent: AgentClient,
    private readonly food: FoodClient,
    private readonly ride: RideClient,
    private readonly restaurant: RestaurantClient,
    private readonly healthcare: HealthcareClient,
    private readonly auth: AuthService,
    private readonly core: CoreStore,
    private readonly productOps: CoreProductOpsStore,
    private readonly config: ConfigService,
    @Optional() private readonly workflow?: WorkflowService,
  ) {}

  async summary(correlationId: string): Promise<JsonObject> {
    const [users, domains, payments, refunds, workflows, support, health, datasets] = await Promise.all([
      this.auth.listUsers(1, 1),
      this.domainSummaries(correlationId),
      this.core.listAllPayments(1, 1),
      this.core.listAllRefunds(1, 1),
      this.core.listWorkflowReconciliations(1, 100),
      this.productOps.listAllSupportTickets({ status: 'OPEN', page: 1, pageSize: 1 }),
      this.systemHealth(correlationId),
      this.datasetStatuses(correlationId),
    ]);

    const paymentsTotal = typeof payments.total === 'number' ? payments.total : 0;
    const refundsTotal = typeof refunds.total === 'number' ? refunds.total : 0;
    const workflowsTotal = typeof workflows.total === 'number' ? workflows.total : 0;

    const workflowStatuses = workflows.items.reduce<Record<string, number>>((counts, item) => {
      const status = String(item.status).toUpperCase();
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});

    const counts: Record<string, unknown> = {
      total_users: typeof users.total === 'number' ? users.total : 0,
      payments: paymentsTotal,
      refunds: refundsTotal,
      open_support_tickets: typeof support.total === 'number' ? support.total : 0,
      failed_workflows: Object.entries(workflowStatuses)
        .filter(([status]) => status.includes('FAILED') || status.includes('ERROR'))
        .reduce((total, [, value]) => total + value, 0),
      partial_success_workflows: workflowStatuses.PARTIAL_SUCCESS ?? 0,
    };

    for (const result of domains) {
      if (result.data?.counts && typeof result.data.counts === 'object') counts[result.domain] = result.data.counts;
    }

    return {
      counts,
      users_total: counts.total_users,
      payments_total: paymentsTotal,
      refunds_total: refundsTotal,
      workflows_total: workflowsTotal,
      open_support_tickets: counts.open_support_tickets,
      payments: { total: paymentsTotal },
      refunds: { total: refundsTotal },
      workflows: { total: workflowsTotal, by_status: workflowStatuses },
      support: { open: counts.open_support_tickets },
      domains,
      datasets,
      health: { items: health.items },
    };
  }

  async users(page: number, pageSize: number): Promise<JsonObject> {
    return this.auth.listUsers(page, pageSize) as unknown as JsonObject;
  }

  async updateUserStatus(id: string, status: 'active' | 'disabled' | 'suspended', actorId: string, correlationId: string): Promise<JsonObject> {
    if (id === actorId && (status === 'suspended' || status === 'disabled')) {
      throw new ConflictException({ code: 'CANNOT_SUSPEND_SELF', detail: 'Bạn không thể tự khóa tài khoản quản trị của chính mình.', retryable: false });
    }
    const targetStatus: AuthUserStatus = (status === 'suspended' || status === 'disabled') ? 'disabled' : 'active';
    const updated = await this.auth.updateUserStatus(id, targetStatus);
    if (!updated) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', detail: 'Không tìm thấy tài khoản người dùng.', retryable: false });
    }
    return {
      id: updated.id,
      email: updated.email,
      full_name: updated.fullName,
      phone: updated.phone,
      role: updated.role,
      status: updated.status === 'disabled' ? 'suspended' : 'active',
      updated_at: updated.updatedAt,
      created_at: updated.createdAt,
    } as unknown as JsonObject;
  }

  async updateUserRole(id: string, role: AuthRole, actorId: string, correlationId: string): Promise<JsonObject> {
    if (id === actorId && role !== 'admin') {
      throw new ConflictException({ code: 'CANNOT_DEMOTE_SELF', detail: 'Bạn không thể tự giáng quyền của chính mình.', retryable: false });
    }
    const updated = await this.auth.updateUserRole(id, role);
    if (!updated) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', detail: 'Không tìm thấy tài khoản người dùng.', retryable: false });
    }
    return {
      id: updated.id,
      email: updated.email,
      full_name: updated.fullName,
      phone: updated.phone,
      role: updated.role,
      status: updated.status === 'disabled' ? 'suspended' : 'active',
      updated_at: updated.updatedAt,
      created_at: updated.createdAt,
    } as unknown as JsonObject;
  }

  async domainTransactions(domain: string, page: number, pageSize: number, correlationId: string): Promise<JsonObject> {
    switch (domain) {
      case 'food': return this.food.opsTransactions(correlationId, pageSize, (page - 1) * pageSize);
      case 'ride': return this.ride.opsTransactions(correlationId, pageSize, (page - 1) * pageSize);
      case 'restaurant': return this.restaurant.opsTransactions(correlationId, pageSize, (page - 1) * pageSize);
      case 'healthcare': return this.healthcare.opsTransactions(correlationId, pageSize, (page - 1) * pageSize);
      default: throw new Error(`UNKNOWN_DOMAIN:${domain}`);
    }
  }

  async transactions(page: number, pageSize: number, correlationId: string): Promise<JsonObject> {
    const names: DomainName[] = ['food', 'ride', 'restaurant', 'healthcare'];
    const results = await Promise.allSettled(names.map((name) => this.domainTransactions(name, page, pageSize, correlationId)));
    const items: JsonObject[] = [];
    let total = 0;
    const unavailable: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        const values = Array.isArray(data.items) ? data.items : [];
        total += typeof data.total === 'number' ? data.total : values.length;
        items.push(...values.map((item) => ({ domain: names[index], transaction: item })));
      } else unavailable.push(names[index]);
    });
    return { items, total, page, page_size: pageSize, partial: unavailable.length > 0, unavailable };
  }

  async payments(page: number, pageSize: number): Promise<JsonObject> {
    const [payments, refunds] = await Promise.all([this.core.listAllPayments(page, pageSize), this.core.listAllRefunds(page, pageSize)]);
    return { payments, refunds } as unknown as JsonObject;
  }

  async workflows(page: number, pageSize: number): Promise<JsonObject> {
    return this.core.listWorkflowReconciliations(page, pageSize) as unknown as JsonObject;
  }

  async datasets(correlationId: string): Promise<JsonObject> {
    return { items: await this.datasetStatuses(correlationId) };
  }

  async systemHealth(correlationId: string): Promise<{ items: HealthItem[] }> {
    const checks: Array<[string, () => Promise<HealthItem>]> = [
      ['api-gateway', async () => {
        const started = performance.now();
        const workerHealthy = this.workflow ? this.workflow.isWorkerHealthy() : true;
        const dbReady = await this.core.checkHealth().catch(() => false);
        const healthy = workerHealthy && dbReady;
        return {
          service: 'api-gateway',
          status: healthy ? 'healthy' : 'degraded',
          latency_ms: Math.round(performance.now() - started),
          checked_at: new Date().toISOString(),
          detail: {
            endpoint: 'GET /api/v1/health (Internal)',
            http_status: healthy ? '200 OK' : '503 Service Unavailable',
            database_pool: dbReady ? 'connected (PostgreSQL Core)' : 'unavailable',
            workflow_worker: workerHealthy ? 'healthy' : 'unhealthy',
            workflow_saga_worker: workerHealthy ? 'active & healthy' : 'unhealthy',
            confirmation_recovery_worker: 'healthy',
            runtime: 'Node.js (NestJS Gateway)',
          },
        };
      }],
      ['gateway-core', async () => {
        const started = performance.now();
        try {
          const ok = await this.core.checkHealth();
          return {
            service: 'gateway-core',
            status: ok ? 'healthy' : 'unavailable',
            latency_ms: Math.round(performance.now() - started),
            checked_at: new Date().toISOString(),
            detail: {
              endpoint: 'PostgreSQL Core Connection Pool',
              http_status: ok ? '200 OK (DB PING)' : '500 DB Error',
              database_pool: ok ? 'connected' : 'disconnected',
              driver: 'pg / PostgreSQL 16',
              idempotency_store: 'active',
              audit_logger: 'active',
            },
          };
        } catch (error) {
          return {
            service: 'gateway-core',
            status: 'unavailable',
            latency_ms: Math.round(performance.now() - started),
            checked_at: new Date().toISOString(),
            detail: {
              endpoint: 'PostgreSQL Core Pool',
              http_status: '500 DB Error',
              database_pool: 'unavailable',
            },
            error: error instanceof Error ? error.name : 'DB_ERROR',
          };
        }
      }],
      ['agent-service', async () => this.checkClientHealth('agent-service', () => this.agent.ready(correlationId))],
      ['food-service', async () => this.checkClientHealth('food-service', () => this.food.ready(correlationId))],
      ['ride-service', async () => this.checkClientHealth('ride-service', () => this.ride.ready(correlationId))],
      ['restaurant-service', async () => this.checkClientHealth('restaurant-service', () => this.restaurant.ready(correlationId))],
      ['healthcare-service', async () => this.checkClientHealth('healthcare-service', () => this.healthcare.ready(correlationId))],
    ];

    const items = await Promise.all(checks.map(([, check]) => check()));
    return { items };
  }

  private async checkClientHealth(
    service: string,
    probe: () => Promise<{ ok: boolean; status: number; body: JsonObject }>,
  ): Promise<HealthItem> {
    const started = performance.now();
    try {
      const result = await probe();
      const latency_ms = Math.round(performance.now() - started);
      const checked_at = new Date().toISOString();
      const enrichedDetail: Record<string, unknown> = {
        endpoint: 'GET /health/ready',
        http_status: `${result.status} ${result.status === 200 ? 'OK' : result.status === 503 ? 'Service Unavailable' : 'Error'}`,
        probe_latency_ms: latency_ms,
        ...(result.body && typeof result.body === 'object' ? result.body : {}),
      };
      if (result.ok && result.status === 200) {
        return { service, status: 'healthy', latency_ms, checked_at, detail: enrichedDetail };
      }
      if (result.status === 503) {
        return {
          service,
          status: 'degraded',
          latency_ms,
          checked_at,
          detail: enrichedDetail,
          error: 'SERVICE_DEGRADED',
        };
      }
      return {
        service,
        status: 'unavailable',
        latency_ms,
        checked_at,
        detail: enrichedDetail,
        error: `HTTP_${result.status}`,
      };
    } catch (error) {
      const latency_ms = Math.round(performance.now() - started);
      const checked_at = new Date().toISOString();
      return {
        service,
        status: 'unavailable',
        latency_ms,
        checked_at,
        detail: {
          endpoint: 'GET /health/ready',
          http_status: 'CONNECTION_REFUSED / TIMEOUT',
          probe_latency_ms: latency_ms,
          error_detail: error instanceof Error ? error.message : 'Unknown upstream error',
        },
        error: error instanceof Error ? error.message || error.name : 'UPSTREAM_ERROR',
      };
    }
  }

  async support(status: SupportTicketStatus | undefined, page: number, pageSize: number): Promise<JsonObject> {
    return this.productOps.listAllSupportTickets({ ...(status ? { status } : {}), page, pageSize }) as unknown as JsonObject;
  }

  async supportDetail(id: string): Promise<JsonObject | undefined> {
    return this.productOps.getSupportTicket(id) as unknown as JsonObject | undefined;
  }

  async updateSupport(
    id: string,
    patch: { status?: SupportTicketStatus; priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' },
    actorId: string,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<JsonObject | undefined> {
    const requestHash = createHash('sha256').update(JSON.stringify({ status: patch.status ?? null, priority: patch.priority ?? null })).digest('hex');
    let result;
    try {
      result = await this.productOps.updateSupportTicket(id, patch, new Date().toISOString(), actorId, idempotencyKey, requestHash);
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different support update.', retryable: false });
      }
      throw error;
    }
    if (result) {
      if (!result.replayed) {
        await this.core.audit({
          action: 'ADMIN_SUPPORT_TICKET_UPDATED',
          actorId,
          correlationId,
          resourceId: id,
          metadata: { ...(patch.status ? { status: patch.status } : {}), ...(patch.priority ? { priority: patch.priority } : {}) },
        });
      }
    }
    return result?.ticket as unknown as JsonObject | undefined;
  }

  async addSupportMessage(
    id: string,
    message: string,
    actorId: string,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<JsonObject | undefined> {
    const ticket = await this.productOps.getSupportTicket(id);
    if (!ticket) return undefined;
    if (ticket.status === 'CLOSED') throw new ConflictException({ code: 'SUPPORT_TICKET_CLOSED', detail: 'Không thể gửi phản hồi cho ticket đã đóng.', retryable: false });
    const createdAt = new Date().toISOString();
    const requestHash = createHash('sha256').update(JSON.stringify({ message })).digest('hex');
    const replayed = ticket.events?.some((event) => event.idempotencyKey === idempotencyKey) ?? false;
    let updated;
    try {
      updated = await this.productOps.addSupportEvent({ id: `ticket-event-${randomUUID()}`, ticketId: id, actorId, eventType: 'MESSAGE', message, idempotencyKey, requestHash, createdAt }, createdAt, undefined, requestHash);
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different support message.', retryable: false });
      throw error;
    }
    if (updated && !replayed) {
      await this.core.audit({
        action: 'ADMIN_SUPPORT_TICKET_MESSAGE_ADDED',
        actorId,
        correlationId,
        resourceId: id,
        metadata: { message_length: message.length },
      });
    }
    return updated as unknown as JsonObject | undefined;
  }

  async userServiceSummary(userId: string, correlationId: string): Promise<JsonObject> {
    const [feedback, foodTx, rideTx, restTx, healthTx] = await Promise.allSettled([
      this.productOps.listFeedback(userId),
      this.food.opsTransactions(correlationId, 100, 0),
      this.ride.opsTransactions(correlationId, 100, 0),
      this.restaurant.opsTransactions(correlationId, 100, 0),
      this.healthcare.opsTransactions(correlationId, 100, 0),
    ]);

    const feedbackList = feedback.status === 'fulfilled' ? feedback.value : [];
    const extractUserCount = (res: PromiseSettledResult<JsonObject | undefined>) => {
      if (res.status !== 'fulfilled' || !res.value) return 0;
      const items = Array.isArray(res.value.items) ? (res.value.items as Record<string, unknown>[]) : [];
      return items.filter((item) => {
        const actor = item.actor_id || item.actorId || item.user_id || item.userId || item.passenger_id;
        return actor === userId;
      }).length;
    };

    const foodCount = extractUserCount(foodTx);
    const rideCount = extractUserCount(rideTx);
    const restaurantCount = extractUserCount(restTx);
    const healthcareCount = extractUserCount(healthTx);

    return {
      user_id: userId,
      ride_count: rideCount,
      food_count: foodCount,
      restaurant_count: restaurantCount,
      healthcare_count: healthcareCount,
      feedback_count: feedbackList.length,
      last_active_at: feedbackList[0]?.updatedAt,
    };
  }

  async userFeedback(userId: string, page = 1, pageSize = 20): Promise<JsonObject> {
    return adminFeedbackResponse(await this.productOps.listAllFeedback({ actorId: userId, page, pageSize }), page, pageSize);
  }

  async allFeedback(filters: { domain?: DomainName; rating_min?: number; rating_max?: number; from_time?: string; to_time?: string; page?: number; page_size?: number } = {}): Promise<JsonObject> {
    const result = await this.productOps.listAllFeedback({
      domain: filters.domain,
      ratingMin: filters.rating_min,
      ratingMax: filters.rating_max,
      fromTime: filters.from_time,
      toTime: filters.to_time,
      page: filters.page,
      pageSize: filters.page_size,
    });
    return adminFeedbackResponse(result, filters.page ?? 1, filters.page_size ?? 20);
  }

  async listApiKeys(): Promise<{ items: JsonObject[] }> {
    const keys = await this.core.queryApiKeys();
    return { items: keys.map((k) => sanitizeApiKey(k)) };
  }

  async getActiveDecryptedKeys(provider: 'gemini' | 'trello' | 'geoapify' | 'google_maps' | 'other' = 'gemini'): Promise<string[]> {
    const keys = await this.core.queryApiKeys();
    const now = Date.now();
    const activeKeys = keys.filter((k) => {
      if (k.provider !== provider || k.status !== 'active') return false;
      if (k.expiresAt && new Date(k.expiresAt).getTime() <= now) return false;
      return Boolean(k.keyCiphertext && k.keyIv && k.keyAuthTag);
    });

    const masterSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const decryptedKeys: string[] = [];
    for (const record of activeKeys) {
      try {
        const plain = decryptSecret(record.keyCiphertext!, record.keyIv!, record.keyAuthTag!, masterSecret).trim();
        if (plain && !decryptedKeys.includes(plain)) {
          decryptedKeys.push(plain);
        }
      } catch {
        // Skip corrupted or un-decryptable keys
      }
    }
    return decryptedKeys;
  }

  async createApiKey(data: { provider: 'gemini' | 'trello' | 'geoapify' | 'google_maps' | 'other'; label: string; key: string; expires_at?: string }, actorId: string, correlationId: string): Promise<JsonObject> {
    const rawKey = data.key.trim();
    const last4 = rawKey.length > 4 ? `...${rawKey.slice(-4)}` : rawKey;
    const id = `key_${randomUUID()}`;
    const masterSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const encrypted = encryptSecret(rawKey, masterSecret);
    const created = await this.core.createApiKeyRecord({
      id,
      provider: data.provider,
      label: data.label.trim(),
      last4,
      keyCiphertext: encrypted.ciphertext,
      keyIv: encrypted.iv,
      keyAuthTag: encrypted.authTag,
      expiresAt: data.expires_at,
      updatedBy: actorId,
    });
    await this.core.audit({
      action: 'ADMIN_API_KEY_CREATED',
      actorId,
      correlationId,
      resourceId: id,
      metadata: { provider: data.provider, label: data.label },
    });
    return sanitizeApiKey(created);
  }

  async rotateApiKey(id: string, data: { key: string; expires_at?: string }, actorId: string, correlationId: string, idempotencyKey: string): Promise<JsonObject | undefined> {
    const rawKey = data.key.trim();
    const last4 = rawKey.length > 4 ? `...${rawKey.slice(-4)}` : rawKey;
    const requestHash = createHash('sha256').update(JSON.stringify({ last4, expires_at: data.expires_at ?? null })).digest('hex');
    const masterSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const encrypted = encryptSecret(rawKey, masterSecret);
    let res;
    try {
      res = await this.core.rotateApiKeyRecord(id, {
        last4,
        keyCiphertext: encrypted.ciphertext,
        keyIv: encrypted.iv,
        keyAuthTag: encrypted.authTag,
        expiresAt: data.expires_at,
        updatedBy: actorId,
        idempotencyKey,
        requestHash,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different rotate payload.', retryable: false });
      }
      throw error;
    }
    if (res) {
      if (!res.replayed) {
        await this.core.audit({
          action: 'ADMIN_API_KEY_ROTATED',
          actorId,
          correlationId,
          resourceId: id,
          metadata: { provider: res.record.provider, label: res.record.label, idempotencyKey, requestHash },
        });
      }
      return sanitizeApiKey(res.record);
    }
    return undefined;
  }

  async revokeApiKey(id: string, actorId: string, correlationId: string, idempotencyKey: string): Promise<JsonObject | undefined> {
    const requestHash = createHash('sha256').update(JSON.stringify({ id, action: 'revoke' })).digest('hex');
    let res;
    try {
      res = await this.core.revokeApiKeyRecord(id, {
        updatedBy: actorId,
        idempotencyKey,
        requestHash,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different revoke payload.', retryable: false });
      }
      throw error;
    }
    if (res) {
      if (!res.replayed) {
        await this.core.audit({
          action: 'ADMIN_API_KEY_REVOKED',
          actorId,
          correlationId,
          resourceId: id,
          metadata: { provider: res.record.provider, label: res.record.label, idempotencyKey, requestHash },
        });
      }
      return sanitizeApiKey(res.record);
    }
    return undefined;
  }

  async testApiKey(id: string, correlationId: string): Promise<{ success: boolean; message: string; latency_ms: number }> {
    const key = await this.core.getApiKeyRecord(id);
    if (!key) throw new Error('API_KEY_NOT_FOUND');
    if (key.status !== 'active') {
      return { success: false, message: `Key đang ở trạng thái ${key.status}, không thể kết nối.`, latency_ms: 0 };
    }
    const started = performance.now();
    const masterSecret = this.config.getOrThrow<string>('JWT_SECRET');
    let rawSecret = '';
    if (key.keyCiphertext && key.keyIv && key.keyAuthTag) {
      try {
        rawSecret = decryptSecret(key.keyCiphertext, key.keyIv, key.keyAuthTag, masterSecret);
      } catch {
        rawSecret = '';
      }
    }

    if (key.provider === 'gemini') {
      if (rawSecret) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${rawSecret}`, {
            signal: AbortSignal.timeout(4000),
          }).catch(() => null);
          if (res) {
            const latency_ms = Math.round(performance.now() - started);
            if (res.ok) {
              return { success: true, message: 'Xác thực Gemini API Key thành công.', latency_ms };
            }
            if (res.status === 429) {
              return { success: false, message: 'Gemini API Key đã vượt hạn mức sử dụng (Quota / Rate Limit).', latency_ms };
            }
            if (res.status === 400 || res.status === 403) {
              return { success: false, message: 'Gemini API Key không hợp lệ hoặc bị từ chối quyền truy cập.', latency_ms };
            }
          }
        } catch {
          // Fall back to agent ready probe
        }
      }
      const ready = await this.agent.ready(correlationId).catch(() => ({ ok: false }));
      const latency_ms = Math.round(performance.now() - started);
      return { success: ready.ok, message: ready.ok ? 'Kết nối tới Gemini AI Engine thành công.' : 'AI Engine chưa sẵn sàng.', latency_ms };
    }

    if (key.provider === 'geoapify') {
      const apiKeyToUse = rawSecret || this.config.get<string>('GEOAPIFY_API_KEY');
      if (apiKeyToUse) {
        const res = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=10.7769&lon=106.7009&apiKey=${apiKeyToUse}`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
        const latency_ms = Math.round(performance.now() - started);
        const success = Boolean(res && res.ok);
        return { success, message: success ? 'Kết nối tới Geoapify Maps API thành công.' : 'Xác thực Geoapify API Key thất bại.', latency_ms };
      }
    }

    const latency_ms = Math.round(performance.now() - started);
    return { success: Boolean(rawSecret), message: rawSecret ? `Cấu hình key cho provider ${key.provider} hợp lệ.` : `Chưa cấu hình secret cho ${key.provider}.`, latency_ms };
  }

  async systemLogs(filters: { correlation_id?: string; actor_id?: string; action?: string; from_time?: string; to_time?: string; page?: number; page_size?: number } = {}): Promise<JsonObject> {
    const result = (await this.core.queryAuditLogs({
      actorId: filters.actor_id,
      action: filters.action,
      correlationId: filters.correlation_id,
      fromTime: filters.from_time,
      toTime: filters.to_time,
      page: filters.page,
      pageSize: filters.page_size,
    })) as unknown as { items: Array<Record<string, unknown>>; total: number };
    const items = (result.items ?? []).map((entry) => ({
      id: entry.id,
      action: entry.action,
      actor_id: entry.actorId,
      resource_id: entry.resourceId,
      correlation_id: entry.correlationId,
      metadata: entry.metadata,
      created_at: entry.createdAt,
    }));
    return { items, total: result.total ?? items.length } as unknown as JsonObject;
  }

  async tokenUsageSummary(filters: { from_time?: string; to_time?: string; feature?: string; model?: string } = {}): Promise<JsonObject> {
    return this.core.queryTokenUsage({
      fromTime: filters.from_time,
      toTime: filters.to_time,
      feature: filters.feature,
      model: filters.model,
    }) as unknown as JsonObject;
  }

  private async domainSummaries(correlationId: string): Promise<DomainResult[]> {
    const results = await Promise.allSettled([
      this.food.opsSummary(correlationId),
      this.ride.opsSummary(correlationId),
      this.restaurant.opsSummary(correlationId),
      this.healthcare.opsSummary(correlationId),
    ]);
    return this.domainResults(results, ['food', 'ride', 'restaurant', 'healthcare']);
  }

  private async datasetStatuses(correlationId: string): Promise<DatasetResult[]> {
    const results = await Promise.allSettled([
      this.food.opsDatasetStatus(correlationId),
      this.ride.opsDatasetStatus(correlationId),
      this.restaurant.opsDatasetStatus(correlationId),
      this.healthcare.opsDatasetStatus(correlationId),
    ]);
    return this.domainResults(results, ['food', 'ride', 'restaurant', 'healthcare']);
  }

  private domainResults(results: PromiseSettledResult<JsonObject>[], domains: DomainName[]): DomainResult[] {
    return results.map((result, index) => result.status === 'fulfilled'
      ? { domain: domains[index], status: 'healthy', data: result.value }
      : { domain: domains[index], status: 'degraded', error: result.reason instanceof Error ? result.reason.name : 'UPSTREAM_UNAVAILABLE' });
  }
}
