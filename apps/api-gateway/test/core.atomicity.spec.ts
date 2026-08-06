import { InMemoryCoreRepository, PaymentRecord, RefundRecord } from '../src/modules/core/core.module';

const confirmation = {
  id: 'cnf_test_001',
  actorId: 'usr_demo_001',
  action: 'PLACE_FOOD_ORDER',
  payload: { cart_id: 'cart_1' },
  payloadHash: 'confirmation-hash',
  quoteVersion: 'food-quote-v2',
  amount: 100000,
  currency: 'VND',
  expiresAt: Date.now() + 60_000,
  createdAt: new Date().toISOString(),
  status: 'PENDING' as const,
  version: 0,
};

describe('Core atomicity adapter', () => {
  it('allows only one concurrent confirmation claim across different keys', async () => {
    const repository = new InMemoryCoreRepository();
    await repository.createConfirmation(confirmation);
    const claims = await Promise.all([
      repository.claimConfirmation(confirmation.id, confirmation.actorId, 'confirmation:one', 'payload-one', Date.now()),
      repository.claimConfirmation(confirmation.id, confirmation.actorId, 'confirmation:two', 'payload-two', Date.now()),
    ]);
    expect(claims.filter((claim) => claim.state === 'CLAIMED')).toHaveLength(1);
    expect(claims.filter((claim) => claim.state === 'PROCESSING')).toHaveLength(1);
  });

  it('returns the persisted payment row and rejects changed idempotency payloads', async () => {
    const repository = new InMemoryCoreRepository();
    const payment: PaymentRecord = { id: 'pay_a', actorId: 'usr_demo_001', orderId: 'ord_a', amount: 100000, currency: 'VND', method: 'card', status: 'SUCCEEDED', idempotencyKey: 'payment:a', payloadHash: 'hash-a', createdAt: new Date().toISOString(), receiptId: 'rcpt_a' };
    const first = await repository.createPayment(payment);
    const retry = await repository.createPayment({ ...payment, id: 'pay_b', payloadHash: 'hash-b' });
    expect(retry.id).toBe(first.id);
    expect(retry.payloadHash).toBe('hash-a');
  });

  it('guards refund total and preserves one refund per key', async () => {
    const repository = new InMemoryCoreRepository();
    const payment: PaymentRecord = { id: 'pay_refund', actorId: 'usr_demo_001', orderId: 'ord_refund', amount: 100000, currency: 'VND', method: 'card', status: 'SUCCEEDED', idempotencyKey: 'payment:refund', payloadHash: 'payment-hash', createdAt: new Date().toISOString() };
    await repository.createPayment(payment);
    const refund: RefundRecord = { id: 'refund_a', paymentId: payment.id, actorId: payment.actorId, amount: payment.amount, currency: payment.currency, reason: 'restaurant_rejection', status: 'SUCCEEDED', idempotencyKey: 'refund:key', payloadHash: 'refund-hash', createdAt: new Date().toISOString(), completedAt: new Date().toISOString() };
    const first = await repository.createRefund(refund);
    const retry = await repository.createRefund({ ...refund, id: 'refund_b' });
    expect(retry.id).toBe(first.id);
    await expect(repository.createRefund({ ...refund, id: 'refund_c', idempotencyKey: 'refund:other' })).rejects.toThrow('REFUND_AMOUNT_EXCEEDED');
  });

  it('reclaims stale processing confirmations and resumes failed-retryable executions', async () => {
    const repository = new InMemoryCoreRepository();
    const stale = { ...confirmation, id: 'cnf_stale', status: 'PENDING' as const, expiresAt: Date.now() + 60_000 };
    await repository.createConfirmation(stale);
    const first = await repository.claimConfirmation(stale.id, stale.actorId, 'confirmation:stale', 'payload-stale', Date.now(), { payment_method: 'card' });
    expect(first.state).toBe('CLAIMED');
    await repository.completeConfirmation(stale.id, stale.actorId, 'confirmation:stale', 'FAILED_RETRYABLE', { code: 'PAYMENT_TIMEOUT' }, 'PAYMENT_TIMEOUT');
    const retry = await repository.claimConfirmation(stale.id, stale.actorId, 'confirmation:stale', 'payload-stale', Date.now(), { payment_method: 'card' });
    expect(retry.state).toBe('CLAIMED');
    const staleRows = await repository.claimStaleConfirmations(Date.now() - 1000, Date.now(), 10);
    expect(staleRows).toHaveLength(0);
  });
});
