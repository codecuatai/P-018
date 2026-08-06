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

  private async claim(id: string, user: AuthUser, key: string, hash: string, payload?: JsonObject): Promise<ConfirmationClaim> {
    const claim = await this.store.claimConfirmation(id, user.sub, key, hash, Date.now(), payload);
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
    const orderKey = `order:${id}:${idempotencyKey}`;
    const paymentKey = `payment:${id}:${idempotencyKey}`;
    const claim = await this.claim(id, user, executionKey, executionHash, { payment_method: paymentMethod, order_idempotency_key: orderKey, payment_idempotency_key: paymentKey, simulate_failure: body.simulate_failure === true, simulate_timeout: body.simulate_timeout === true, conversation_id: body.conversation_id });
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
      const order = await this.food.post('/api/v1/orders', { cart_id: confirmation.payload.cart_id, address_id: confirmation.payload.address_id, user_id: user.sub, payment_method: paymentMethod, idempotency_key: orderKey, expected_snapshot_hash: confirmation.payload.snapshot_hash, expected_cart_version: confirmation.payload.cart_version, expected_amount: confirmation.amount, expected_currency: confirmation.currency, expected_quote_version: confirmation.payload.quote_version }, correlationId, orderKey, user.sub);
      if (Number(order.amount) !== confirmation.amount || String(order.currency) !== confirmation.currency) {
        const result = { confirmation_id: id, order, code: 'PAYLOAD_MISMATCH' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_FINAL', result, 'PAYLOAD_MISMATCH');
        throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Food order amount does not match the confirmed amount.' });
      }
      const payment = await this.payments.createAndConfirm({ actorId: user.sub, orderId: String(order.id), amount: Number(order.amount), currency: String(order.currency), method: paymentMethod as 'bank_transfer' | 'card' | 'e_wallet', idempotencyKey: paymentKey, simulateFailure: body.simulate_failure === true, simulateTimeout: body.simulate_timeout === true });
      if (payment.status === 'PENDING' || payment.status === 'TIMED_OUT' || payment.status === 'UNKNOWN') {
        const result = { confirmation_id: id, order, payment, code: 'PAYMENT_TIMEOUT' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_RETRYABLE', result, 'PAYMENT_TIMEOUT');
        throw new ConflictException({ code: 'PAYMENT_TIMEOUT', detail: 'Payment status is unknown; query the payment before retrying.', retryable: true });
      }
      if (payment.status === 'FAILED') {
        await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'PAYMENT_FAILED', reason: 'Payment sandbox failed', operation_key: `payment-failed:${id}` }, correlationId, `payment-failed:${id}`);
      } else {
        await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'PAID', reason: 'Payment sandbox succeeded', operation_key: `payment-paid:${id}` }, correlationId, `payment-paid:${id}`);
        await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'RESTAURANT_CONFIRMING', reason: 'Awaiting restaurant confirmation', operation_key: `restaurant-confirming:${id}` }, correlationId, `restaurant-confirming:${id}`);
      }
      const authoritativeOrder = await this.food.get(`/api/v1/orders/${encodeURIComponent(String(order.id))}`, correlationId, user.sub);
      const result: JsonObject = { confirmation_id: confirmation.id, order: authoritativeOrder, payment };
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
    const cancelKey = `cancel:${id}:${idempotencyKey}`;
    const refundKey = `refund:${id}:${idempotencyKey}`;
    const claim = await this.claim(id, user, executionKey, stableHash({ confirmation_id: id, action: confirmation.action, payload_hash: confirmation.payloadHash }), { cancel_idempotency_key: cancelKey, refund_idempotency_key: refundKey, conversation_id: conversationId });
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
      const order = await this.food.post(`/api/v1/orders/${confirmation.payload.order_id}/cancel`, { user_id: user.sub, idempotency_key: cancelKey }, correlationId, cancelKey, user.sub);
      const payment = await this.store.findPaymentByOrder(String(confirmation.payload.order_id), user.sub);
      let refundRecord: JsonObject | undefined;
      if (payment?.status === 'SUCCEEDED') {
        refundRecord = await this.payments.refund(payment.id, user.sub, refundKey, 'customer_cancellation') as unknown as JsonObject;
        await this.food.post(`/api/v1/internal/orders/${confirmation.payload.order_id}/transition`, { target_status: 'REFUND_PENDING', reason: 'Cancellation refund started', operation_key: `cancel-refund-pending:${id}` }, correlationId, `cancel-refund-pending:${id}`);
        await this.food.post(`/api/v1/internal/orders/${confirmation.payload.order_id}/transition`, { target_status: 'REFUNDED', reason: 'Cancellation refund completed', operation_key: `cancel-refunded:${id}` }, correlationId, `cancel-refunded:${id}`);
      }
      const authoritativeOrder = await this.food.get(`/api/v1/orders/${encodeURIComponent(String(order.id))}`, correlationId, user.sub);
      const result: JsonObject = { confirmation_id: id, order: authoritativeOrder, payment, refund: refundRecord };
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

  async recoverStaleConfirmations(correlationId: string): Promise<number> {
    const timeoutMs = this.config.get<number>('CONFIRMATION_PROCESSING_TIMEOUT_SECONDS', 30) * 1000;
    const stale = await this.store.claimStaleConfirmations(Date.now() - timeoutMs, Date.now(), 20);
    let recovered = 0;
    for (const confirmation of stale) {
      try {
        const execution = confirmation.executionKey ? await this.store.getExecution(confirmation.executionKey) : undefined;
        if (!execution || !confirmation.executionKey) { await this.store.releaseConfirmationRecovery(confirmation.id); continue; }
        const payload = execution.payload ?? {};
        const actor: AuthUser = { sub: confirmation.actorId, email: 'recovery@xone.local', role: 'customer' };
        if (confirmation.action === 'PLACE_FOOD_ORDER') {
          const paymentMethod = String(payload.payment_method ?? 'card');
          const orderKey = String(payload.order_idempotency_key ?? `order:${confirmation.id}:recovery`);
          const paymentKey = String(payload.payment_idempotency_key ?? `payment:${confirmation.id}:recovery`);
          const order = await this.food.post('/api/v1/orders', { cart_id: confirmation.payload.cart_id, address_id: confirmation.payload.address_id, user_id: actor.sub, payment_method: paymentMethod, idempotency_key: orderKey, expected_snapshot_hash: confirmation.payload.snapshot_hash, expected_cart_version: confirmation.payload.cart_version, expected_amount: confirmation.amount, expected_currency: confirmation.currency, expected_quote_version: confirmation.payload.quote_version }, correlationId, orderKey, actor.sub);
          const payment = await this.payments.createAndConfirm({ actorId: actor.sub, orderId: String(order.id), amount: Number(order.amount), currency: String(order.currency), method: paymentMethod as 'bank_transfer' | 'card' | 'e_wallet', idempotencyKey: paymentKey, simulateFailure: payload.simulate_failure === true, simulateTimeout: payload.simulate_timeout === true });
          if (payment.status === 'FAILED') await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'PAYMENT_FAILED', reason: 'Payment recovery failed', operation_key: `payment-failed:${confirmation.id}` }, correlationId, `payment-failed:${confirmation.id}`);
          else if (payment.status === 'SUCCEEDED') {
            await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'PAID', reason: 'Payment recovery succeeded', operation_key: `payment-paid:${confirmation.id}` }, correlationId, `payment-paid:${confirmation.id}`);
            await this.food.post(`/api/v1/internal/orders/${order.id}/transition`, { target_status: 'RESTAURANT_CONFIRMING', reason: 'Restaurant confirmation resumed', operation_key: `restaurant-confirming:${confirmation.id}` }, correlationId, `restaurant-confirming:${confirmation.id}`);
          }
          const authoritativeOrder = await this.food.get(`/api/v1/orders/${encodeURIComponent(String(order.id))}`, correlationId, actor.sub);
          const result = { confirmation_id: confirmation.id, order: authoritativeOrder, payment, ...(payment.status === 'TIMED_OUT' || payment.status === 'UNKNOWN' ? { code: 'PAYMENT_TIMEOUT' } : {}) };
          await this.store.completeConfirmation(confirmation.id, actor.sub, confirmation.executionKey, payment.status === 'FAILED' ? 'FAILED_FINAL' : payment.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED_RETRYABLE', result, payment.status === 'FAILED' ? 'PAYMENT_FAILED' : payment.status === 'SUCCEEDED' ? undefined : 'PAYMENT_TIMEOUT');
          recovered += 1;
        } else if (confirmation.action === 'CANCEL_FOOD_ORDER') {
          const orderId = String(confirmation.payload.order_id);
          const cancelKey = String(payload.cancel_idempotency_key ?? `cancel:${confirmation.id}:recovery`);
          const order = await this.food.post(`/api/v1/orders/${orderId}/cancel`, { user_id: actor.sub, idempotency_key: cancelKey }, correlationId, cancelKey, actor.sub);
          const payment = await this.store.findPaymentByOrder(orderId, actor.sub);
          let refund: JsonObject | undefined;
          if (payment?.status === 'SUCCEEDED') {
            refund = await this.payments.refund(payment.id, actor.sub, String(payload.refund_idempotency_key ?? `refund:${confirmation.id}:recovery`), 'customer_cancellation') as unknown as JsonObject;
            await this.food.post(`/api/v1/internal/orders/${orderId}/transition`, { target_status: 'REFUND_PENDING', reason: 'Cancellation refund recovery started', operation_key: `cancel-refund-pending:${confirmation.id}` }, correlationId, `cancel-refund-pending:${confirmation.id}`);
            await this.food.post(`/api/v1/internal/orders/${orderId}/transition`, { target_status: 'REFUNDED', reason: 'Cancellation refund recovery completed', operation_key: `cancel-refunded:${confirmation.id}` }, correlationId, `cancel-refunded:${confirmation.id}`);
          }
          const authoritativeOrder = await this.food.get(`/api/v1/orders/${orderId}`, correlationId, actor.sub);
          const result = { confirmation_id: confirmation.id, order: authoritativeOrder, payment, refund };
          await this.store.completeConfirmation(confirmation.id, actor.sub, confirmation.executionKey, 'SUCCEEDED', result);
          recovered += 1;
        }
        await this.store.releaseConfirmationRecovery(confirmation.id);
      } catch (error: unknown) {
        await this.store.completeConfirmation(confirmation.id, confirmation.actorId, confirmation.executionKey ?? '', 'FAILED_RETRYABLE', { confirmation_id: confirmation.id, code: errorCode(error), detail: 'Recovery will retry the same execution.' }, errorCode(error));
        await this.store.releaseConfirmationRecovery(confirmation.id);
      }
    }
    return recovered;
  }
}
