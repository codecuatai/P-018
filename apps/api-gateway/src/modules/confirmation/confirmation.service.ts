import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

import { FoodClient, HealthcareClient, HealthcareTool, JsonObject, RestaurantClient, RestaurantTool, UpstreamClientError } from '../../clients/service.clients';
import { ServiceCallError } from '../../resilience/service-call-error';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationClaim, ConfirmationRecord, CoreStore, PaymentRecord } from '../core/core.module';
import { PaymentService } from '../payment/payment.service';

function stableHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function errorCode(error: unknown): string {
  if (error instanceof UpstreamClientError) return error.code;
  if (error instanceof ServiceCallError) return error.code;
  if (error instanceof Error && ['REFUND_FAILED', 'REFUND_PENDING', 'REFUND_UNKNOWN'].includes(error.message)) return error.message;
  const response = error instanceof ConflictException ? error.getResponse() : undefined;
  return typeof response === 'object' && response !== null && 'code' in response ? String(response.code) : 'UPSTREAM_UNAVAILABLE';
}

type DomainFinalTool = RestaurantTool | HealthcareTool;
const DOMAIN_CONFIRMATION_ACTIONS = new Set(['CREATE_RESTAURANT_RESERVATION', 'CONFIRM_HEALTHCARE_APPOINTMENT']);

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function healthcareFinalStateError(appointment: JsonObject): { code: string; detail: string } | null {
  if (appointment.status === 'EXPIRED') return { code: 'APPOINTMENT_EXPIRED', detail: 'The appointment hold has expired.' };
  if (appointment.status === 'CANCELLED') return { code: 'APPOINTMENT_NOT_CONFIRMABLE', detail: 'The appointment has been cancelled.' };
  if (appointment.status === 'CONFIRMED') return { code: 'APPOINTMENT_ALREADY_CONFIRMED', detail: 'The appointment is already confirmed.' };
  if (appointment.is_paid !== true) return { code: 'PAYMENT_REQUIRED', detail: 'Appointment payment is required before confirmation.' };
  if (appointment.status !== 'DRAFT') return { code: 'APPOINTMENT_NOT_CONFIRMABLE', detail: 'Only a draft appointment can be confirmed.' };
  const slot = isRecord(appointment.slot) ? appointment.slot : null;
  const expiresAt = slot && typeof slot.hold_expires_at === 'string' ? Date.parse(slot.hold_expires_at) : Number.NaN;
  if (!slot || slot.status !== 'HOLDING' || !Number.isFinite(expiresAt)) {
    return { code: 'APPOINTMENT_NOT_CONFIRMABLE', detail: 'The appointment does not have an active slot hold.' };
  }
  if (expiresAt <= Date.now()) return { code: 'APPOINTMENT_EXPIRED', detail: 'The appointment hold has expired.' };
  return null;
}

function domainAction(toolName: DomainFinalTool['tool_name']): string {
  if (toolName === 'restaurant.create_reservation') return 'CREATE_RESTAURANT_RESERVATION';
  if (toolName === 'healthcare.confirm_appointment') return 'CONFIRM_HEALTHCARE_APPOINTMENT';
  throw new ConflictException({ code: 'INVALID_CONFIRMATION_ACTION', detail: 'Only final domain tools can create a confirmation.' });
}

@Injectable()
export class ConfirmationService {
  constructor(
    private readonly store: CoreStore,
    private readonly food: FoodClient,
    private readonly payments: PaymentService,
    private readonly config: ConfigService,
    private readonly restaurant: RestaurantClient,
    private readonly healthcare: HealthcareClient,
  ) {}

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

  async prepareDomainConfirmation(
    user: AuthUser,
    tool: DomainFinalTool,
    resource: JsonObject | undefined,
    correlationId: string,
  ): Promise<JsonObject> {
    if (tool.risk_level !== 'FINANCIAL_OR_FINAL') {
      throw new ConflictException({ code: 'INVALID_CONFIRMATION_ACTION', detail: 'The proposed tool is not final.' });
    }
    const action = domainAction(tool.tool_name);
    const args = tool.arguments;
    if (!isRecord(args)) throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'The final tool arguments are invalid.' });
    if (action === 'CREATE_RESTAURANT_RESERVATION' && typeof args.hold_id !== 'string') {
      throw new ConflictException({ code: 'HOLD_REQUIRED', detail: 'A valid restaurant hold is required before confirmation.' });
    }
    if (action === 'CONFIRM_HEALTHCARE_APPOINTMENT' && !Number.isInteger(Number(args.appointment_id))) {
      throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'A valid appointment is required before confirmation.' });
    }

    let snapshot = resource ?? {};
    if (action === 'CONFIRM_HEALTHCARE_APPOINTMENT') {
      const appointmentId = Number(args.appointment_id);
      const authoritativeAppointment = await this.healthcare.getAppointment(appointmentId, user.sub, correlationId);
      const stateError = healthcareFinalStateError(authoritativeAppointment);
      if (stateError) throw new ConflictException(stateError);
      snapshot = authoritativeAppointment;
    }
    const amount = Math.max(0, Math.trunc(Number(snapshot.price ?? args.price ?? 0) || 0));
    const currency = String(snapshot.currency ?? args.currency ?? 'VND').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'The confirmation currency is invalid.' });
    const quoteVersion = String(snapshot.resource_version ?? args.resource_version ?? args.hold_id ?? args.appointment_id ?? 'v1');
    const toolPayload = {
      tool_name: tool.tool_name,
      risk_level: tool.risk_level,
      arguments: args,
      workflow_id: tool.workflow_id,
      tool_call_id: tool.tool_call_id,
      schema_version: tool.schema_version ?? '1',
      idempotency_key: tool.idempotency_key ?? `${tool.workflow_id}-${tool.tool_call_id}`,
    };
    const payload = { ...toolPayload, resource: snapshot };
    const confirmation: ConfirmationRecord = {
      id: `cnf_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      actorId: user.sub,
      action,
      payload,
      payloadHash: stableHash(payload),
      quoteVersion,
      amount,
      currency,
      expiresAt: Date.now() + this.config.get<number>('CONFIRMATION_TTL_SECONDS', 600) * 1000,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
      version: 0,
    };
    await this.store.createConfirmation(confirmation);
    await this.store.audit({ action: 'domain_confirmation.created', actorId: user.sub, resourceId: confirmation.id, correlationId, metadata: { action, workflow_id: tool.workflow_id } });
    return {
      id: confirmation.id,
      action: confirmation.action,
      status: confirmation.status,
      workflow_id: tool.workflow_id,
      tool_name: tool.tool_name,
      tool_call_id: tool.tool_call_id,
      arguments: args,
      quote_version: confirmation.quoteVersion,
      amount: confirmation.amount,
      currency: confirmation.currency,
      expires_at: new Date(confirmation.expiresAt).toISOString(),
      ...(Object.keys(snapshot).length ? { resource: snapshot } : {}),
    };
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
    await this.store.mergeConversationState(conversationId, actorId, { last_order_id: orderId, ...(paymentId ? { last_payment_id: paymentId } : {}), pending_confirmation_id: null });
  }

  async execute(id: string, user: AuthUser, body: JsonObject, correlationId: string, idempotencyKey: string): Promise<JsonObject> {
    const existing = await this.get(id, user.sub);
    if (DOMAIN_CONFIRMATION_ACTIONS.has(existing.action)) {
      return this.executeDomain(id, user, body, correlationId, idempotencyKey);
    }
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
      const payment = await this.payments.createAndConfirm({ actorId: user.sub, orderId: String(order.id), amount: Number(order.amount), currency: String(order.currency), method: paymentMethod as 'bank_transfer' | 'card' | 'e_wallet', idempotencyKey: paymentKey, simulateFailure: body.simulate_failure === true, simulateTimeout: body.simulate_timeout === true, confirmationId: id, confirmationExecutionKey: executionKey, conversationId: typeof body.conversation_id === 'string' ? body.conversation_id : undefined });
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
      if (payment.status === 'FAILED') throw new ConflictException({ code: 'PAYMENT_FAILED', detail: 'Payment failed and the order was not placed.' });
      return result;
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code === 'CART_CHANGED' || code === 'PAYLOAD_MISMATCH' || code === 'PAYMENT_TIMEOUT' || code === 'PAYMENT_FAILED') throw error;
      if (['VOUCHER_EXPIRED', 'VOUCHER_USAGE_LIMIT', 'VOUCHER_INVALID', 'VOUCHER_NOT_APPLICABLE', 'RESTAURANT_CLOSED', 'MENU_ITEM_UNAVAILABLE', 'DELIVERY_OUT_OF_RANGE'].includes(code)) {
        const result = { confirmation_id: id, code: 'CART_CHANGED', detail: 'The authoritative Food quote changed.' };
        await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_FINAL', result, 'CART_CHANGED');
        throw new ConflictException({ code: 'CART_CHANGED', detail: 'Cart, price, voucher, delivery quote, or currency changed. Prepare a new confirmation.' });
      }
      const result = { confirmation_id: id, code, detail: 'Execution could not be completed safely.' };
      await this.store.completeConfirmation(id, user.sub, executionKey, 'FAILED_RETRYABLE', result, code);
      throw error;
    }
  }

  async executeDomain(
    id: string,
    user: AuthUser,
    body: JsonObject,
    correlationId: string,
    idempotencyKey: string,
    expectedAction?: string,
    expectedWorkflowId?: string,
  ): Promise<JsonObject> {
    const confirmation = await this.get(id, user.sub);
    if (!DOMAIN_CONFIRMATION_ACTIONS.has(confirmation.action) || (expectedAction && confirmation.action !== expectedAction)) {
      throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Confirmation action does not match this workflow.' });
    }
    const workflowId = String(confirmation.payload.workflow_id ?? '');
    if (!workflowId || (expectedWorkflowId && workflowId !== expectedWorkflowId) || (body.workflow_id !== undefined && body.workflow_id !== workflowId)) {
      throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Confirmation workflow does not match the pending action.' });
    }
    if (body.action !== undefined && body.action !== confirmation.action) {
      throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Confirmation action does not match the pending action.' });
    }
    for (const key of Object.keys(body)) {
      if (!['workflow_id', 'action'].includes(key)) {
        throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'Only workflow_id and action may accompany explicit confirmation.' });
      }
    }

    const toolPayload = confirmation.payload;
    const tool = {
      tool_name: String(toolPayload.tool_name),
      risk_level: String(toolPayload.risk_level) as DomainFinalTool['risk_level'],
      arguments: isRecord(toolPayload.arguments) ? toolPayload.arguments : {},
      workflow_id: workflowId,
      tool_call_id: String(toolPayload.tool_call_id),
      schema_version: String(toolPayload.schema_version ?? '1'),
      idempotency_key: String(toolPayload.idempotency_key ?? `${workflowId}:${toolPayload.tool_call_id}`),
    } as DomainFinalTool;
    if (tool.risk_level !== 'FINANCIAL_OR_FINAL') {
      throw new ConflictException({ code: 'PAYLOAD_MISMATCH', detail: 'The pending action is not a final operation.' });
    }

    if (confirmation.action === 'CONFIRM_HEALTHCARE_APPOINTMENT') {
      const appointmentId = Number(tool.arguments.appointment_id);
      const appointment = await this.healthcare.getAppointment(appointmentId, user.sub, correlationId);
      const stateError = healthcareFinalStateError(appointment);
      if (stateError) throw new ConflictException(stateError);
    }

    const executionHash = stableHash({ confirmation_id: id, action: confirmation.action, workflow_id: workflowId, action_body: body });
    const executionKey = `confirmation:${id}:${idempotencyKey}`;
    const claim = await this.claim(id, user, executionKey, executionHash, { workflow_id: workflowId, action: confirmation.action, tool_request: tool });
    if (claim.result) return claim.result;
    if (!claim.confirmation || claim.state !== 'CLAIMED') {
      throw new ConflictException({ code: 'CONFIRMATION_PROCESSING', detail: 'Confirmation is already being processed.', retryable: true });
    }

    try {
      if (confirmation.action === 'CONFIRM_HEALTHCARE_APPOINTMENT') {
        const appointmentId = Number(tool.arguments.appointment_id);
        const appointment = await this.healthcare.getAppointment(appointmentId, user.sub, correlationId);
        const stateError = healthcareFinalStateError(appointment);
        if (stateError) throw new ConflictException(stateError);
      }
      const toolResult = confirmation.action === 'CREATE_RESTAURANT_RESERVATION'
        ? await this.restaurant.executeTool(tool as RestaurantTool, user.sub, correlationId)
        : await this.healthcare.executeTool(tool as HealthcareTool, user.sub, correlationId, { allowFinal: true });
      const result: JsonObject = {
        confirmation_id: id,
        action: confirmation.action,
        workflow_id: workflowId,
        tool_request: tool,
        tool_result: isRecord(toolResult) ? toolResult : { data: toolResult },
      };
      await this.store.completeConfirmation(id, user.sub, executionKey, 'SUCCEEDED', result);
      await this.store.audit({ action: 'domain_confirmation.executed', actorId: user.sub, resourceId: id, correlationId, metadata: { action: confirmation.action, workflow_id: workflowId } });
      return result;
    } catch (error: unknown) {
      const retryable = error instanceof ServiceCallError
        ? !['BUSINESS', 'CLIENT', 'CONTRACT'].includes(error.category)
        : error instanceof UpstreamClientError
          ? error.retryable
          : false;
      const code = errorCode(error);
      await this.store.completeConfirmation(
        id,
        user.sub,
        executionKey,
        retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
        { confirmation_id: id, action: confirmation.action, code, detail: 'The final operation could not be completed safely.' },
        code,
      );
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
        refundRecord = await this.payments.refund(payment.id, user.sub, `food-order-refund:${confirmation.payload.order_id}:${payment.id}`, 'customer_cancellation') as unknown as JsonObject;
        await this.food.post(`/api/v1/internal/orders/${confirmation.payload.order_id}/transition`, { target_status: 'REFUND_PENDING', reason: 'Cancellation refund started', operation_key: `cancel-refund-pending:${id}` }, correlationId, `cancel-refund-pending:${id}`);
        if (String(refundRecord.status) === 'SUCCEEDED') await this.food.post(`/api/v1/internal/orders/${confirmation.payload.order_id}/transition`, { target_status: 'REFUNDED', reason: 'Cancellation refund completed', operation_key: `cancel-refunded:${confirmation.payload.order_id}:${payment.id}` }, correlationId, `cancel-refunded:${confirmation.payload.order_id}:${payment.id}`);
        if (String(refundRecord.status) !== 'SUCCEEDED') {
          const code = String(refundRecord.status) === 'FAILED' ? 'REFUND_FAILED' : 'REFUND_PENDING';
          const result = { confirmation_id: id, order, payment, refund: refundRecord, code };
          await this.store.completeConfirmation(id, user.sub, executionKey, code === 'REFUND_FAILED' ? 'FAILED_FINAL' : 'FAILED_RETRYABLE', result, code);
          throw new ConflictException({ code, detail: 'Cancellation refund has not converged yet.', retryable: code !== 'REFUND_FAILED' });
        }
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
      await this.store.completeConfirmation(id, user.sub, executionKey, code === 'REFUND_FAILED' ? 'FAILED_FINAL' : 'FAILED_RETRYABLE', result, code);
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
          const payment = await this.payments.createAndConfirm({ actorId: actor.sub, orderId: String(order.id), amount: Number(order.amount), currency: String(order.currency), method: paymentMethod as 'bank_transfer' | 'card' | 'e_wallet', idempotencyKey: paymentKey, simulateFailure: payload.simulate_failure === true, simulateTimeout: payload.simulate_timeout === true, confirmationId: confirmation.id, confirmationExecutionKey: confirmation.executionKey, conversationId: typeof payload.conversation_id === 'string' ? payload.conversation_id : undefined });
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
            refund = await this.payments.refund(payment.id, actor.sub, `food-order-refund:${orderId}:${payment.id}`, 'customer_cancellation') as unknown as JsonObject;
            await this.food.post(`/api/v1/internal/orders/${orderId}/transition`, { target_status: 'REFUND_PENDING', reason: 'Cancellation refund recovery started', operation_key: `cancel-refund-pending:${confirmation.id}` }, correlationId, `cancel-refund-pending:${confirmation.id}`);
            if (String(refund.status) === 'SUCCEEDED') await this.food.post(`/api/v1/internal/orders/${orderId}/transition`, { target_status: 'REFUNDED', reason: 'Cancellation refund recovery completed', operation_key: `cancel-refunded:${orderId}:${payment.id}` }, correlationId, `cancel-refunded:${orderId}:${payment.id}`);
            if (String(refund.status) !== 'SUCCEEDED') throw new Error(String(refund.status) === 'FAILED' ? 'REFUND_FAILED' : 'REFUND_PENDING');
          }
          const authoritativeOrder = await this.food.get(`/api/v1/orders/${orderId}`, correlationId, actor.sub);
          const result = { confirmation_id: confirmation.id, order: authoritativeOrder, payment, refund };
          await this.store.completeConfirmation(confirmation.id, actor.sub, confirmation.executionKey, 'SUCCEEDED', result);
          recovered += 1;
        }
        await this.store.releaseConfirmationRecovery(confirmation.id);
      } catch (error: unknown) {
        const code = errorCode(error);
        await this.store.completeConfirmation(confirmation.id, confirmation.actorId, confirmation.executionKey ?? '', code === 'REFUND_FAILED' ? 'FAILED_FINAL' : 'FAILED_RETRYABLE', { confirmation_id: confirmation.id, code, detail: 'Recovery will retry the same execution.' }, code);
        await this.store.releaseConfirmationRecovery(confirmation.id);
      }
    }
    return recovered;
  }

  async reconcileRecoveredPayment(payment: PaymentRecord, correlationId: string): Promise<void> {
    if (!payment.confirmationId || !payment.confirmationExecutionKey) return;
    const confirmation = await this.store.getConfirmation(payment.confirmationId);
    if (!confirmation || confirmation.actorId !== payment.actorId) return;
    const actor = { sub: payment.actorId, email: 'recovery@xone.local', role: 'customer' as const };
    if (payment.status === 'SUCCEEDED') {
      let order = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
      if (String(order.status) === 'PAYMENT_PENDING') {
        order = await this.food.post(`/api/v1/internal/orders/${payment.orderId}/transition`, { target_status: 'PAID', reason: 'Payment provider recovery succeeded', operation_key: `payment-paid:${payment.id}` }, correlationId, `payment-paid:${payment.id}`);
      }
      if (String(order.status) === 'PAID') {
        order = await this.food.post(`/api/v1/internal/orders/${payment.orderId}/transition`, { target_status: 'RESTAURANT_CONFIRMING', reason: 'Payment provider recovery succeeded', operation_key: `restaurant-confirming:${payment.id}` }, correlationId, `restaurant-confirming:${payment.id}`);
      }
      order = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
      const result = { confirmation_id: confirmation.id, order, payment };
      await this.store.completeConfirmation(confirmation.id, actor.sub, payment.confirmationExecutionKey, 'SUCCEEDED', result);
      await this.updateConversationAfterExecution(payment.conversationId, actor.sub, payment.orderId, payment.id);
    } else if (payment.status === 'FAILED') {
      await this.food.post(`/api/v1/internal/orders/${payment.orderId}/transition`, { target_status: 'PAYMENT_FAILED', reason: 'Payment provider recovery failed', operation_key: `payment-failed:${payment.id}` }, correlationId, `payment-failed:${payment.id}`);
      const order = await this.food.get(`/api/v1/orders/${encodeURIComponent(payment.orderId)}`, correlationId, payment.actorId);
      await this.store.completeConfirmation(confirmation.id, actor.sub, payment.confirmationExecutionKey, 'FAILED_FINAL', { confirmation_id: confirmation.id, order, payment, code: 'PAYMENT_FAILED' }, 'PAYMENT_FAILED');
    }
  }
}
