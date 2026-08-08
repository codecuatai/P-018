import { ConflictException } from '@nestjs/common';

import { ConfirmationService } from '../src/modules/confirmation/confirmation.service';

function cancellationConfirmation(status: 'PENDING' | 'PROCESSING' = 'PENDING') {
  return {
    id: 'cnf_cancel_regression',
    actorId: 'usr_cancel_regression',
    action: 'CANCEL_FOOD_ORDER',
    payload: { order_id: 'ord_cancel_regression', current_status: 'RESTAURANT_CONFIRMING', snapshot_hash: 'snapshot', refund_amount: { amount: 1000, currency: 'VND' }, policy_version: 'v1' },
    payloadHash: 'confirmation-hash',
    quoteVersion: 'v1',
    amount: 1000,
    currency: 'VND',
    expiresAt: Date.now() + 60_000,
    createdAt: new Date().toISOString(),
    status,
    executionKey: 'confirmation:cnf_cancel_regression:cancel-key',
    version: 0,
  };
}

function dependencies(confirmation: ReturnType<typeof cancellationConfirmation>) {
  const store = {
    getConfirmation: jest.fn().mockResolvedValue(confirmation),
    claimConfirmation: jest.fn().mockResolvedValue({ state: 'CLAIMED', confirmation }),
    findPaymentByOrder: jest.fn().mockResolvedValue({ id: 'pay_cancel_regression', actorId: confirmation.actorId, status: 'SUCCEEDED' }),
    completeConfirmation: jest.fn().mockResolvedValue(undefined),
    getExecution: jest.fn().mockResolvedValue({ payload: { cancel_idempotency_key: 'cancel-recovery-key' } }),
    claimStaleConfirmations: jest.fn().mockResolvedValue([]),
    releaseConfirmationRecovery: jest.fn().mockResolvedValue(undefined),
    audit: jest.fn().mockResolvedValue(undefined),
  };
  const food = {
    post: jest.fn(async (path: string) => {
      if (path.includes('cancel-preview')) return { current_status: 'RESTAURANT_CONFIRMING', snapshot_hash: 'snapshot', refund_amount: { amount: 1000, currency: 'VND' }, policy_version: 'v1' };
      if (path.endsWith('/cancel')) return { id: 'ord_cancel_regression', status: 'CANCELLED' };
      return {};
    }),
    get: jest.fn().mockResolvedValue({ id: 'ord_cancel_regression', status: 'REFUND_PENDING' }),
  };
  const payments = { refund: jest.fn().mockResolvedValue({ status: 'FAILED' }) };
  const config = { get: jest.fn().mockReturnValue(600) };
  return { store, food, payments, config, service: new ConfirmationService(store as never, food as never, payments as never, config as never) };
}

describe('confirmation refund terminal semantics', () => {
  it('keeps foreground REFUND_FAILED as FAILED_FINAL', async () => {
    const confirmation = cancellationConfirmation();
    const { service, store } = dependencies(confirmation);

    await expect(service.executeCancellation(confirmation.id, { sub: confirmation.actorId, email: 'test@example.invalid', role: 'customer' }, 'correlation', 'cancel-key')).rejects.toBeInstanceOf(ConflictException);

    const last = store.completeConfirmation.mock.calls.at(-1);
    expect(last?.[3]).toBe('FAILED_FINAL');
    expect(last?.[5]).toBe('REFUND_FAILED');
  });

  it('keeps stale recovery REFUND_FAILED as FAILED_FINAL', async () => {
    const confirmation = cancellationConfirmation('PROCESSING');
    const { service, store } = dependencies(confirmation);
    store.claimStaleConfirmations.mockResolvedValue([confirmation]);

    await expect(service.recoverStaleConfirmations('correlation')).resolves.toBe(0);

    const last = store.completeConfirmation.mock.calls.at(-1);
    expect(last?.[3]).toBe('FAILED_FINAL');
    expect(last?.[5]).toBe('REFUND_FAILED');
  });
});
