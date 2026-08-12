import { createHash } from 'crypto';

import { RideConversationService } from '../src/modules/conversation/ride-conversation.service';

describe('Unified Ride workflow hydration', () => {
  const quote = {
    id: 'quote_restart_001',
    pickup_address: 'VinUni',
    dropoff_address: 'Ho Guom',
    vehicle_type: 'CAR_4' as const,
    distance_km: 12,
    duration_minutes: 35,
    amount: 125000,
    currency: 'VND',
    tariff_version: 'SIM_2026_08_V1',
    quote_version: 'SIM_2026_08_V1:quote_restart_001',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };
  const prepared = {
    id: 'ride_restart_001',
    quote_id: quote.id,
    quote_version: quote.quote_version,
    amount: quote.amount,
    currency: quote.currency,
    status: 'AWAITING_CONFIRMATION' as const,
    resource_version: 1,
    payment_reference: null,
    driver: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const confirmed = {
    ...prepared,
    status: 'DRIVER_ASSIGNED' as const,
    resource_version: 3,
    payment_reference: 'pay_sandbox_restart',
    driver: { id: 'driver_restart', display_name: 'Minh Anh' },
  };

  function dependencies() {
    let authoritativeBooking: typeof prepared | typeof confirmed = prepared;
    const ride = {
      createQuote: jest.fn().mockResolvedValue(quote),
      getQuote: jest.fn().mockResolvedValue(quote),
      prepareBooking: jest.fn().mockImplementation(async () => {
        authoritativeBooking = prepared;
        return prepared;
      }),
      confirmBooking: jest.fn().mockImplementation(async () => {
        authoritativeBooking = confirmed;
        return confirmed;
      }),
      getBooking: jest.fn().mockImplementation(async () => authoritativeBooking),
    };
    const agent = {
      interpret: jest.fn().mockImplementation((_message: string, workflowId: string) => ({
        response: 'Đã đủ dữ liệu.',
        workflow_id: workflowId,
        intent: 'request_ride_quote',
        missing_fields: [],
        state_patch: {
          active_domain: 'ride',
          slot_updates: [
            { slot: 'pickup_address', value: quote.pickup_address, source: 'user', confidence: 1 },
            { slot: 'dropoff_address', value: quote.dropoff_address, source: 'user', confidence: 1 },
          ],
          clear_fields: [],
          revision: 1,
          pending_action: 'ride.quote.create',
        },
        tool_request: {
          tool_name: 'ride.quote.create',
          risk_level: 'READ',
          arguments: {
            pickup_address: quote.pickup_address,
            dropoff_address: quote.dropoff_address,
            vehicle_type: quote.vehicle_type,
          },
          workflow_id: workflowId,
        },
      })),
    };
    const tools = { require: jest.fn().mockReturnValue({ toolName: 'ride.quote.create' }) };
    return { ride, agent, tools };
  }

  it('re-reads the authoritative quote after a Gateway restart and prepares once', async () => {
    const first = dependencies();
    const initial = new RideConversationService(first.agent as never, first.ride as never, first.tools as never);
    const workflowId = 'gw_restart_quote_workflow';
    await initial.chat('actor-restart', 'Đặt xe từ VinUni đến Ho Guom', workflowId, 'cor-before-restart');

    const restarted = new RideConversationService(first.agent as never, first.ride as never, first.tools as never);
    await restarted.hydrateWorkflow('actor-restart', workflowId, { quoteId: quote.id }, 'cor-after-restart');
    const result = await restarted.confirmService('actor-restart', workflowId, 'cor-service');

    expect(result.stage).toBe('PAYMENT_CONFIRMATION');
    expect(first.ride.getQuote).toHaveBeenCalledWith(
      'actor-restart',
      expect.objectContaining({ workflowId }),
      quote.id,
    );
    expect(first.ride.prepareBooking).toHaveBeenCalledTimes(1);
    expect(first.ride.prepareBooking.mock.calls[0][1]).toBe(
      'gw_prepare_' + createHash('sha256').update(`${workflowId}|${quote.id}`, 'utf8').digest('hex').slice(0, 32),
    );
  });

  it('re-reads the authoritative booking after a second Gateway restart and completes payment once', async () => {
    const first = dependencies();
    const quoteWorkflow = new RideConversationService(first.agent as never, first.ride as never, first.tools as never);
    const workflowId = 'gw_restart_payment_workflow';
    await quoteWorkflow.chat('actor-restart', 'Đặt xe từ VinUni đến Ho Guom', workflowId, 'cor-quote');

    const serviceRestart = new RideConversationService(first.agent as never, first.ride as never, first.tools as never);
    await serviceRestart.hydrateWorkflow('actor-restart', workflowId, { quoteId: quote.id }, 'cor-hydrate-service');
    await serviceRestart.confirmService('actor-restart', workflowId, 'cor-service');

    const paymentRestart = new RideConversationService(first.agent as never, first.ride as never, first.tools as never);
    await paymentRestart.hydrateWorkflow('actor-restart', workflowId, { quoteId: quote.id, bookingId: prepared.id }, 'cor-hydrate-payment');
    const result = await paymentRestart.confirmPayment('actor-restart', workflowId, 'cor-payment');

    expect(result.stage).toBe('COMPLETED');
    expect(result.booking?.status).toBe('DRIVER_ASSIGNED');
    expect(first.ride.getBooking).toHaveBeenCalledWith(
      'actor-restart',
      expect.objectContaining({ workflowId }),
      prepared.id,
    );
    expect(first.ride.confirmBooking).toHaveBeenCalledTimes(1);
  });
});
