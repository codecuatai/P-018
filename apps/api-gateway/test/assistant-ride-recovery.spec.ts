import { InMemoryCoreRepository } from '../src/modules/core/core.module';
import { AssistantService } from '../src/modules/conversation/assistant.service';
import { RideConversationService } from '../src/modules/conversation/ride-conversation.service';

describe('Unified Assistant Ride receipt recovery', () => {
  const user = { sub: 'actor-ride-recovery', email: 'demo@xone.vn', role: 'USER' };
  const quote = {
    id: 'quote_assistant_recovery',
    pickup_address: 'VinUni',
    dropoff_address: 'Ho Guom',
    vehicle_type: 'CAR_4' as const,
    distance_km: 12,
    duration_minutes: 35,
    amount: 125000,
    currency: 'VND',
    tariff_version: 'SIM_2026_08_V1',
    quote_version: 'SIM_2026_08_V1:quote_assistant_recovery',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };
  const prepared = {
    id: 'booking_assistant_recovery',
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
  const completed = {
    ...prepared,
    status: 'DRIVER_ASSIGNED' as const,
    resource_version: 3,
    payment_reference: 'pay_sandbox_assistant_recovery',
    driver: { id: 'driver_assistant_recovery', display_name: 'Minh Anh' },
  };

  it('reclaims a PROCESSING Ride action after restart with one domain side effect', async () => {
    const store = new InMemoryCoreRepository();
    const preparedByKey = new Map<string, typeof prepared>();
    const confirmedByKey = new Map<string, typeof completed>();
    let prepareSideEffects = 0;
    let confirmSideEffects = 0;
    const rideClient = {
      createQuote: jest.fn().mockResolvedValue(quote),
      getQuote: jest.fn().mockResolvedValue(quote),
      getBooking: jest.fn().mockImplementation(async (_actor: string, _context: unknown, bookingId: string) => {
        if (confirmedByKey.size) return completed;
        if (bookingId === prepared.id) return prepared;
        throw new Error('BOOKING_NOT_FOUND');
      }),
      prepareBooking: jest.fn().mockImplementation(async (_actor: string, key: string) => {
        const existing = preparedByKey.get(key);
        if (existing) return existing;
        prepareSideEffects += 1;
        preparedByKey.set(key, prepared);
        return prepared;
      }),
      confirmBooking: jest.fn().mockImplementation(async (_actor: string, key: string) => {
        const existing = confirmedByKey.get(key);
        if (existing) return existing;
        confirmSideEffects += 1;
        confirmedByKey.set(key, completed);
        return completed;
      }),
    };
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Đã cập nhật chuyến xe.' }
        : {
          planning_decision: {
            contract_version: 'core-a.v1',
            capability_catalog_version: 'gateway-observed.v1',
            tasks: [{
              task_ref: 0,
              domain: 'ride',
              operation: 'DISCOVER',
              goal: 'Đặt xe',
              normalized_request: 'Đặt xe VinUni Ho Guom',
              semantic_slots: {
                pickup_address: { value: 'VinUni', source: 'USER_EXPLICIT' },
                dropoff_address: { value: 'Ho Guom', source: 'USER_EXPLICIT' },
              },
              depends_on: [],
              missing_information: [],
              missing_authority: [],
              steps: [],
              disposition: 'READY',
            }],
            workflow_relation: 'SINGLE_TASK',
            confirmation_invalidated: false,
            blocked_task_refs: [],
            interaction_mode: 'service',
            discarded_task_refs: [],
          },
        }),
      interpret: jest.fn().mockImplementation(async (_message: string, workflowId: string) => ({
        response: 'Đã đủ dữ liệu.',
        workflow_id: workflowId,
        intent: 'request_ride_quote',
        missing_fields: [],
        state_patch: {
          active_domain: 'ride',
          slot_updates: [
            { slot: 'pickup_address', value: 'VinUni', source: 'user', confidence: 1 },
            { slot: 'dropoff_address', value: 'Ho Guom', source: 'user', confidence: 1 },
          ],
          clear_fields: [],
          revision: 1,
          pending_action: 'ride.quote.create',
        },
        tool_request: {
          tool_name: 'ride.quote.create',
          risk_level: 'READ',
          arguments: { pickup_address: 'VinUni', dropoff_address: 'Ho Guom', vehicle_type: 'CAR_4' },
          workflow_id: workflowId,
        },
      })),
    };
    const tools = { require: jest.fn().mockReturnValue({ toolName: 'ride.quote.create' }) };
    const locations = {
      realMode: true,
      geocode: jest.fn(async (address: string) => ({ provider: 'geoapify', status: 'RESOLVED', query: address, candidates: [{ address_text: address, latitude: 20.9914, longitude: 105.945975, confidence: 1 }] })),
      route: jest.fn(async (origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) => ({ provider: 'geoapify', status: 'RESOLVED', distance_km: 15, duration_minutes: 15, origin, destination, route_distance_meters: 15_000, route_duration_seconds: 900, route_geometry: [origin, { latitude: 21.0102, longitude: 105.9001 }, destination], route_polyline: null, route_snapshot_hash: 'recovery-route' })),
    };
    const makeService = () => {
      const rideWorkflow = new RideConversationService(agent as never, rideClient as never, tools as never, locations as never);
      return new AssistantService(
        store as never,
        agent as never,
        { executeTool: jest.fn() } as never,
        { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
        rideWorkflow as never,
        {} as never,
      );
    };

    const firstService = makeService();
    const first = await firstService.chat(user, 'Đặt xe từ VinUni đến Ho Guom', undefined, 'cor-ride-recovery-1');
    const rideServiceAction = first.actions.find((action) => action.kind === 'ride_service');
    expect(rideServiceAction).toBeDefined();

    const commit = store.commitAssistantActionSuccess.bind(store);
    let failCommit = true;
    jest.spyOn(store, 'commitAssistantActionSuccess').mockImplementation(async (value) => {
      if (failCommit) {
        failCommit = false;
        throw new Error('injected-core-commit-failure');
      }
      return commit(value);
    });

    await expect(firstService.act(user, { conversation_id: first.conversation_id, action_id: rideServiceAction!.id }, 'cor-ride-recovery-2', 'ride-service-key')).rejects.toMatchObject({ response: { code: 'ASSISTANT_ACTION_COMMIT_RETRY', retryable: true } });
    expect(prepareSideEffects).toBe(1);
    expect((await store.getAssistantActionExecution(user.sub, first.conversation_id, rideServiceAction!.id))?.status).toBe('PROCESSING');

    const executionKey = JSON.stringify([user.sub, first.conversation_id, rideServiceAction!.id]);
    const executions = (store as unknown as { assistantActionExecutions: Map<string, { processingExpiresAt?: string }> }).assistantActionExecutions;
    executions.get(executionKey)!.processingExpiresAt = new Date(Date.now() - 1).toISOString();

    const restartedService = makeService();
    const recovered = await restartedService.act(user, { conversation_id: first.conversation_id, action_id: rideServiceAction!.id }, 'cor-ride-recovery-3', 'ride-service-key');
    expect(prepareSideEffects).toBe(1);
    expect(recovered.actions.map((action) => action.kind)).toEqual(['ride_payment']);
    expect((await store.getAssistantActionExecution(user.sub, first.conversation_id, rideServiceAction!.id))?.status).toBe('SUCCEEDED');

    await expect(restartedService.act(user, { conversation_id: first.conversation_id, action_id: rideServiceAction!.id }, 'cor-ride-recovery-4', 'different-ride-key')).rejects.toMatchObject({ response: { code: 'ACTION_NOT_AVAILABLE' } });

    const paymentAction = recovered.actions[0];
    const paymentRestart = makeService();
    const completedResponse = await paymentRestart.act(user, { conversation_id: first.conversation_id, action_id: paymentAction.id }, 'cor-ride-recovery-5', 'ride-payment-key');
    expect(confirmSideEffects).toBe(1);
    expect(completedResponse.completed[0].kind).toBe('ride_booking');
    expect(completedResponse.actions).toEqual([]);
    expect(await paymentRestart.act(user, { conversation_id: first.conversation_id, action_id: paymentAction.id }, 'cor-ride-recovery-6', 'ride-payment-key')).toEqual(completedResponse);
  });
});
