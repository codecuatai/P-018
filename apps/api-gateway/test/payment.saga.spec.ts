import { CoreStore } from '../src/modules/core/core.module';
import { SandboxPaymentProvider } from '../src/modules/payment/payment.service';

describe('durable sandbox payment provider', () => {
  it('persists a timeout attempt and exposes the eventual status without a second confirm', async () => {
    const store = new CoreStore({} as never);
    const provider = new SandboxPaymentProvider(store);
    const input = { actorId: 'usr_test', orderId: 'ord_test', paymentId: 'pay_test', amount: 1000, currency: 'VND', method: 'card' as const, idempotencyKey: 'payment-test', simulateTimeout: true, providerReference: 'sandbox:test' };

    await provider.createIntent(input);
    expect((await provider.confirm(input)).status).toBe('TIMED_OUT');
    const persisted = await store.getPaymentProviderTransaction('sandbox:test');
    expect(persisted?.confirmAttemptedAt).toBeDefined();
    expect(persisted?.attemptCount).toBe(1);
    expect((await provider.confirm(input)).status).toBe('PENDING');

    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect((await provider.getStatus('sandbox:test')).status).toBe('SUCCEEDED');
    await store.onModuleDestroy();
  });

  it('uses one persistent refund provider reference for retries', async () => {
    const store = new CoreStore({} as never);
    const provider = new SandboxPaymentProvider(store);
    const request = { refundId: 'rfd_test', providerRefundReference: 'sandbox-refund:test', paymentProviderReference: 'sandbox:test', amount: 1000, currency: 'VND', requestHash: 'refund-hash' };

    expect((await provider.createRefund(request)).status).toBe('SUCCEEDED');
    expect((await provider.createRefund(request)).status).toBe('SUCCEEDED');
    expect((await store.getRefundProviderTransaction(request.providerRefundReference))?.refundId).toBe(request.refundId);
    await store.onModuleDestroy();
  });
});
