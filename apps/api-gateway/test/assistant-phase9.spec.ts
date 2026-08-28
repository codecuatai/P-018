import { ServiceCallError } from '../src/resilience/service-call-error';
import { InMemoryCoreRepository } from '../src/modules/core/core.module';
import { AssistantService } from '../src/modules/conversation/assistant.service';

describe('Phase 9 assistant runtime acceptance', () => {
  const user = { sub: 'actor-phase9', email: 'phase9@xone.vn', role: 'USER' };

  function planner(tasks: Array<Record<string, unknown>>) {
    const typedTasks = tasks.map((task, taskRef) => ({
      task_ref: taskRef,
      domain: task.domain,
      operation: 'DISCOVER',
      goal: task.goal,
      normalized_request: task.normalized_request,
      semantic_slots: Object.fromEntries(Object.entries(task.extracted_slots as Record<string, unknown>).map(([field, value]) => [field, { value, source: 'USER_EXPLICIT' }])),
      depends_on: task.depends_on ?? [],
      missing_information: [],
      missing_authority: [],
      steps: [],
      disposition: 'READY',
    }));
    return {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã cập nhật trạng thái các dịch vụ.' }
        : {
          planning_decision: {
            contract_version: 'core-a.v1',
            capability_catalog_version: 'gateway-observed.v1',
            tasks: typedTasks,
            workflow_relation: typedTasks.some((task) => (task.depends_on as unknown[]).length > 0) ? 'DEPENDENT_TASKS' : 'INDEPENDENT_TASKS',
            confirmation_invalidated: false,
            blocked_task_refs: [],
            interaction_mode: 'service',
            discarded_task_refs: [],
          },
        }),
    };
  }

  it('does not execute a dependent Ride when Restaurant preparation fails', async () => {
    const store = new InMemoryCoreRepository();
    const agent = planner([
      { domain: 'restaurant', goal: 'Restaurant', normalized_request: 'Restaurant', extracted_slots: { location: 'Hanoi', party_size: 2, start_at: '2099-01-01T19:00:00+07:00' } },
      { domain: 'ride', goal: 'Ride', normalized_request: 'Ride to restaurant', extracted_slots: { pickup_address: 'VinUni', dropoff_address: 'restaurant' }, depends_on: [0] },
    ]);
    const restaurant = { executeTool: jest.fn().mockRejectedValue(new Error('restaurant unavailable')) };
    const ride = { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() };
    const service = new AssistantService(
      store as never,
      agent as never,
      restaurant as never,
      { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
      ride as never,
      { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never,
    );

    const response = await service.chat(user, 'Tìm nhà hàng rồi gọi xe.', undefined, 'phase9-restaurant-fail');

    expect(restaurant.executeTool).toHaveBeenCalled();
    expect(ride.chat).not.toHaveBeenCalled();
    expect(response.workflow_status).toBe('FAILED');
    const saved = await store.getConversation(response.conversation_id, user.sub);
    const tasks = saved?.state.tasks as Array<Record<string, unknown>>;
    expect(tasks.find((task) => task.domain === 'ride')).toEqual(expect.objectContaining({
      phase: 'FAILED',
      failure_code: 'DEPENDENCY_BLOCKED',
    }));
  });

  it('continues an independent Food task when Healthcare preparation fails', async () => {
    const store = new InMemoryCoreRepository();
    const agent = planner([
      { domain: 'food', goal: 'Food', normalized_request: 'Find food', extracted_slots: { query: 'pho' } },
      { domain: 'healthcare', goal: 'Healthcare', normalized_request: 'Find appointment', extracted_slots: { department: 'neurology' } },
    ]);
    const foodAgent = {
      ...agent,
      chat: jest.fn().mockResolvedValue({ response_type: 'options', message: 'Food options', data: { items: [] }, state_updates: {} }),
    };
    const healthcare = { executeTool: jest.fn().mockRejectedValue(new Error('healthcare unavailable')), acknowledgePayment: jest.fn(), defaultPatientId: 1 };
    const service = new AssistantService(
      store as never,
      foodAgent as never,
      { executeTool: jest.fn() } as never,
      healthcare as never,
      { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never,
      { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never,
    );

    const response = await service.chat(user, 'Tìm món ăn và lịch khám.', undefined, 'phase9-independent-fail');

    expect(foodAgent.chat).toHaveBeenCalled();
    expect(healthcare.executeTool).toHaveBeenCalled();
    expect(response.workflow_status).toBe('PARTIAL_SUCCESS');
    const saved = await store.getConversation(response.conversation_id, user.sub);
    const tasks = saved?.state.tasks as Array<Record<string, unknown>>;
    expect(tasks.find((task) => task.domain === 'food')).toEqual(expect.objectContaining({ phase: 'IN_PROGRESS' }));
    expect(tasks.find((task) => task.domain === 'healthcare')).toEqual(expect.objectContaining({ phase: 'FAILED' }));
  });

  it('keeps a completed Healthcare appointment when final Ride payment fails', async () => {
    const store = new InMemoryCoreRepository();
    const conversationId = 'conv-phase9-partial';
    await store.saveConversation({
      conversationId,
      actorId: user.sub,
      messages: [],
      state: {
        tasks: [
          {
            id: 'healthcare-task',
            domain: 'healthcare',
            goal: 'Healthcare',
            normalized_request: 'Appointment',
            extracted_slots: {},
            depends_on: [],
            phase: 'COMPLETED',
            revision: 0,
            public_item: { kind: 'appointment_confirmed', status: 'CONFIRMED' },
          },
          {
            id: 'ride-task',
            domain: 'ride',
            goal: 'Ride',
            normalized_request: 'Ride home',
            extracted_slots: {},
            depends_on: [],
            phase: 'AWAITING_CONFIRMATION',
            revision: 0,
            workflow_id: 'ride-workflow-1',
            authoritative: { quote: { id: 'quote-1' }, booking: { id: 'booking-1', quote_id: 'quote-1' } },
          },
        ],
        actions: [{ id: 'ride-payment-action', kind: 'ride_payment', task_id: 'ride-task', task_revision: 0, cohort_id: 'ride-cohort', workflow_id: 'ride-workflow-1' }],
      },
      status: 'ACTIVE',
    });
    const ride = {
      confirmPayment: jest.fn().mockRejectedValue(new ServiceCallError({
        service: 'ride-service',
        operation: 'ride.booking.confirm',
        contractVersion: 'v1',
        httpStatus: 409,
        code: 'NO_DRIVER',
        detail: 'No driver is available.',
        category: 'BUSINESS',
        retryable: false,
        retryAfterMs: null,
        outcome: 'RESPONSE_RECEIVED',
      })),
    };
    const service = new AssistantService(
      store as never,
      { assistantChat: jest.fn() } as never,
      { executeTool: jest.fn() } as never,
      { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
      ride as never,
      { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never,
    );

    const response = await service.act(user, { conversation_id: conversationId, action_id: 'ride-payment-action' }, 'phase9-ride-fail', 'phase9-ride-payment');

    expect(ride.confirmPayment).toHaveBeenCalledWith(user.sub, 'ride-workflow-1', 'phase9-ride-fail');
    expect(response.workflow_status).toBe('PARTIAL_SUCCESS');
    expect(response.items[0]).toEqual(expect.objectContaining({ kind: 'task_error', error_code: 'NO_DRIVER' }));
    expect(response.completed).toEqual([expect.objectContaining({ kind: 'appointment_confirmed', status: 'CONFIRMED' })]);
    const saved = await store.getConversation(conversationId, user.sub);
    const tasks = saved?.state.tasks as Array<Record<string, unknown>>;
    expect(tasks.find((task) => task.domain === 'healthcare')).toEqual(expect.objectContaining({ phase: 'COMPLETED' }));
    expect(tasks.find((task) => task.domain === 'ride')).toEqual(expect.objectContaining({ phase: 'FAILED' }));
  });

  it('keeps a committed Restaurant reservation separate from a failed dependent Ride', async () => {
    const store = new InMemoryCoreRepository();
    const conversationId = 'conv-phase9-partial-restaurant';
    await store.saveConversation({
      conversationId,
      actorId: user.sub,
      messages: [],
      state: {
        tasks: [
          {
            id: 'restaurant-task',
            domain: 'restaurant',
            goal: 'Restaurant',
            normalized_request: 'Restaurant',
            extracted_slots: { location: 'Hanoi', party_size: 2, start_at: '2099-01-01T19:00:00+07:00' },
            depends_on: [],
            phase: 'AWAITING_CONFIRMATION',
            revision: 0,
            workflow_id: 'restaurant-workflow-1',
            authoritative: {
              selected: { id: 'rest-1', name: 'Maison Hanoi', location: '12 Hoan Kiem, Ha Noi' },
              pending: { id: 'restaurant-confirm-1' },
            },
          },
          {
            id: 'ride-task',
            domain: 'ride',
            goal: 'Ride',
            normalized_request: 'Ride to restaurant',
            extracted_slots: { pickup_address: 'VinUni', dropoff_address: 'Restaurant' },
            depends_on: ['restaurant-task'],
            phase: 'AWAITING_CONFIRMATION',
            revision: 0,
            workflow_id: 'ride-workflow-1',
            authoritative: { quote: { id: 'quote-1', pickup_address: 'VinUni', dropoff_address: 'Restaurant' } },
          },
        ],
        actions: [
          { id: 'restaurant-confirm-action', kind: 'restaurant_confirm', task_id: 'restaurant-task', task_revision: 0, cohort_id: 'restaurant-cohort', confirmation_id: 'restaurant-confirm-1', workflow_id: 'restaurant-workflow-1' },
          { id: 'ride-service-action', kind: 'ride_service', task_id: 'ride-task', task_revision: 0, cohort_id: 'ride-cohort', workflow_id: 'ride-workflow-1' },
        ],
      },
      status: 'ACTIVE',
    });
    const ride = {
      chat: jest.fn().mockRejectedValue(new ServiceCallError({
        service: 'ride-service',
        operation: 'ride.quote.create',
        contractVersion: 'v1',
        httpStatus: 409,
        code: 'NO_DRIVER',
        detail: 'No driver is available.',
        category: 'BUSINESS',
        retryable: false,
        retryAfterMs: null,
        outcome: 'RESPONSE_RECEIVED',
      })),
      confirmService: jest.fn(),
      confirmPayment: jest.fn(),
    };
    const confirmations = {
      executeDomain: jest.fn().mockResolvedValue({ tool_result: { id: 'res-1', reservation_code: 'res-1', restaurant_id: 'rest-1', restaurant_name: 'Maison Hanoi', address: '12 Hoan Kiem, Ha Noi', party_size: 2, start_at: '2099-01-01T19:00:00+07:00', status: 'CONFIRMED' } }),
      execute: jest.fn(),
      prepareDomainConfirmation: jest.fn(),
    };
    const service = new AssistantService(
      store as never,
      { assistantChat: jest.fn() } as never,
      { executeTool: jest.fn() } as never,
      { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
      ride as never,
      confirmations as never,
    );

    const response = await service.act(user, { conversation_id: conversationId, action_id: 'restaurant-confirm-action' }, 'phase9-restaurant-ride', 'phase9-restaurant-ride-key');

    expect(confirmations.executeDomain).toHaveBeenCalledWith('restaurant-confirm-1', user, { workflow_id: 'restaurant-workflow-1' }, 'phase9-restaurant-ride', 'phase9-restaurant-ride-key', 'CREATE_RESTAURANT_RESERVATION', 'restaurant-workflow-1');
    expect(ride.chat).toHaveBeenCalled();
    expect(response.workflow_status).toBe('PARTIAL_SUCCESS');
    expect(response.completed).toEqual([expect.objectContaining({ kind: 'reservation', status: 'CONFIRMED', reservation_code: 'res-1' })]);
    expect(response.items).toEqual([expect.objectContaining({ kind: 'task_error', error_code: 'NO_DRIVER' })]);
    const saved = await store.getConversation(conversationId, user.sub);
    const tasks = saved?.state.tasks as Array<Record<string, unknown>>;
    expect(tasks.find((task) => task.domain === 'restaurant')).toEqual(expect.objectContaining({ phase: 'COMPLETED' }));
    expect(tasks.find((task) => task.domain === 'ride')).toEqual(expect.objectContaining({ phase: 'FAILED', failure_code: 'NO_DRIVER' }));
  });

  it('re-arms only the failed dependent Ride action for a retryable failure', async () => {
    const store = new InMemoryCoreRepository();
    const conversationId = 'conv-phase9-retry-ride';
    await store.saveConversation({
      conversationId,
      actorId: user.sub,
      messages: [],
      state: {
        tasks: [
          {
            id: 'restaurant-task',
            domain: 'restaurant',
            goal: 'Restaurant',
            normalized_request: 'Restaurant',
            extracted_slots: { location: 'Hanoi', party_size: 2, start_at: '2099-01-01T19:00:00+07:00' },
            depends_on: [],
            phase: 'AWAITING_CONFIRMATION',
            revision: 0,
            workflow_id: 'restaurant-workflow-1',
            authoritative: {
              selected: { id: 'rest-1', name: 'Maison Hanoi', location: '12 Hoan Kiem, Ha Noi' },
              pending: { id: 'restaurant-confirm-1' },
            },
          },
          {
            id: 'ride-task',
            domain: 'ride',
            goal: 'Ride',
            normalized_request: 'Ride to restaurant',
            extracted_slots: { pickup_address: 'VinUni', dropoff_address: 'Restaurant' },
            depends_on: ['restaurant-task'],
            phase: 'AWAITING_CONFIRMATION',
            revision: 0,
            workflow_id: 'ride-workflow-1',
            authoritative: { quote: { id: 'quote-1', pickup_address: 'VinUni', dropoff_address: 'Restaurant' } },
          },
        ],
        actions: [
          { id: 'restaurant-confirm-action', kind: 'restaurant_confirm', task_id: 'restaurant-task', task_revision: 0, cohort_id: 'restaurant-cohort', confirmation_id: 'restaurant-confirm-1', workflow_id: 'restaurant-workflow-1' },
          { id: 'ride-service-action', kind: 'ride_service', task_id: 'ride-task', task_revision: 0, cohort_id: 'ride-cohort', workflow_id: 'ride-workflow-1' },
        ],
      },
      status: 'ACTIVE',
    });
    const ride = {
      chat: jest.fn().mockRejectedValue(new ServiceCallError({
        service: 'ride-service',
        operation: 'ride.quote.create',
        contractVersion: 'v1',
        httpStatus: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        detail: 'Temporary outage',
        category: 'TRANSIENT',
        retryable: true,
        retryAfterMs: null,
        outcome: 'NOT_SENT',
      })),
      confirmService: jest.fn(),
      confirmPayment: jest.fn(),
    };
    const confirmations = {
      executeDomain: jest.fn().mockResolvedValue({ tool_result: { id: 'res-1', reservation_code: 'res-1', restaurant_id: 'rest-1', restaurant_name: 'Maison Hanoi', address: '12 Hoan Kiem, Ha Noi', party_size: 2, start_at: '2099-01-01T19:00:00+07:00', status: 'CONFIRMED' } }),
      execute: jest.fn(),
      prepareDomainConfirmation: jest.fn(),
    };
    const service = new AssistantService(
      store as never,
      { assistantChat: jest.fn() } as never,
      { executeTool: jest.fn() } as never,
      { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
      ride as never,
      confirmations as never,
    );

    const response = await service.act(user, { conversation_id: conversationId, action_id: 'restaurant-confirm-action' }, 'phase9-retry-ride', 'phase9-retry-ride-key');

    expect(response.workflow_status).toBe('PARTIAL_SUCCESS');
    expect(response.completed[0]).toEqual(expect.objectContaining({ kind: 'reservation', status: 'CONFIRMED' }));
    expect(response.items[0]).toEqual(expect.objectContaining({ kind: 'task_error', error_code: 'UPSTREAM_UNAVAILABLE', retryable: true, action_id: 'ride-service-action' }));
    expect(response.actions.map((action) => action.id)).toContain('ride-service-action');
    expect(response.actions.map((action) => action.id)).not.toContain('restaurant-confirm-action');
  });
});
