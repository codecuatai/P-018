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

  it('does not regress a terminal confirmation to retryable', async () => {
    const repository = new InMemoryCoreRepository();
    const terminal = { ...confirmation, id: 'cnf_terminal', status: 'PENDING' as const, expiresAt: Date.now() + 60_000 };
    await repository.createConfirmation(terminal);
    await repository.claimConfirmation(terminal.id, terminal.actorId, 'confirmation:terminal', 'payload-terminal', Date.now());
    await repository.completeConfirmation(terminal.id, terminal.actorId, 'confirmation:terminal', 'FAILED_FINAL', { code: 'REFUND_FAILED' }, 'REFUND_FAILED');
    await repository.completeConfirmation(terminal.id, terminal.actorId, 'confirmation:terminal', 'FAILED_RETRYABLE', { code: 'REFUND_PENDING' }, 'REFUND_PENDING');
    expect((await repository.getConfirmation(terminal.id))?.status).toBe('FAILED_FINAL');
    expect((await repository.getConfirmation(terminal.id))?.failureCode).toBe('REFUND_FAILED');
  });

  it('atomically advances the Assistant conversation and persists one response receipt', async () => {
    const repository = new InMemoryCoreRepository();
    const firstClaim = await repository.claimAssistantActionExecution('actor-1', 'conversation-1', 'action-1', 'key-1', 'hash-1');
    expect(firstClaim.state).toBe('CLAIMED');
    const response = { conversation_id: 'conversation-1', message: 'done', items: [{ kind: 'reservation', title: 'done' }] };
    await repository.commitAssistantActionSuccess({
      actorId: 'actor-1',
      conversationId: 'conversation-1',
      actionId: 'action-1',
      idempotencyKey: 'key-1',
      requestHash: 'hash-1',
      userMessage: { role: 'user', content: 'action:restaurant_confirm', kind: 'INTERNAL_ACTION', visibility: 'INTERNAL', createdAt: new Date().toISOString() },
      assistantMessage: { role: 'assistant', content: 'done', createdAt: new Date().toISOString() },
      stateUpdates: { actions: [] },
      response,
    });

    const replay = await repository.claimAssistantActionExecution('actor-1', 'conversation-1', 'action-1', 'key-1', 'hash-1');
    expect(replay.state).toBe('SUCCEEDED');
    expect(replay.execution?.response).toEqual(response);
    expect((await repository.getAssistantActionExecution('actor-1', 'conversation-1', 'action-1'))?.response).toEqual(response);
    expect((await repository.getConversation('conversation-1', 'actor-1'))?.messages).toHaveLength(1);
    expect((await repository.claimAssistantActionExecution('actor-1', 'conversation-1', 'action-1', 'key-2', 'hash-1')).state).toBe('ACTION_NOT_AVAILABLE');
    expect((await repository.claimAssistantActionExecution('actor-1', 'conversation-1', 'action-1', 'key-1', 'hash-2')).state).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('cannot consume a persisted action when a success commit cannot validate its processing receipt', async () => {
    const repository = new InMemoryCoreRepository();
    await repository.saveConversation({
      conversationId: 'conversation-atomic-failure',
      actorId: 'actor-atomic-failure',
      messages: [],
      state: { actions: [{ id: 'action-atomic-failure' }] },
      version: 1,
    });
    await repository.claimAssistantActionExecution('actor-atomic-failure', 'conversation-atomic-failure', 'action-atomic-failure', 'key-atomic-failure', 'hash-atomic-failure');

    await expect(repository.commitAssistantActionSuccess({
      actorId: 'actor-atomic-failure',
      conversationId: 'conversation-atomic-failure',
      actionId: 'action-atomic-failure',
      idempotencyKey: 'key-atomic-failure',
      requestHash: 'changed-hash',
      userMessage: { role: 'user', content: 'action:food_confirm', kind: 'INTERNAL_ACTION', visibility: 'INTERNAL', createdAt: new Date().toISOString() },
      assistantMessage: { role: 'assistant', content: 'done', createdAt: new Date().toISOString() },
      stateUpdates: { actions: [] },
      response: { conversation_id: 'conversation-atomic-failure', message: 'done', items: [], actions: [], completed: [] },
    })).rejects.toThrow('ASSISTANT_ACTION_EXECUTION_NOT_PROCESSING');

    expect((await repository.getConversation('conversation-atomic-failure', 'actor-atomic-failure'))?.state).toEqual({ actions: [{ id: 'action-atomic-failure' }] });
    expect((await repository.getAssistantActionExecution('actor-atomic-failure', 'conversation-atomic-failure', 'action-atomic-failure'))?.status).toBe('PROCESSING');
  });

  it('reclaims retryable and stale Assistant action receipts but blocks fresh concurrency', async () => {
    const repository = new InMemoryCoreRepository();
    const first = await repository.claimAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry');
    expect(first.state).toBe('CLAIMED');
    expect((await repository.claimAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry')).state).toBe('PROCESSING');

    await repository.completeAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry', 'FAILED_RETRYABLE');
    expect((await repository.claimAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry')).state).toBe('CLAIMED');

    const records = (repository as unknown as { assistantActionExecutions: Map<string, { processingExpiresAt?: string }> }).assistantActionExecutions;
    const record = records.get(JSON.stringify(['actor-retry', 'conversation-retry', 'action-retry']));
    expect(record).toBeDefined();
    record!.processingExpiresAt = new Date(Date.now() - 1).toISOString();
    expect((await repository.claimAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry')).state).toBe('CLAIMED');

    expect((await repository.claimAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'different-key', 'hash-retry')).state).toBe('ACTION_NOT_AVAILABLE');
    await repository.completeAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry', 'FAILED_FINAL');
    expect((await repository.claimAssistantActionExecution('actor-retry', 'conversation-retry', 'action-retry', 'key-retry', 'hash-retry')).state).toBe('FAILED_FINAL');
  });

  it('projects legacy internal action messages out of public conversation reads', async () => {
    const repository = new InMemoryCoreRepository();
    await repository.saveConversation({
      conversationId: 'conversation-legacy-action',
      actorId: 'actor-legacy-action',
      messages: [
        { role: 'user', content: '__assistant_action__:food_confirm', createdAt: new Date().toISOString() },
        { role: 'user', content: 'Tôi muốn đặt phở.', createdAt: new Date().toISOString() },
        { role: 'assistant', content: 'Mình đã tìm được món phù hợp.', createdAt: new Date().toISOString() },
      ],
      state: {},
      version: 1,
    });

    const projected = await repository.getConversation('conversation-legacy-action', 'actor-legacy-action');
    expect(projected?.messages.map((message) => message.content)).toEqual([
      'Tôi muốn đặt phở.',
      'Mình đã tìm được món phù hợp.',
    ]);
  });
});
