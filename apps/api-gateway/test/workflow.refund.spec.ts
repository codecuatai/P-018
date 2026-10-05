import { WorkflowService } from '../src/modules/workflow/workflow.module';

describe('workflow refund reconciliation terminal semantics', () => {
  it('terminalizes a failed refund and does not reclaim it on the next poll', async () => {
    const work = { orderId: 'ord_refund_failed', actorId: 'usr_refund_failed', paymentId: 'pay_refund_failed', status: 'RESTAURANT_REJECTED', attemptCount: 1, nextAttemptAt: new Date().toISOString() };
    const payment = { id: work.paymentId, orderId: work.orderId, actorId: work.actorId, status: 'SUCCEEDED' };
    const claims = [[work], []];
    const store = {
      listPaymentsForReconciliation: jest.fn().mockResolvedValue([]),
      claimDueWorkflowReconciliations: jest.fn().mockImplementation(async () => claims.shift() ?? []),
      getPayment: jest.fn().mockResolvedValue(payment),
      listRefunds: jest.fn().mockResolvedValue([]),
      upsertWorkflowReconciliation: jest.fn().mockResolvedValue(undefined),
      checkHealth: jest.fn().mockResolvedValue(true),
    };
    const food = {
      get: jest.fn().mockResolvedValue({ id: work.orderId, status: 'RESTAURANT_REJECTED' }),
      post: jest.fn().mockResolvedValue({ status: 'REFUND_PENDING' }),
    };
    const payments = {
      refund: jest.fn().mockResolvedValue({ id: 'rfd_refund_failed', status: 'FAILED' }),
      recoverPendingPayments: jest.fn().mockResolvedValue([]),
    };
    const confirmations = {
      recoverStaleConfirmations: jest.fn().mockResolvedValue(0),
      reconcileRecoveredPayment: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue('false') };
    const service = new WorkflowService(food as never, confirmations as never, store as never, payments as never, config as never);

    await service['runReconciliation']();
    await service['runReconciliation']();

    expect(payments.refund).toHaveBeenCalledTimes(1);
    expect(store.claimDueWorkflowReconciliations).toHaveBeenCalledTimes(2);
    const terminal = store.upsertWorkflowReconciliation.mock.calls[0][0];
    expect(terminal).toMatchObject({ status: 'REFUND_FAILED', lastErrorCode: 'REFUND_FAILED', completedAt: expect.any(String) });
    expect(terminal.nextAttemptAt).toBeUndefined();
    expect(food.post).toHaveBeenCalledWith(expect.stringContaining('/transition'), expect.objectContaining({ target_status: 'REFUND_PENDING' }), expect.any(String), expect.any(String));
    expect(food.post).not.toHaveBeenCalledWith(expect.stringContaining('/transition'), expect.objectContaining({ target_status: 'REFUNDED' }), expect.anything(), expect.anything());
  });

  it('backs off failed order discovery and keeps retrying it without rediscovering every poll', async () => {
    const payment = { id: 'pay_discovery_retry', orderId: 'ord_discovery_retry', actorId: 'usr_discovery_retry', status: 'SUCCEEDED' };
    const upserts: Array<Record<string, unknown>> = [];
    const store = {
      listPaymentsForReconciliation: jest.fn().mockResolvedValue([payment]),
      claimDueWorkflowReconciliations: jest.fn().mockResolvedValue([]),
      getPayment: jest.fn().mockResolvedValue(payment),
      upsertWorkflowReconciliation: jest.fn(async (value: Record<string, unknown>) => { upserts.push(value); return value; }),
      checkHealth: jest.fn().mockResolvedValue(true),
    };
    const food = { get: jest.fn().mockRejectedValue(new Error('Upstream Client Error')) };
    const payments = { recoverPendingPayments: jest.fn().mockResolvedValue([]) };
    const confirmations = { recoverStaleConfirmations: jest.fn().mockResolvedValue(0) };
    const config = { get: jest.fn().mockReturnValue('false') };
    const service = new WorkflowService(food as never, confirmations as never, store as never, payments as never, config as never);

    await service['runReconciliation']();
    service['lastDiscoveryAt'] = Date.now();
    store.claimDueWorkflowReconciliations.mockResolvedValueOnce([{
      orderId: payment.orderId,
      actorId: payment.actorId,
      paymentId: payment.id,
      status: 'DISCOVERY_RETRY',
      attemptCount: 1,
    }]);
    food.get.mockResolvedValueOnce({ id: payment.orderId, status: 'PREPARING' });
    await service['runReconciliation']();

    expect(food.get).toHaveBeenCalledTimes(2);
    expect(upserts[0]).toMatchObject({ status: 'DISCOVERY_RETRY', lastErrorCode: 'Upstream Client Error' });
    expect(upserts[0].nextAttemptAt).toEqual(expect.any(String));
    expect(upserts[1]).toMatchObject({ status: 'DISCOVERY_RETRY', lastErrorCode: undefined });
    expect(upserts[1].completedAt).toBeUndefined();
  });
});
