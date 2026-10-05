import { Controller, Get, Logger, OnModuleDestroy, OnModuleInit, Optional, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable, Module } from '@nestjs/common';

import { AgentClient, FoodClient, HealthcareClient, JsonObject, RestaurantClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
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
import { LocationService } from '../personal/personal.module';
import { PersonalModule } from '../personal/personal.module';

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowService.name);
  private worker?: NodeJS.Timeout;
  private workerHealthy = true;
  private inFlight?: Promise<void>;
  private lastDiscoveryAt = 0;
  private readonly deliveryRoutes = new Map<string, FoodDeliveryRouteSnapshot>();
  constructor(private readonly food: FoodClient, private readonly confirmations: ConfirmationService, private readonly store: CoreStore, private readonly payments: PaymentService, private readonly config: ConfigService, @Optional() private readonly locations?: LocationService) {}

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
            const retrySeconds = 5;
            await this.store.upsertWorkflowReconciliation({
              orderId: payment.orderId,
              actorId: payment.actorId,
              paymentId: payment.id,
              status: 'DISCOVERY_RETRY',
              lastErrorCode: error instanceof Error ? error.message : 'UNKNOWN',
              attemptCount: 0,
              nextAttemptAt: new Date(Date.now() + retrySeconds * 1000).toISOString(),
            });
            this.logger.warn(`Reconciliation discovery deferred for order ${payment.orderId}: ${error instanceof Error ? error.message : 'unknown error'}`);
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
            if (work.status === 'DISCOVERY_RETRY') {
              await this.store.upsertWorkflowReconciliation({
                ...work,
                status: 'DISCOVERY_RETRY',
                lastErrorCode: undefined,
                nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
              });
              continue;
            }
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
          const retryDetail = error instanceof Error ? error.message : 'unknown error';
          if (work.status === 'DISCOVERY_RETRY') this.logger.debug(`Order discovery retry deferred for order ${payment.orderId}: ${retryDetail}`);
          else this.logger.warn(`Refund reconciliation deferred for order ${payment.orderId}: ${retryDetail}`);
          if (error instanceof Error && error.message === 'REFUND_FAILED') {
            await this.store.upsertWorkflowReconciliation({ orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, status: 'REFUND_FAILED', lastErrorCode: 'REFUND_FAILED', attemptCount: work.attemptCount, completedAt: new Date().toISOString(), nextAttemptAt: undefined });
            continue;
          }
          const backoffSeconds = work.status === 'DISCOVERY_RETRY'
            ? [5, 15, 30, 60][Math.min(Math.max(work.attemptCount - 1, 0), 3)]
            : [1, 2, 5, 10, 30][Math.min(work.attemptCount, 4)];
          await this.store.upsertWorkflowReconciliation({ orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, status: work.status === 'DISCOVERY_RETRY' ? 'DISCOVERY_RETRY' : 'RETRYABLE', lastErrorCode: error instanceof Error ? error.message : 'UNKNOWN', attemptCount: work.attemptCount, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000).toISOString() });
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

  async getTracking(orderId: string, actorId: string, correlationId: string): Promise<JsonObject> {
    const data = await this.food.get(`/api/v1/orders/${orderId}/tracking?user_id=${encodeURIComponent(actorId)}`, correlationId, actorId);
    return this.withDeliveryRoute(orderId, data);
  }

  private async withDeliveryRoute(orderId: string, data: JsonObject): Promise<JsonObject> {
    if (!this.locations) return data;
    const restaurant = isObject(data.restaurant) ? data.restaurant : undefined;
    const pickupStops = Array.isArray(data.pickup_stops) ? data.pickup_stops.filter(isObject) : [];
    const pickupSources = pickupStops.length ? pickupStops : restaurant ? [restaurant] : [];
    const enrichedPickups = await Promise.all(pickupSources.map(async (pickup) => {
      const coordinate = coordinateValue(pickup) ?? await this.resolveCoordinate(pickup, 'restaurant');
      return coordinate ? { ...pickup, ...coordinate } : pickup;
    }));
    const deliveryAddress = isObject(data.address) ? data.address : undefined;
    const addressPoint = coordinateValue(deliveryAddress) ?? await this.resolveCoordinate(deliveryAddress, 'address');
    const pickupPoints = enrichedPickups.map(coordinateValue).filter((point): point is FoodRoutePoint => point !== undefined);
    const enrichedData: JsonObject = {
      ...data,
      ...(pickupStops.length ? { pickup_stops: enrichedPickups } : {}),
      ...(restaurant && pickupPoints[0] ? { restaurant: { ...restaurant, ...pickupPoints[0] } } : {}),
      ...(deliveryAddress && addressPoint ? { address: { ...deliveryAddress, ...addressPoint } } : {}),
    };
    // Coordinates are useful on their own: the browser can render verified
    // restaurant/delivery pins even while a routing provider is degraded.
    if (!pickupPoints.length || !addressPoint) return enrichedData;

    let route = this.deliveryRoutes.get(orderId);
    if (!route) {
      route = await this.resolveDeliveryRoute([...pickupPoints, addressPoint]) ?? {
        origin: pickupPoints[0],
        destination: addressPoint,
        geometry: [...pickupPoints, addressPoint],
      };
      this.deliveryRoutes.set(orderId, route);
    }
    if (!route) return data;
    const status = typeof data.status === 'string' ? data.status : '';
    const timeline = Array.isArray(data.timeline) ? data.timeline.filter(isObject) : [];
    const delivering = [...timeline].reverse().find((event) => event.to_status === 'DELIVERING');
    const deliveringAt = typeof delivering?.occurred_at === 'string' ? Date.parse(delivering.occurred_at) : NaN;
    const progress = status === 'DELIVERED' ? 1 : status === 'DELIVERING' && Number.isFinite(deliveringAt) ? Math.min(1, Math.max(0, (Date.now() - deliveringAt) / 5_000)) : status === 'PICKED_UP' ? 0.2 : 0;
    const courierLocation = ['DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(status) ? pointAlongRoute(route.geometry, progress) : undefined;
    if (['CANCELLED', 'REFUNDED'].includes(status)) this.deliveryRoutes.delete(orderId);
    return {
      ...enrichedData,
      delivery_route: route,
      ...(courierLocation ? { courier_location: courierLocation } : {}),
    };
  }

  private async resolveDeliveryRoute(points: FoodRoutePoint[]): Promise<FoodDeliveryRouteSnapshot | undefined> {
    if (!this.locations || points.length < 2) return undefined;
    try {
      const legs = await Promise.all(points.slice(1).map((destination, index) => this.locations!.route(points[index], destination)));
      if (!legs.every((leg) => leg.status === 'RESOLVED' && leg.route_geometry && leg.route_geometry.length >= 2 && leg.route_distance_meters !== undefined && leg.route_duration_seconds !== undefined && leg.route_snapshot_hash)) return undefined;
      const geometry = legs.flatMap((leg, index) => index === 0 ? leg.route_geometry! : leg.route_geometry!.slice(1));
      return {
        provider: legs[0].provider,
        origin: points[0],
        destination: points[points.length - 1],
        distance_meters: legs.reduce((total, leg) => total + (leg.route_distance_meters ?? 0), 0),
        duration_seconds: legs.reduce((total, leg) => total + (leg.route_duration_seconds ?? 0), 0),
        geometry,
        snapshot_hash: legs.map((leg) => leg.route_snapshot_hash).join('.'),
      };
    } catch {
      // Tracking remains available with verified pins and a straight visual
      // connector when the optional route provider cannot answer in time.
      return undefined;
    }
  }

  private async resolveCoordinate(value: unknown, kind: 'restaurant' | 'address'): Promise<{ latitude: number; longitude: number } | undefined> {
    if (!this.locations) return undefined;
    if (!isObject(value)) return undefined;
    const text = kind === 'restaurant' ? value.address : value.address_text ?? value.address;
    if (typeof text !== 'string' || text.trim().length < 3) return undefined;
    try {
      const result = await this.locations.geocode(text);
      const candidate = result.candidates.find((item) => item.latitude !== null && item.longitude !== null);
      return candidate && candidate.latitude !== null && candidate.longitude !== null ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
    } catch {
      return undefined;
    }
  }

  cancelPreview(orderId: string, actorId: string, correlationId: string): Promise<JsonObject> { return this.food.post(`/api/v1/orders/${orderId}/cancel-preview?user_id=${encodeURIComponent(actorId)}`, {}, correlationId, undefined, actorId); }
  cancelConfirmation(orderId: string, user: AuthUser, correlationId: string): Promise<JsonObject> { return this.confirmations.prepareCancellation(user, orderId, correlationId); }
}

type FoodDeliveryRouteSnapshot = {
  provider?: string;
  origin: FoodRoutePoint;
  destination: FoodRoutePoint;
  distance_meters?: number;
  duration_seconds?: number;
  geometry: FoodRoutePoint[];
  snapshot_hash?: string;
};

type FoodRoutePoint = { latitude: number; longitude: number };

function coordinateValue(value: unknown): FoodRoutePoint | undefined {
  if (!isObject(value) || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return undefined;
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude) ? { latitude: value.latitude, longitude: value.longitude } : undefined;
}

function pointAlongRoute(geometry: Array<{ latitude: number; longitude: number }>, ratio: number): { latitude: number; longitude: number } {
  if (geometry.length < 2) return geometry[0] ?? { latitude: 0, longitude: 0 };
  const lengths = geometry.slice(1).map((point, index) => distanceBetween(geometry[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return geometry[0];
  let remaining = total * Math.min(1, Math.max(0, ratio));
  for (let index = 0; index < lengths.length; index += 1) {
    const segment = lengths[index];
    if (remaining <= segment) {
      const start = geometry[index];
      const end = geometry[index + 1];
      const segmentRatio = segment > 0 ? remaining / segment : 0;
      return { latitude: start.latitude + (end.latitude - start.latitude) * segmentRatio, longitude: start.longitude + (end.longitude - start.longitude) * segmentRatio };
    }
    remaining -= segment;
  }
  return geometry[geometry.length - 1];
}

function distanceBetween(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }): number {
  const latitude = (right.latitude - left.latitude) * 111_000;
  const longitude = (right.longitude - left.longitude) * 111_000 * Math.cos((left.latitude * Math.PI) / 180);
  return Math.sqrt(latitude ** 2 + longitude ** 2);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Controller('api/v1/food/orders')
@UseGuards(AuthGuard)
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
  imports: [AuthModule, ConfirmationModule, CoreModule, PaymentModule, PersonalModule],
  controllers: [WorkflowController, RestaurantWorkflowController, HealthcareWorkflowController],
  providers: [WorkflowService, FoodClient, AgentClient, RestaurantClient, HealthcareClient],
  exports: [WorkflowService],
})
export class WorkflowModule {}
