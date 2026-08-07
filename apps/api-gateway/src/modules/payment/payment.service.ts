import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { CoreStore, PaymentMethod, PaymentRecord, PaymentStatus, RefundRecord } from '../core/core.module';

export interface PaymentRequest { actorId: string; orderId: string; amount: number; currency: string; method: PaymentMethod; idempotencyKey: string; simulateFailure?: boolean; simulateTimeout?: boolean; confirmationId?: string; confirmationExecutionKey?: string; conversationId?: string; paymentId?: string }
export interface PaymentIntentResult { providerReference: string; intentId: string; status: PaymentStatus; confirmationAttempted: boolean }
export interface PaymentStatusResult { providerReference: string; status: PaymentStatus }

export interface PaymentProvider {
  createIntent(input: PaymentRequest & { providerReference: string }): Promise<PaymentIntentResult>;
  confirm(input: PaymentRequest & { providerReference: string }): Promise<PaymentStatusResult>;
  getStatus(providerReference: string): Promise<PaymentStatusResult>;
  createRefund(input: { refundId: string; providerRefundReference: string; paymentProviderReference: string; amount: number; currency: string; requestHash: string; simulateFailure?: boolean }): Promise<PaymentStatusResult>;
  getRefundStatus(providerRefundReference: string): Promise<PaymentStatusResult>;
}

@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  constructor(private readonly store: CoreStore) {}

  async createIntent(input: PaymentRequest & { providerReference: string }): Promise<PaymentIntentResult> {
    const requestHash = payloadHash({ actor_id: input.actorId, order_id: input.orderId, amount: input.amount, currency: input.currency, method: input.method, provider_reference: input.providerReference });
    const existing = await this.store.getPaymentProviderTransaction(input.providerReference);
    if (existing && existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Provider reference was reused with a different payload.' });
    const transaction = await this.store.createPaymentProviderTransaction({ providerReference: input.providerReference, paymentId: input.paymentId ?? `payment:${input.providerReference}`, actorId: input.actorId, orderId: input.orderId, requestHash, providerStatus: 'CREATED', attemptCount: 0, confirmationId: input.confirmationId, executionKey: input.confirmationExecutionKey });
    return { providerReference: transaction.providerReference, intentId: `intent:${transaction.providerReference}`, status: transaction.providerStatus === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING', confirmationAttempted: Boolean(transaction.confirmAttemptedAt) };
  }

  async confirm(input: PaymentRequest & { providerReference: string }): Promise<PaymentStatusResult> {
    const simulationsAllowed = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    const current = await this.store.getPaymentProviderTransaction(input.providerReference);
    if (!current) throw new NotFoundException({ code: 'PAYMENT_PROVIDER_UNKNOWN', detail: 'Payment provider transaction not found.' });
    if (current.confirmAttemptedAt) return this.getStatus(input.providerReference);
    const intendedFinalStatus = simulationsAllowed && input.simulateFailure ? 'FAILED' : 'SUCCEEDED';
    const statusAvailableAt = simulationsAllowed && input.simulateTimeout ? new Date(Date.now() + 1500).toISOString() : new Date().toISOString();
    const transaction = await this.store.markPaymentProviderConfirmation(input.providerReference, { intendedFinalStatus, statusAvailableAt, confirmationId: input.confirmationId, executionKey: input.confirmationExecutionKey });
    return { providerReference: input.providerReference, status: simulationsAllowed && input.simulateTimeout && transaction.providerStatus === 'PENDING' ? 'TIMED_OUT' : transaction.providerStatus === 'FAILED' ? 'FAILED' : transaction.providerStatus === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING' };
  }

  async getStatus(providerReference: string): Promise<PaymentStatusResult> {
    const current = await this.store.getPaymentProviderTransaction(providerReference);
    if (!current) return { providerReference, status: 'UNKNOWN' };
    const status = current.statusAvailableAt && Date.parse(current.statusAvailableAt) <= Date.now() ? current.intendedFinalStatus ?? 'UNKNOWN' : current.providerStatus;
    const normalized = status === 'CREATED' ? 'PENDING' : status === 'PENDING' ? 'PENDING' : status as PaymentStatus;
    await this.store.markPaymentProviderChecked(providerReference, normalized === 'TIMED_OUT' ? 'UNKNOWN' : normalized);
    return { providerReference, status: normalized };
  }

  async createRefund(input: { refundId: string; providerRefundReference: string; paymentProviderReference: string; amount: number; currency: string; requestHash: string; simulateFailure?: boolean }): Promise<PaymentStatusResult> {
    const existing = await this.store.getRefundProviderTransaction(input.providerRefundReference);
    if (existing) return this.getRefundStatus(input.providerRefundReference);
    const status = process.env.NODE_ENV !== 'production' && input.simulateFailure ? 'FAILED' : 'SUCCEEDED';
    await this.store.createRefundProviderTransaction({ providerRefundReference: input.providerRefundReference, refundId: input.refundId, paymentProviderReference: input.paymentProviderReference, requestHash: input.requestHash, providerStatus: status, attemptedAt: new Date().toISOString(), statusAvailableAt: new Date().toISOString() });
    return { providerReference: input.providerRefundReference, status };
  }

  async getRefundStatus(providerRefundReference: string): Promise<PaymentStatusResult> {
    const current = await this.store.getRefundProviderTransaction(providerRefundReference);
    if (!current) return { providerReference: providerRefundReference, status: 'UNKNOWN' };
    return { providerReference: providerRefundReference, status: current.providerStatus === 'PENDING' ? 'PENDING' : current.providerStatus };
  }
}

function payloadHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

@Injectable()
export class PaymentService {
  constructor(private readonly store: CoreStore, private readonly provider: SandboxPaymentProvider) {}

  async createAndConfirm(input: PaymentRequest): Promise<PaymentRecord> {
    const normalized = { actor_id: input.actorId, order_id: input.orderId, amount: input.amount, currency: input.currency, method: input.method, simulate_failure: Boolean(input.simulateFailure), simulate_timeout: Boolean(input.simulateTimeout) };
    const payment: PaymentRecord = { id: `pay_${randomUUID().replaceAll('-', '').slice(0, 12)}`, actorId: input.actorId, orderId: input.orderId, amount: input.amount, currency: input.currency, method: input.method, status: 'PENDING', idempotencyKey: input.idempotencyKey, payloadHash: payloadHash(normalized), providerReference: `sandbox:${input.idempotencyKey}`, providerStatus: 'PENDING', lastCheckedAt: new Date().toISOString(), nextRecoveryAt: new Date().toISOString(), createdAt: new Date().toISOString(), confirmationId: input.confirmationId, confirmationExecutionKey: input.confirmationExecutionKey, conversationId: input.conversationId };
    const actual = await this.store.createPayment(payment);
    if (actual.payloadHash !== payment.payloadHash || actual.orderId !== payment.orderId || actual.amount !== payment.amount || actual.currency !== payment.currency || actual.method !== payment.method) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Payment idempotency key was reused with a different payload.' });
    if (['SUCCEEDED', 'FAILED'].includes(actual.status)) return actual;
    const intent = await this.provider.createIntent({ ...input, paymentId: actual.id, providerReference: actual.providerReference ?? `sandbox:${input.idempotencyKey}` });
    if (!intent.confirmationAttempted) {
      const result = await this.provider.confirm({ ...input, providerReference: intent.providerReference });
      return this.store.updatePayment(actual.id, result.status, result.status === 'SUCCEEDED' ? actual.receiptId ?? `rcpt_${randomUUID().replaceAll('-', '').slice(0, 12)}` : undefined, { providerStatus: result.status === 'TIMED_OUT' ? 'PENDING' : result.status, nextRecoveryAt: result.status === 'TIMED_OUT' ? new Date(Date.now() + 1000).toISOString() : undefined });
    }
    return this.recoverPending(actual);
  }

  async recoverPending(payment: PaymentRecord): Promise<PaymentRecord> {
    const providerReference = payment.providerReference ?? `sandbox:${payment.idempotencyKey}`;
    const status = await this.provider.getStatus(providerReference);
    const receiptId = status.status === 'SUCCEEDED' ? payment.receiptId ?? `rcpt_${randomUUID().replaceAll('-', '').slice(0, 12)}` : undefined;
    return this.store.updatePayment(payment.id, status.status, receiptId, { providerStatus: status.status, nextRecoveryAt: status.status === 'PENDING' || status.status === 'UNKNOWN' ? new Date(Date.now() + 1000).toISOString() : undefined });
  }

  async recoverPendingPayments(): Promise<PaymentRecord[]> {
    const pending = await this.store.listPaymentsForRecovery(Date.now());
    const recovered: PaymentRecord[] = [];
    for (const payment of pending) {
      try {
        recovered.push(await this.recoverPending(payment));
      } catch (error: unknown) {
        await this.store.updatePayment(payment.id, payment.status, undefined, { nextRecoveryAt: new Date(Date.now() + 5000).toISOString(), error: error instanceof Error ? error.message : 'PAYMENT_RECOVERY_ERROR' });
      }
    }
    return recovered;
  }

  async get(paymentId: string, actorId: string): Promise<PaymentRecord> {
    const payment = await this.store.getPayment(paymentId);
    if (!payment || payment.actorId !== actorId) throw new NotFoundException({ code: 'NOT_FOUND', detail: 'Payment not found.' });
    return payment;
  }

  async refund(paymentId: string, actorId: string, idempotencyKey: string, reason = 'customer_request'): Promise<RefundRecord> {
    const payment = await this.get(paymentId, actorId);
    if (payment.status !== 'SUCCEEDED') throw new ConflictException({ code: 'PAYMENT_NOT_REFUNDABLE', detail: 'Only a succeeded payment can be refunded.' });
    const normalized = { payment_id: paymentId, actor_id: actorId, amount: payment.amount, currency: payment.currency, reason };
    const refund: RefundRecord = { id: `rfd_${randomUUID().replaceAll('-', '').slice(0, 12)}`, paymentId, actorId, amount: payment.amount, currency: payment.currency, reason, status: 'PENDING', idempotencyKey, payloadHash: payloadHash(normalized), providerRefundReference: `sandbox-refund:${payment.orderId}:${paymentId}`, paymentProviderReference: payment.providerReference, providerStatus: 'PENDING', refundScope: 'FOOD_ORDER_FINAL_REFUND', createdAt: new Date().toISOString() };
    let actual: RefundRecord;
    try { actual = await this.store.createRefund(refund); } catch (error) { if (error instanceof Error && error.message === 'REFUND_AMOUNT_EXCEEDED') throw new ConflictException({ code: 'REFUND_AMOUNT_EXCEEDED', detail: 'Refund total cannot exceed the payment amount.' }); throw error; }
    if (actual.payloadHash !== refund.payloadHash || actual.amount !== refund.amount || actual.reason !== refund.reason) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Refund idempotency key was reused with a different payload.' });
    const providerReference = actual.providerRefundReference ?? `sandbox-refund:${payment.orderId}:${paymentId}`;
    const providerTransaction = await this.store.getRefundProviderTransaction(providerReference);
    const result = providerTransaction ? await this.provider.getRefundStatus(providerReference) : await this.provider.createRefund({ refundId: actual.id, providerRefundReference: providerReference, paymentProviderReference: payment.providerReference ?? '', amount: actual.amount, currency: actual.currency, requestHash: actual.payloadHash });
    return this.store.updateRefund(actual.id, result.status === 'SUCCEEDED' ? 'SUCCEEDED' : result.status === 'FAILED' ? 'FAILED' : 'UNKNOWN', result.status);
  }

  async receipt(paymentId: string, actorId: string): Promise<Record<string, unknown>> {
    const payment = await this.get(paymentId, actorId);
    if (payment.status !== 'SUCCEEDED') throw new ConflictException({ code: 'PAYMENT_FAILED', detail: 'Receipt is unavailable until payment succeeds.' });
    const receipt = await this.store.getReceipt(paymentId);
    if (!receipt) throw new ConflictException({ code: 'RECEIPT_UNAVAILABLE', detail: 'Receipt is not available yet.' });
    return receipt;
  }

  async refunds(paymentId: string, actorId: string): Promise<RefundRecord[]> { await this.get(paymentId, actorId); return this.store.listRefunds(paymentId); }
}
