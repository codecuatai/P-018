import { Controller, Get, Logger, OnModuleDestroy, OnModuleInit, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable, Module } from '@nestjs/common';

import { FoodClient, JsonObject } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { ConfirmationModule } from '../confirmation/confirmation.module';
import { CoreStore } from '../core/core.module';
import { PaymentService } from '../payment/payment.service';
import { CoreModule } from '../core/core.module';
import { PaymentModule } from '../payment/payment.module';

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowService.name);
  private worker?: NodeJS.Timeout;
  private workerHealthy = true;
  constructor(private readonly food: FoodClient, private readonly confirmations: ConfirmationService, private readonly store: CoreStore, private readonly payments: PaymentService, private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const enabled = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && String(this.config.get('GATEWAY_WORKFLOW_WORKER_ENABLED', 'true')).toLowerCase() === 'true';
    if (!enabled) return;
    const interval = Math.max(100, Number(this.config.get('GATEWAY_WORKFLOW_POLL_INTERVAL_MS', 500)) || 500);
    this.worker = setInterval(() => { void this.reconcileOnce(); }, interval);
    void this.reconcileOnce();
  }

  async onModuleDestroy(): Promise<void> { if (this.worker) clearInterval(this.worker); }
  isWorkerHealthy(): boolean { return this.workerHealthy; }

  private async reconcileOnce(): Promise<void> {
    try {
      const payments = await this.store.listPaymentsForReconciliation();
      for (const payment of payments) {
        try {
          const existingRefunds = await this.store.listRefunds(payment.id);
          if (existingRefunds.some((refund) => refund.status === 'SUCCEEDED' && refund.amount === payment.amount)) continue;
          const correlationId = `cor_reconcile_${payment.orderId}`;
          const order = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
          if (!['RESTAURANT_REJECTED', 'CANCELLED', 'REFUND_PENDING'].includes(String(order.status))) continue;
          const refund = await this.payments.refund(payment.id, payment.actorId, `workflow:${payment.orderId}`, String(order.status) === 'CANCELLED' ? 'customer_cancellation' : 'restaurant_rejection');
          if (String(order.status) !== 'REFUND_PENDING') await this.food.post(`/api/v1/internal/orders/${encodeURIComponent(payment.orderId)}/transition`, { target_status: 'REFUND_PENDING', reason: 'Refund reconciliation started' }, correlationId, `workflow-pending:${payment.orderId}`);
          if (refund.status === 'SUCCEEDED') await this.food.post(`/api/v1/internal/orders/${encodeURIComponent(payment.orderId)}/transition`, { target_status: 'REFUNDED', reason: 'Refund reconciliation completed' }, correlationId, `workflow-refunded:${payment.orderId}`);
        } catch (error: unknown) {
          this.logger.warn(`Refund reconciliation deferred for order ${payment.orderId}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
      this.workerHealthy = true;
    } catch (error: unknown) {
      this.workerHealthy = false;
      this.logger.error(`Gateway reconciliation iteration failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  getOrder(orderId: string, actorId: string, correlationId: string): Promise<JsonObject> {
    return this.food.get(`/api/v1/orders/${orderId}?user_id=${encodeURIComponent(actorId)}`, correlationId, actorId);
  }

  getTracking(orderId: string, actorId: string, correlationId: string): Promise<JsonObject> {
    return this.food.get(`/api/v1/orders/${orderId}/tracking?user_id=${encodeURIComponent(actorId)}`, correlationId, actorId);
  }

  cancelPreview(orderId: string, actorId: string, correlationId: string): Promise<JsonObject> { return this.food.post(`/api/v1/orders/${orderId}/cancel-preview?user_id=${encodeURIComponent(actorId)}`, {}, correlationId, undefined, actorId); }
  cancelConfirmation(orderId: string, user: AuthUser, correlationId: string): Promise<JsonObject> { return this.confirmations.prepareCancellation(user, orderId, correlationId); }
}

@Controller('api/v1/food/orders')
@UseGuards(DemoAuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get(':orderId')
  order(@Param('orderId') orderId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.workflow.getOrder(orderId, request.user.sub, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId, actor_id: request.user.sub } }));
  }

  @Get(':orderId/tracking')
  tracking(@Param('orderId') orderId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.workflow.getTracking(orderId, request.user.sub, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId, actor_id: request.user.sub } }));
  }

  @Post(':orderId/cancel-preview')
  cancelPreview(@Param('orderId') orderId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.workflow.cancelPreview(orderId, request.user.sub, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }

  @Post(':orderId/cancel-confirmation')
  cancelConfirmation(@Param('orderId') orderId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.workflow.cancelConfirmation(orderId, request.user, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }
}

@Module({ imports: [AuthModule, ConfirmationModule, CoreModule, PaymentModule], controllers: [WorkflowController], providers: [WorkflowService, FoodClient], exports: [WorkflowService] })
export class WorkflowModule {}
