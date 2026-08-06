import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

import { FoodClient, JsonObject, UpstreamClientError } from '../../clients/service.clients';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationClaim, ConfirmationRecord, CoreStore } from '../core/core.module';
import { PaymentService } from '../payment/payment.service';

function stableHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function errorCode(error: unknown): string { if (error instanceof UpstreamClientError) return error.code; const response = error instanceof ConflictException ? error.getResponse() : undefined; return typeof response === 'object' && response !== null && 'code' in response ? String(response.code) : 'UPSTREAM_UNAVAILABLE'; }

@Injectable()
export class ConfirmationService {
  constructor(private readonly store: CoreStore, private readonly food: FoodClient, private readonly payments: PaymentService, private readonly config: ConfigService) {}

  async prepare(user: AuthUser, payload: JsonObject, correlationId: string): Promise<ConfirmationRecord & { preview: JsonObject }> {
    const preview = await this.food.post('/api/v1/orders/preview', { cart_id: payload.cart_id, address_id: payload.address_id, user_id: user.sub }, correlationId, undefined, user.sub);
    const total = preview.total as JsonObject;
    const amount = Number(total.amount);
    const currency = String(total.currency);
    const normalized = { cart_id: String(payload.cart_id), address_id: String(payload.address_id), user_id: user.sub, snapshot_hash: String(preview.snapshot_hash), quote_version: String(preview.quote_version), amount, currency, cart_version: Number(preview.cart_version) };
    const confirmation: ConfirmationRecord = { id: `cnf_${randomUUID().replaceAll('-', '').slice(0, 12)}`, actorId: user.sub, action: 'PLACE_FOOD_ORDER', payload: normalized, payloadHash: stableHash(normalized), quoteVersion: normalized.quote_version, amount, currency, expiresAt: Date.now() + this.config.get<number>('CONFIRMATION_TTL_SECONDS', 600) * 1000, createdAt: new Date().toISOString(), status: 'PENDING', version: 0 };
    await this.store.createConfirmation(confirmation);
    await this.store.audit({ action: 'confirmation.created', actorId: user.sub, resourceId: confirmation.id, correlationId });
    return { ...confirmation, preview };
  }

  async get(id: string, actorId: string): Promise<ConfirmationRecord> {
    const confirmation = await this.store.getConfirmation(id);
    if (!confirmation || confirmation.actorId !== actorId) throw new NotFoundException({ code: 'NOT_FOUND', detail: 'Confirmation not found.' });
    return confirmation;
  }

  private async claim(id: string, user: AuthUser, key: string, hash: string): Promise<ConfirmationClaim> {
    const claim = await this.store.claimConfirmation(id, user.sub, key, hash, Date.now());
    if (claim.state === 'IDEMPOTENCY_KEY_REUSED') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different payload.' });
    if (claim.state === 'EXPIRED') throw new ConflictException({ code: 'CONFIRMATION_EXPIRED', detail: 'Confirmation has expired.' });
    if (claim.state === 'CONFIRMATION_ALREADY_USED') throw new ConflictException({ code: 'CONFIRMATION_ALREADY_USED', detail: 'Confirmation has already been used.' });
    if (claim.state === 'PROCESSING') throw new ConflictException({ code: 'CONFIRMATION_PROCESSING', detail: 'Confirmation is already being processed.', retryable: true });
    if (claim.state === 'SUCCEEDED' || claim.state === 'FAILED_RETRYABLE' || claim.state === 'FAILED_FINAL') return claim;
    return claim;
  }

  private async updateConversationAfterExecution(conversationId: unknown, actorId: string, orderId: string, paymentId: string | undefined): Promise<void> {
    if (typeof conversationId !== 'string' || !conversationId) return;
    const conversation = await this.store.getConversation(conversationId, actorId);
    if (!conversation) return;
    await this.store.saveConversation({ ...conversation, state: { ...conversation.state, last_order_id: orderId, ...(paymentId ? { last_payment_id: paymentId } : {}), pending_confirmation_id: null } });
  }

  async execute(id: string, user: AuthUser, body: JsonObject, correlationId: string, idempotencyKey: string): Promise<JsonObject> {
    const paymentMethod = body.payment_method;
    if (typeof paymentMethod !== 'string' || !['bank_transfer', 'card', 'e_wallet'].includes(paymentMethod)) throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Only payment_method is accepted for execution.' });
    const executionHash = stableHash({ confirmation_id: id, payment_method: paymentMethod, simulate_failure: body.simulate_failure === true, simulate_timeout: body.simulate_timeout === true });
    const executionKey = `confirmation:${id}:${idempotencyKey}`;
    const claim = await this.claim(id, user, executionKey, executionHash);
    if (claim.result) return claim.result;
    const confirmation = claim.confirmation;
    if (!confirmation || claim.state !== 'CLAIMED') throw new ConflictException({ code: 'CONFIRMATION_PROCESSING', detail: 'Confirmation is already being processed.', retryable: true });

    try {
      const preview = await this.food.post('/api/v1/orders/preview', { cart_id: confirmation.payload.cart_id, address_id: confirmation.payload.address_id, user_id: user.sub }, correlationId, undefined, user.sub);
      const currentTotal = preview.total as JsonObject;
      if (String(preview.snapshot_hash) !== confirmation.payload.snapshot_hash || String(preview.quote_version) !== confirmation.payload.quote_version || Number(preview.cart_version) !== Number(confirmation.payload.cart_version) || Number(currentTotal.amount) !== confirmation.amount || String(currentTotal.currency) !== confirmation.currency) {
        const result = { confirmation_id: id, code: 'CART_CHANGED', detail: 'Cart, price, voucher, delivery quote, or currency changed.' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_FINAL', result, 'CART_CHANGED');
        throw new ConflictException({ code: 'CART_CHANGED', detail: 'Cart, price, voucher, delivery quote, or currency changed. Prepare a new confirmation.' });
      }
      const orderKey = `order:${id}:${idempotencyKey}`;
      const order = await this.food.post('/api/v1/orders', { cart_id: confirmation.payload.cart_id, address_id: confirmation.payload.address_id, user_id: user.sub, payment_method: paymentMethod, idempotency_key: orderKey }, correlationId, orderKey, user.sub);
      if (Number(order.amount) !== confirmation.amount || String(order.currency) !== confirmation.currency) {
        const result = { confirmation_id: id, order, code: 'PAYLOAD_MISMATCH' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_FINAL', result, 'PAYLOAD_MISMATCH');
        throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Food order amount does not match the confirmed amount.' });
      }
      const paymentKey = `payment:${id}:${idempotencyKey}`;
      const payment = await this.payments.createAndConfirm({ actorId: user.sub, orderId: String(order.id), amount: Number(order.amount), currency: String(order.currency), method: paymentMethod as 'bank_transfer' | 'card' | 'e_wallet', idempotencyKey: paymentKey, simulateFailure: body.simulate_failure === true, simulateTimeout: body.simulate_timeout === true });
      if (payment.status === 'PENDING' || payment.status === 'TIMED_OUT' || payment.status === 'UNKNOWN') {
        const result = { confirmation_id: id, order, payment, code: 'PAYMENT_TIMEOUT' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_RETRYABLE', result, 'PAYMENT_TIMEOUT');
        throw new ConflictException({ code: 'PAYMENT_TIMEOUT', detail: 'Payment status is unknown; query the payment before retrying.', retryable: true });
      }
      if (payment.status === 'FAILED') {
        await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'PAYMENT_FAILED', reason: 'Payment sandbox failed' }, correlationId, `payment-failed:${id}`);
      } else {
        await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'PAID', reason: 'Payment sandbox succeeded' }, correlationId, `payment-paid:${id}`);
        await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'RESTAURANT_CONFIRMING', reason: 'Awaiting restaurant confirmation' }, correlationId, `restaurant-confirming:${id}`);
      }
      const result: JsonObject = { confirmation_id: confirmation.id, order, payment };
      await this.store.completeConfirmation(id, user.sub, executionKey, payment.status === 'FAILED' ? 'FAILED_FINAL' : 'SUCCEEDED', result, payment.status === 'FAILED' ? 'PAYMENT_FAILED' : undefined);
      if (payment.status === 'SUCCEEDED') await this.updateConversationAfterExecution(body.conversation_id, user.sub, String(order.id), payment.id);
      await this.store.audit({ action: payment.status === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed', actorId: user.sub, resourceId: payment.id, correlationId });
      return result;
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code === 'CART_CHANGED' || code === 'PAYLOAD_MISMATCH' || code === 'PAYMENT_TIMEOUT') throw error;
      if (['VOUCHER_EXPIRED', 'VOUCHER_NOT_APPLICABLE', 'RESTAURANT_CLOSED', 'MENU_ITEM_UNAVAILABLE', 'DELIVERY_OUT_OF_RANGE'].includes(code)) {
        const result = { confirmation_id: id, code: 'CART_CHANGED', detail: 'The authoritative Food quote changed.' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_FINAL', result, 'CART_CHANGED');
        throw new ConflictException({ code: 'CART_CHANGED', detail: 'Cart, price, voucher, delivery quote, or currency changed. Prepare a new confirmation.' });
      }
      const result = { confirmation_id: id, code, detail: 'Execution could not be completed safely.' };
      await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_RETRYABLE', result, code);
      throw error;
    }
  }

  async prepareCancellation(user: AuthUser, orderId: string, correlationId: string): Promise<JsonObject> {
    const preview = await this.food.post(`/api/v1/orders/${orderId}/cancel-preview?user_id=${encodeURIComponent(user.sub)}`, {}, correlationId, undefined, user.sub);
    if (preview.allowed !== true) throw new ConflictException({ code: 'ORDER_NOT_CANCELLABLE', detail: String(preview.reason ?? 'Order cannot be cancelled.') });
    const refund = preview.refund_amount as JsonObject;
    const payload = { order_id: orderId, user_id: user.sub, current_status: String(preview.current_status), refund_amount: refund, snapshot_hash: String(preview.snapshot_hash), policy_version: String(preview.policy_version) };
    const confirmation: ConfirmationRecord = { id: `cnf_${randomUUID().replaceAll('-', '').slice(0, 12)}`, actorId: user.sub, action: 'CANCEL_FOOD_ORDER', payload, payloadHash: stableHash(payload), quoteVersion: String(preview.policy_version), amount: Number(refund.amount), currency: String(refund.currency), expiresAt: Date.now() + this.config.get<number>('CONFIRMATION_TTL_SECONDS', 600) * 1000, createdAt: new Date().toISOString(), status: 'PENDING', version: 0 };
    await this.store.createConfirmation(confirmation);
    await this.store.audit({ action: 'cancellation_confirmation.created', actorId: user.sub, resourceId: confirmation.id, correlationId });
    return { ...confirmation, preview };
  }

  async executeCancellation(id: string, user: AuthUser, correlationId: string, idempotencyKey: string, conversationId?: string): Promise<JsonObject> {
    const confirmation = await this.get(id, user.sub);
    if (confirmation.action !== 'CANCEL_FOOD_ORDER') throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Confirmation action is not cancellation.' });
    const executionKey = `confirmation:${id}:${idempotencyKey}`;
    const claim = await this.claim(id, user, executionKey, stableHash({ confirmation_id: id, action: confirmation.action, payload_hash: confirmation.payloadHash }));
    if (claim.result) return claim.result;
    if (!claim.confirmation || claim.state !== 'CLAIMED') throw new ConflictException({ code: 'CONFIRMATION_PROCESSING', detail: 'Confirmation is already being processed.', retryable: true });
    try {
      const preview = await this.food.post(`/api/v1/orders/${confirmation.payload.order_id}/cancel-preview?user_id=${encodeURIComponent(user.sub)}`, {}, correlationId, undefined, user.sub);
      const refund = preview.refund_amount as JsonObject;
      if (String(preview.current_status) !== String(confirmation.payload.current_status) || String(preview.snapshot_hash) !== String(confirmation.payload.snapshot_hash) || Number(refund.amount) !== confirmation.amount) {
        const result = { confirmation_id: id, code: 'ORDER_CHANGED', detail: 'Order status or refund amount changed.' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_FINAL', result, 'ORDER_CHANGED');
        throw new ConflictException({ code: 'ORDER_CHANGED', detail: 'Order status or refund amount changed. Prepare a new cancellation confirmation.' });
      }
      const cancelKey = `cancel:${id}:${idempotencyKey}`;
      const order = await this.food.post(`/api/v1/orders/${confirmation.payload.order_id}/cancel`, { user_id: user.sub, idempotency_key: cancelKey }, correlationId, cancelKey, user.sub);
      const payment = await this.store.findPaymentByOrder(String(confirmation.payload.order_id), user.sub);
      let refundRecord: JsonObject | undefined;
      if (payment?.status === 'SUCCEEDED') {
        refundRecord = await this.payments.refund(payment.id, user.sub, `cancel:${id}:${idempotencyKey}`, 'customer_cancellation') as unknown as JsonObject;
        await this.food.post(`/api/v1/internal/orders/${confirmation.payload.order_id}/transition`, { target_status: 'REFUND_PENDING', reason: 'Cancellation refund started' }, correlationId, `cancel-refund-pending:${id}`);
        await this.food.post(`/api/v1/internal/orders/${confirmation.payload.order_id}/transition`, { target_status: 'REFUNDED', reason: 'Cancellation refund completed' }, correlationId, `cancel-refunded:${id}`);
      }
      const result: JsonObject = { confirmation_id: id, order, payment, refund: refundRecord };
      await this.store.completeConfirmation(id, user.sub, executionKey, 'SUCCEEDED', result);
      await this.updateConversationAfterExecution(conversationId, user.sub, String(order.id), payment?.id);
      return result;
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code === 'ORDER_CHANGED') throw error;
      const result = { confirmation_id: id, code, detail: 'Cancellation is pending reconciliation.' };
      await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_RETRYABLE', result, code);
      throw error;
    }
  }
}
