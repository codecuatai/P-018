import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { CoreStore, PaymentMethod, PaymentRecord, RefundRecord } from '../core/core.module';

export interface PaymentRequest { actorId: string; orderId: string; amount: number; currency: string; method: PaymentMethod; idempotencyKey: string; simulateFailure?: boolean; simulateTimeout?: boolean }
export interface PaymentProvider { authorize(input: PaymentRequest): Promise<Pick<PaymentRecord, 'status'>> }

@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  async authorize(input: PaymentRequest): Promise<Pick<PaymentRecord, 'status'>> {
    const simulationsAllowed = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    const status = simulationsAllowed && input.simulateTimeout ? 'TIMED_OUT' : simulationsAllowed && input.simulateFailure ? 'FAILED' : 'SUCCEEDED';
    return { status };
  }
}

function payloadHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

@Injectable()
export class PaymentService {
  constructor(private readonly store: CoreStore, private readonly provider: SandboxPaymentProvider) {}

  async createAndConfirm(input: PaymentRequest): Promise<PaymentRecord> {
    const normalized = { actor_id: input.actorId, order_id: input.orderId, amount: input.amount, currency: input.currency, method: input.method, simulate_failure: Boolean(input.simulateFailure), simulate_timeout: Boolean(input.simulateTimeout) };
    const payment: PaymentRecord = { id: `pay_${randomUUID().replaceAll('-', '').slice(0, 12)}`, actorId: input.actorId, orderId: input.orderId, amount: input.amount, currency: input.currency, method: input.method, status: 'PENDING', idempotencyKey: input.idempotencyKey, payloadHash: payloadHash(normalized), createdAt: new Date().toISOString() };
    const actual = await this.store.createPayment(payment);
    if (actual.payloadHash !== payment.payloadHash || actual.orderId !== payment.orderId || actual.amount !== payment.amount || actual.currency !== payment.currency || actual.method !== payment.method) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Payment idempotency key was reused with a different payload.' });
    if (actual.id !== payment.id || actual.status !== 'PENDING') return actual;
    const authorization = await this.provider.authorize(input);
    return this.store.updatePayment(actual.id, authorization.status, authorization.status === 'SUCCEEDED' ? `rcpt_${randomUUID().replaceAll('-', '').slice(0, 12)}` : undefined);
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

  async refunds(paymentId: string, actorId: string): Promise<RefundRecord[]> {
    await this.get(paymentId, actorId);
    return this.store.listRefunds(paymentId);
  }
}
