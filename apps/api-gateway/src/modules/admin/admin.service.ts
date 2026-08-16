import { Injectable } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

import { AgentClient, FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { AuthService } from '../auth/auth.service';
import { CoreStore } from '../core/core.module';
import { CoreProductOpsStore, SupportTicketStatus } from '../core/product-ops.store';

type DomainName = 'food' | 'ride' | 'restaurant' | 'healthcare';
type DomainResult = { domain: DomainName; status: 'healthy' | 'degraded'; data?: JsonObject; error?: string };
type DatasetResult = { domain: DomainName; status: 'healthy' | 'degraded'; data?: JsonObject; error?: string };

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
    const counts: Record<string, unknown> = { total_users: users.total, payments: payments.total, refunds: refunds.total, open_support_tickets: support.total };
    for (const result of domains) {
      if (result.data?.counts && typeof result.data.counts === 'object') counts[result.domain] = result.data.counts;
    }
    const workflowStatuses = workflows.items.reduce<Record<string, number>>((accumulator, item) => { accumulator[item.status] = (accumulator[item.status] ?? 0) + 1; return accumulator; }, {});
    counts.failed_workflows = Object.entries(workflowStatuses).filter(([status]) => status.includes('FAILED') || status.includes('ERROR')).reduce((sum, [, value]) => sum + value, 0);
    counts.partial_success_workflows = Object.entries(workflowStatuses).filter(([status]) => status === 'PARTIAL_SUCCESS').reduce((sum, [, value]) => sum + value, 0);
    return { counts, domains, payments: { total: payments.total }, refunds: { total: refunds.total }, workflows: { total: workflows.total, by_status: workflowStatuses }, support: { open: support.total }, health, datasets };
  }

  async users(page: number, pageSize: number): Promise<JsonObject> { return this.auth.listUsers(page, pageSize) as unknown as JsonObject; }

  async transactions(correlationId: string, page: number, pageSize: number): Promise<JsonObject> {
    const offset = (page - 1) * pageSize;
    const results = await Promise.allSettled([
      this.food.opsTransactions(correlationId, pageSize, offset),
      this.ride.opsTransactions(correlationId, pageSize, offset),
      this.restaurant.opsTransactions(correlationId, pageSize, offset),
      this.healthcare.opsTransactions(correlationId, pageSize, offset),
    ]);
    const names: DomainName[] = ['food', 'ride', 'restaurant', 'healthcare'];
    const items: unknown[] = [];
    const unavailable: string[] = [];
    let total = 0;
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

  async datasets(correlationId: string): Promise<JsonObject> { return { items: await this.datasetStatuses(correlationId) }; }

  async systemHealth(correlationId: string): Promise<JsonObject> {
    const checks: Array<[string, () => Promise<unknown>]> = [
      ['gateway-core', () => this.core.checkHealth()],
      ['agent-service', () => this.agent.live(correlationId)],
      ['food-service', () => this.food.live(correlationId)],
      ['ride-service', () => this.ride.live(correlationId)],
      ['restaurant-service', () => this.restaurant.live(correlationId)],
      ['healthcare-service', () => this.healthcare.live(correlationId)],
    ];
    const items = await Promise.all(checks.map(async ([service, check]) => {
      const started = performance.now();
      try { await check(); return { service, status: 'healthy', latency_ms: Math.round(performance.now() - started), checked_at: new Date().toISOString() }; }
      catch (error) { return { service, status: 'unavailable', latency_ms: Math.round(performance.now() - started), checked_at: new Date().toISOString(), error: error instanceof Error ? error.name : 'UPSTREAM_ERROR' }; }
    }));
    return { items };
  }

  async support(status: SupportTicketStatus | undefined, page: number, pageSize: number): Promise<JsonObject> {
    return this.productOps.listAllSupportTickets({ ...(status ? { status } : {}), page, pageSize }) as unknown as JsonObject;
  }

  async supportDetail(id: string): Promise<JsonObject | undefined> { return this.productOps.getSupportTicket(id) as unknown as JsonObject | undefined; }

  async updateSupport(id: string, patch: { status?: SupportTicketStatus; priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }, actorId: string, correlationId: string, idempotencyKey: string): Promise<JsonObject | undefined> {
    const requestHash = createHash('sha256').update(JSON.stringify({ status: patch.status ?? null, priority: patch.priority ?? null })).digest('hex');
    let result;
    try {
      result = await this.productOps.updateSupportTicket(id, patch, new Date().toISOString(), actorId, idempotencyKey, requestHash);
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different support update.', retryable: false });
      throw error;
    }
    if (result) {
      if (!result.replayed) await this.core.audit({ action: 'ADMIN_SUPPORT_TICKET_UPDATED', actorId, correlationId, resourceId: id, metadata: { ...(patch.status ? { status: patch.status } : {}), ...(patch.priority ? { priority: patch.priority } : {}) } });
    }
    return result?.ticket as unknown as JsonObject | undefined;
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
