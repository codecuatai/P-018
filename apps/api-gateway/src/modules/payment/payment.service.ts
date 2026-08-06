import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { CoreStore, PaymentMethod, PaymentRecord, PaymentStatus, RefundRecord } from '../core/core.module';

export interface PaymentRequest { actorId: string; orderId: string; amount: number; currency: string; method: PaymentMethod; idempotencyKey: string; simulateFailure?: boolean; simulateTimeout?: boolean }
export interface PaymentIntentResult { providerReference: string; intentId: string; status: PaymentStatus }
export interface PaymentStatusResult { providerReference: string; status: PaymentStatus }

export interface PaymentProvider {
  createIntent(input: PaymentRequest & { providerReference: string }): Promise<PaymentIntentResult>;
  confirm(input: PaymentRequest & { providerReference: string }): Promise<PaymentStatusResult>;
  getStatus(providerReference: string): Promise<PaymentStatusResult>;
  refund(input: { providerReference: string; amount: number; currency: string }): Promise<PaymentStatusResult>;
}

@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  private readonly statusByReference: Record<string, PaymentStatusResult> = {};

  async createIntent(input: PaymentRequest & { providerReference: string }): Promise<PaymentIntentResult> {
    const existing = this.statusByReference[input.providerReference];
    if (existing) return { ...existing, intentId: `intent:${input.providerReference}` };
    const result = { providerReference: input.providerReference, intentId: `intent:${input.providerReference}`, status: 'PENDING' as const };
    this.statusByReference[input.providerReference] = result;
    return result;
  }

  async confirm(input: PaymentRequest & { providerReference: string }): Promise<PaymentStatusResult> {
    const current = this.statusByReference[input.providerReference];
    if (current?.status === 'SUCCEEDED' || current?.status === 'FAILED') return current;
    const simulationsAllowed = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    const status: PaymentStatus = simulationsAllowed && input.simulateTimeout ? 'TIMED_OUT' : simulationsAllowed && input.simulateFailure ? 'FAILED' : 'SUCCEEDED';
    const result = { providerReference: input.providerReference, status };
    this.statusByReference[input.providerReference] = result;
    return result;
  }

  async getStatus(providerReference: string): Promise<PaymentStatusResult> {
    return this.statusByReference[providerReference] ?? { providerReference, status: 'UNKNOWN' };
  }

  async refund(input: { providerReference: string; amount: number; currency: string }): Promise<PaymentStatusResult> {
    return { providerReference: input.providerReference, status: 'SUCCEEDED' };
  }
}

function payloadHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

@Injectable()
export class PaymentService {
  constructor(private readonly store: CoreStore, private readonly provider: SandboxPaymentProvider) {}

  async createAndConfirm(input: PaymentRequest): Promise<PaymentRecord> {
    const normalized = { actor_id: input.actorId, order_id: input.orderId, amount: input.amount, currency: input.currency, method: input.method, simulate_failure: Boolean(input.simulateFailure), simulate_timeout: Boolean(input.simulateTimeout) };
    const payment: PaymentRecord = { id: `pay_${randomUUID().replaceAll('-', '').slice(0, 12)}`, actorId: input.actorId, orderId: input.orderId, amount: input.amount, currency: input.currency, method: input.method, status: 'PENDING', idempotencyKey: input.idempotencyKey, payloadHash: payloadHash(normalized), providerReference: `sandbox:${input.idempotencyKey}`, providerStatus: 'PENDING', lastCheckedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    const actual = await this.store.createPayment(payment);
    if (actual.payloadHash !== payment.payloadHash || actual.orderId !== payment.orderId || actual.amount !== payment.amount || actual.currency !== payment.currency || actual.method !== payment.method) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Payment idempotency key was reused with a different payload.' });
    if (['SUCCEEDED', 'FAILED'].includes(actual.status)) return actual;
    return this.recoverPending(actual, input);
  }

  async recoverPending(payment: PaymentRecord, input?: PaymentRequest): Promise<PaymentRecord> {
    const providerReference = payment.providerReference ?? `sandbox:${payment.idempotencyKey}`;
    await this.provider.createIntent({ actorId: payment.actorId, orderId: payment.orderId, amount: payment.amount, currency: payment.currency, method: payment.method, idempotencyKey: payment.idempotencyKey, providerReference, simulateFailure: input?.simulateFailure, simulateTimeout: input?.simulateTimeout });
    let status = await this.provider.getStatus(providerReference);
    if (status.status === 'PENDING' || status.status === 'UNKNOWN') {
      status = await this.provider.confirm({ actorId: payment.actorId, orderId: payment.orderId, amount: payment.amount, currency: payment.currency, method: payment.method, idempotencyKey: payment.idempotencyKey, providerReference, simulateFailure: input?.simulateFailure, simulateTimeout: input?.simulateTimeout });
    }
    const receiptId = status.status === 'SUCCEEDED' ? payment.receiptId ?? `rcpt_${randomUUID().replaceAll('-', '').slice(0, 12)}` : undefined;
    return this.store.updatePayment(payment.id, status.status, receiptId);
  }

  async recoverPendingPayments(): Promise<PaymentRecord[]> {
    const pending = await this.store.listPaymentsForRecovery(Date.now());
    const recovered: PaymentRecord[] = [];
    for (const payment of pending) {
      try {
        recovered.push(await this.recoverPending(payment));
      } catch {
        // Leave the persisted provider state untouched so the next worker iteration can retry it.
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
    const refund: RefundRecord = { id: `rfd_${randomUUID().replaceAll('-', '').slice(0, 12)}`, paymentId, actorId, amount: payment.amount, currency: payment.currency, reason, status: 'SUCCEEDED', idempotencyKey, payloadHash: payloadHash(normalized), createdAt: new Date().toISOString(), completedAt: new Date().toISOString() };
    let actual: RefundRecord;
    try { actual = await this.store.createRefund(refund); } catch (error) { if (error instanceof Error && error.message === 'REFUND_AMOUNT_EXCEEDED') throw new ConflictException({ code: 'REFUND_AMOUNT_EXCEEDED', detail: 'Refund total cannot exceed the payment amount.' }); throw error; }
    if (actual.payloadHash !== refund.payloadHash || actual.amount !== refund.amount || actual.reason !== refund.reason) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Refund idempotency key was reused with a different payload.' });
    return actual;
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
