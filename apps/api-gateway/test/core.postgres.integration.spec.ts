import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

import { ConfirmationRecord, PaymentRecord, PostgresCoreRepository } from '../src/modules/core/core.module';

const databaseUrl = process.env.CORE_TEST_DATABASE_URL;
const integration = databaseUrl ? it : it.skip;
jest.setTimeout(30_000);

describe('Core PostgreSQL persistence', () => {
  let repository: PostgresCoreRepository;

  beforeAll(async () => {
    if (!databaseUrl) return;
    const migrationPool = new Pool({ connectionString: databaseUrl });
    for (const name of [
      '001_core_vertical_slice.sql',
      '002_core_persistence_slice.sql',
      '003_core_atomicity.sql',
      '004_core_recovery.sql',
      '005_core_payment_provider_saga.sql',
      '006_core_payment_recovery_claims.sql',
      '007_core_assistant_action_executions.sql',
      '008_core_assistant_action_recovery.sql',
      '009_core_auth.sql',
      '010_core_personal_context.sql',
      '011_core_multi_service_workflows.sql',
      '012_core_product_ops.sql',
      '013_core_admin_support_idempotency.sql',
      '014_core_memory_system.sql',
    ]) await migrationPool.query(await readFile(resolve(__dirname, '..', 'migrations', name), 'utf8'));
    await migrationPool.end();
    repository = new PostgresCoreRepository(databaseUrl);
  });

  afterAll(async () => { if (repository) await repository.close(); });

  integration('claims one confirmation across concurrent repository requests', async () => {
    const value: ConfirmationRecord = { id: `cnf_pg_${Date.now()}`, actorId: 'usr_pg_test', action: 'PLACE_FOOD_ORDER', payload: { cart_id: 'cart_pg' }, payloadHash: 'confirmation-pg', quoteVersion: 'v1', amount: 1000, currency: 'VND', expiresAt: Date.now() + 60_000, createdAt: new Date().toISOString(), status: 'PENDING', version: 0 };
    await repository.createConfirmation(value);
    const claims = await Promise.all([repository.claimConfirmation(value.id, value.actorId, `${value.id}:a`, 'payload-a', Date.now()), repository.claimConfirmation(value.id, value.actorId, `${value.id}:b`, 'payload-b', Date.now())]);
    expect(claims.filter((claim) => claim.state === 'CLAIMED')).toHaveLength(1);
    expect(claims.filter((claim) => claim.state === 'PROCESSING')).toHaveLength(1);
  });

  integration('returns actual persisted payment and refund rows after conflicts', async () => {
    const payment: PaymentRecord = { id: `pay_pg_${Date.now()}`, actorId: 'usr_pg_test', orderId: `ord_pg_${Date.now()}`, amount: 1000, currency: 'VND', method: 'card', status: 'SUCCEEDED', idempotencyKey: `payment-pg-${Date.now()}`, payloadHash: 'payment-pg', createdAt: new Date().toISOString(), receiptId: `rcpt_pg_${Date.now()}` };
    const first = await repository.createPayment(payment);
    const retry = await repository.createPayment({ ...payment, id: `different-${payment.id}` });
    expect(retry.id).toBe(first.id);
    const refundKey = `refund-pg-${Date.now()}`;
    const refund = { id: `rfd_pg_${Date.now()}`, paymentId: first.id, actorId: first.actorId, amount: first.amount, currency: first.currency, reason: 'test', status: 'SUCCEEDED' as const, idempotencyKey: refundKey, payloadHash: 'refund-pg', createdAt: new Date().toISOString(), completedAt: new Date().toISOString() };
    const stored = await repository.createRefund(refund);
    expect((await repository.createRefund({ ...refund, id: `different-${refund.id}` })).id).toBe(stored.id);
    await expect(repository.createRefund({ ...refund, id: `second-${refund.id}`, idempotencyKey: `${refundKey}-other` })).rejects.toThrow('REFUND_AMOUNT_EXCEEDED');
  });

  integration('persists provider state, conversation appends, and one queue claim', async () => {
    const suffix = Date.now();
    const payment: PaymentRecord = { id: `pay_provider_${suffix}`, actorId: 'usr_pg_provider', orderId: `ord_provider_${suffix}`, amount: 1000, currency: 'VND', method: 'card', status: 'PENDING', idempotencyKey: `provider-payment-${suffix}`, payloadHash: 'provider-hash', createdAt: new Date().toISOString(), providerReference: `sandbox:provider:${suffix}` };
    await repository.createPayment(payment);
    const provider = await repository.createPaymentProviderTransaction({ providerReference: payment.providerReference!, paymentId: payment.id, actorId: payment.actorId, orderId: payment.orderId, requestHash: 'provider-hash', providerStatus: 'CREATED', attemptCount: 0 });
    expect((await repository.getPaymentProviderTransaction(provider.providerReference))?.paymentId).toBe(payment.id);
    const conversation = await repository.appendConversationTurn({ conversationId: `conv_provider_${suffix}`, actorId: payment.actorId, userMessage: { role: 'user', content: 'hello', createdAt: new Date().toISOString() }, assistantMessage: { role: 'assistant', content: 'hi', createdAt: new Date().toISOString() }, stateUpdates: { cart_id: 'cart_1' } });
    expect(conversation.messages).toHaveLength(2);
    await repository.upsertWorkflowReconciliation({ orderId: payment.orderId, actorId: payment.actorId, paymentId: payment.id, status: 'RETRYABLE', attemptCount: 0, nextAttemptAt: new Date().toISOString() });
    const claimed = await repository.claimDueWorkflowReconciliations(new Date().toISOString(), 10, `test:${suffix}`);
    expect(claimed.map((item) => item.orderId)).toContain(payment.orderId);
  });

  integration('atomically persists one Assistant action conversation turn and receipt', async () => {
    const suffix = Date.now();
    const actorId = `usr_pg_assistant_${suffix}`;
    const conversationId = `conv_pg_assistant_${suffix}`;
    const actionId = `act_pg_assistant_${suffix}`;
    const response = { conversation_id: conversationId, message: 'done', items: [], actions: [], completed: [] };
    expect((await repository.claimAssistantActionExecution(actorId, conversationId, actionId, 'assistant-key-1', 'assistant-hash')).state).toBe('CLAIMED');
    await repository.commitAssistantActionSuccess({
      actorId,
      conversationId,
      actionId,
      idempotencyKey: 'assistant-key-1',
      requestHash: 'assistant-hash',
      userMessage: { role: 'user', content: 'action:food_confirm', kind: 'INTERNAL_ACTION', visibility: 'INTERNAL', createdAt: new Date().toISOString() },
      assistantMessage: { role: 'assistant', content: 'done', createdAt: new Date().toISOString() },
      stateUpdates: { actions: [] },
      response,
    });
    const replay = await repository.claimAssistantActionExecution(actorId, conversationId, actionId, 'assistant-key-1', 'assistant-hash');
    expect(replay.state).toBe('SUCCEEDED');
    expect(replay.execution?.response).toEqual(response);
    expect((await repository.getConversation(conversationId, actorId))?.messages).toHaveLength(1);
    expect((await repository.claimAssistantActionExecution(actorId, conversationId, actionId, 'assistant-key-2', 'assistant-hash')).state).toBe('ACTION_NOT_AVAILABLE');
  });

  integration('rolls back the conversation append when receipt response persistence fails', async () => {
    const suffix = Date.now();
    const actorId = `usr_pg_assistant_rollback_${suffix}`;
    const conversationId = `conv_pg_assistant_rollback_${suffix}`;
    const actionId = `act_pg_assistant_rollback_${suffix}`;
    await repository.saveConversation({
      conversationId,
      actorId,
      messages: [],
      state: { actions: [{ id: actionId }] },
      version: 1,
    });
    expect((await repository.claimAssistantActionExecution(actorId, conversationId, actionId, 'assistant-rollback-key', 'assistant-rollback-hash')).state).toBe('CLAIMED');

    await expect(repository.commitAssistantActionSuccess({
      actorId,
      conversationId,
      actionId,
      idempotencyKey: 'assistant-rollback-key',
      requestHash: 'assistant-rollback-hash',
      userMessage: { role: 'user', content: 'action:food_confirm', kind: 'INTERNAL_ACTION', visibility: 'INTERNAL', createdAt: new Date().toISOString() },
      assistantMessage: { role: 'assistant', content: 'done', createdAt: new Date().toISOString() },
      stateUpdates: { actions: [] },
      // This fails while serializing response_json after the conversation
      // update query has run, so the repository transaction must roll it back.
      response: { unsafe_test_value: BigInt(1) } as unknown as Record<string, unknown>,
    })).rejects.toThrow();

    expect((await repository.getConversation(conversationId, actorId))?.messages).toEqual([]);
    expect((await repository.getConversation(conversationId, actorId))?.state).toEqual({ actions: [{ id: actionId }] });
    expect((await repository.getAssistantActionExecution(actorId, conversationId, actionId))?.status).toBe('PROCESSING');
  });
});
