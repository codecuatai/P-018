import { Controller, Get, Logger, OnModuleDestroy, OnModuleInit, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable, Module } from '@nestjs/common';

import { AgentClient, FoodClient, HealthcareClient, JsonObject, RestaurantClient } from '../../clients/service.clients';
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
import { RestaurantWorkflowController } from './restaurant-workflow.controller';
import { HealthcareWorkflowController } from './healthcare-workflow.controller';

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowService.name);
  private worker?: NodeJS.Timeout;
  private workerHealthy = true;
  private inFlight?: Promise<void>;
  private lastDiscoveryAt = 0;
  constructor(private readonly food: FoodClient, private readonly confirmations: ConfirmationService, private readonly store: CoreStore, private readonly payments: PaymentService, private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const enabled = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && String(this.config.get('GATEWAY_WORKFLOW_WORKER_ENABLED', 'true')).toLowerCase() === 'true';
    if (!enabled) return;
    const interval = Math.max(100, Number(this.config.get('GATEWAY_WORKFLOW_POLL_INTERVAL_MS', 500)) || 500);
    this.worker = setInterval(() => { void this.reconcileOnce(); }, interval);
    void this.reconcileOnce();
  }

  async onModuleDestroy(): Promise<void> { if (this.worker) clearInterval(this.worker); if (this.inFlight) await this.inFlight; }
  isWorkerHealthy(): boolean { return this.workerHealthy; }
  checkReadiness(): Promise<boolean> { return this.store.checkHealth(); }

  private async reconcileOnce(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runReconciliation();
    try { await this.inFlight; } finally { this.inFlight = undefined; }
  }

  private async runReconciliation(): Promise<void> {
    try {
      await this.confirmations.recoverStaleConfirmations(`cor_recovery_${Date.now()}`);
      const recoveredPayments = await this.payments.recoverPendingPayments();
      for (const payment of recoveredPayments) await this.confirmations.reconcileRecoveredPayment(payment, `cor_payment_recovery_${payment.id}`);
      if (Date.now() - this.lastDiscoveryAt >= 5000) {
        this.lastDiscoveryAt = Date.now();
        const payments = await this.store.listPaymentsForReconciliation();
        for (const payment of payments) {
          const correlationId = `cor_discover_${payment.orderId}`;
          let order: JsonObject;
          try {
            order = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
          } catch (error: unknown) {
            this.logger.warn(`Reconciliation discovery skipped for order ${payment.orderId}: ${error instanceof Error ? error.message : 'unknown error'}`);
            continue;
          }
          if (!['RESTAURANT_REJECTED', 'CANCELLED', 'REFUND_PENDING'].includes(String(order.status))) continue;
          await this.store.upsertWorkflowReconciliation({ orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, status: String(order.status), attemptCount: 0, nextAttemptAt: new Date().toISOString() });
        }
      }
      const due = await this.store.claimDueWorkflowReconciliations(new Date().toISOString(), 20, `gateway:${process.pid}`);
      for (const work of due) {
        const payment = await this.store.getPayment(work.paymentId);
        if (!payment || payment.status !== 'SUCCEEDED') {
          await this.store.upsertWorkflowReconciliation({ ...work, status: 'NO_LONGER_DUE', completedAt: new Date().toISOString(), nextAttemptAt: undefined });
          continue;
        }
        try {
          const correlationId = `cor_reconcile_${payment.orderId}`;
          const order = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
          if (!['RESTAURANT_REJECTED', 'CANCELLED', 'REFUND_PENDING'].includes(String(order.status))) {
            await this.store.upsertWorkflowReconciliation({ ...work, status: 'NO_LONGER_DUE', completedAt: new Date().toISOString(), nextAttemptAt: undefined });
            continue;
          }
          const existingRefunds = await this.store.listRefunds(payment.id);
          let refund = existingRefunds.find((item) => item.refundScope === 'FOOD_ORDER_FINAL_REFUND' || item.status === 'SUCCEEDED');
          if (!refund) refund = await this.payments.refund(payment.id, payment.actorId, `food-order-refund:${payment.orderId}:${payment.id}`, String(order.status) === 'CANCELLED' ? 'customer_cancellation' : 'restaurant_rejection');
          else if (refund.status === 'PENDING' || refund.status === 'UNKNOWN') refund = await this.payments.recoverRefund(refund);
          const backoffSeconds = [1, 2, 5, 10, 30][Math.min(work.attemptCount, 4)];
          const reconciliation = { orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, refundId: refund.id, status: String(order.status), attemptCount: work.attemptCount, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000).toISOString() };
          if (String(order.status) === 'RESTAURANT_REJECTED' || String(order.status) === 'CANCELLED') {
            await this.food.post(`/api/v1/internal/orders/${encodeURIComponent(payment.orderId)}/transition`, { target_status: 'REFUND_PENDING', reason: 'Refund reconciliation started', operation_key: `workflow-pending:${payment.orderId}` }, correlationId, `workflow-pending:${payment.orderId}`);
          }
          if (refund.status === 'FAILED') {
            await this.store.upsertWorkflowReconciliation({ ...reconciliation, status: 'REFUND_FAILED', lastErrorCode: 'REFUND_FAILED', completedAt: new Date().toISOString(), nextAttemptAt: undefined });
            continue;
          }
          const current = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
          if (refund.status === 'SUCCEEDED' && String(current.status) === 'REFUND_PENDING') {
            await this.food.post(`/api/v1/internal/orders/${encodeURIComponent(payment.orderId)}/transition`, { target_status: 'REFUNDED', reason: 'Refund reconciliation completed', operation_key: `food-order-refunded:${payment.orderId}:${payment.id}` }, correlationId, `food-order-refunded:${payment.orderId}:${payment.id}`);
            await this.store.upsertWorkflowReconciliation({ ...reconciliation, status: 'REFUNDED', completedAt: new Date().toISOString(), nextAttemptAt: undefined });
          } else {
            await this.store.upsertWorkflowReconciliation(reconciliation);
          }
        } catch (error: unknown) {
          this.logger.warn(`Refund reconciliation deferred for order ${payment.orderId}: ${error instanceof Error ? error.message : 'unknown error'}`);
          if (error instanceof Error && error.message === 'REFUND_FAILED') {
            await this.store.upsertWorkflowReconciliation({ orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, status: 'REFUND_FAILED', lastErrorCode: 'REFUND_FAILED', attemptCount: work.attemptCount, completedAt: new Date().toISOString(), nextAttemptAt: undefined });
            continue;
          }
          const backoffSeconds = [1, 2, 5, 10, 30][Math.min(work.attemptCount, 4)];
          await this.store.upsertWorkflowReconciliation({ orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, status: 'RETRYABLE', lastErrorCode: error instanceof Error ? error.message : 'UNKNOWN', attemptCount: work.attemptCount, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000).toISOString() });
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

@Module({
  imports: [AuthModule, ConfirmationModule, CoreModule, PaymentModule],
  controllers: [WorkflowController, RestaurantWorkflowController, HealthcareWorkflowController],
  providers: [WorkflowService, FoodClient, AgentClient, RestaurantClient, HealthcareClient],
  exports: [WorkflowService],
})
export class WorkflowModule {}
