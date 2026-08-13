import { ServiceCallError } from '../src/resilience/service-call-error';
import { InMemoryCoreRepository } from '../src/modules/core/core.module';
import { AssistantService } from '../src/modules/conversation/assistant.service';

describe('Unified assistant orchestration', () => {
  const user = { sub: 'actor-assistant', email: 'demo@xone.vn', role: 'USER' };

  it('keeps restaurant to ride dependency authoritative and confirmation-gated', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã chuẩn bị các bước tiếp theo.' }
        : {
          assistant_message: 'Mình sẽ giúp bạn xử lý hai việc.',
          decision_source: 'model',
          plan: {
            tasks: [
              { domain: 'restaurant', goal: 'Tìm nhà hàng', normalized_request: 'Đặt bàn tối nay ở Hà Nội', extracted_slots: { location: 'Hà Nội', party_size: 2, start_at: '2099-01-01T19:00:00+07:00' } },
              { domain: 'ride', goal: 'Tìm xe tới nhà hàng', normalized_request: 'Đặt xe từ VinUni tới nhà hàng đó', extracted_slots: { pickup_address: 'VinUni', dropoff_address: 'nhà hàng đó' }, depends_on: [0] },
            ],
          },
        }),
      chat: jest.fn(),
    };
    const restaurant = {
      executeTool: jest.fn()
        .mockResolvedValueOnce([{ id: 'rest-1', name: 'Maison Hanoi', location: '12 Hoan Kiem, Ha Noi', cuisine_type: 'Vietnamese', rating: 4.8 }])
        .mockResolvedValueOnce({ restaurant_id: 'rest-1', available: true, resource_version: 1 })
        .mockResolvedValueOnce({ id: 'hold-1', restaurant_id: 'rest-1', expires_at: '2099-01-01T18:00:00+07:00', status: 'ACTIVE' }),
    };
    const healthcare = { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 };
    const ride = {
      chat: jest.fn().mockResolvedValue({
        workflow_id: 'ride-flow-1',
        stage: 'SERVICE_CONFIRMATION',
        quote: { pickup_address: 'VinUni', dropoff_address: '12 Hoan Kiem, Ha Noi', vehicle_type: 'CAR_4', amount: 52000, currency: 'VND', duration_minutes: 18, expires_at: '2099-01-01T18:00:00+07:00' },
      }),
      confirmService: jest.fn(),
      confirmPayment: jest.fn(),
    };
    const confirmations = { prepareDomainConfirmation: jest.fn().mockResolvedValue({ id: 'confirmation-1' }), executeDomain: jest.fn().mockResolvedValue({ reservation: { restaurant_name: 'Maison Hanoi', restaurant_location: '12 Hoan Kiem, Ha Noi', reservation_code: 'res-1', start_at: '2099-01-01T19:00:00+07:00', party_size: 2 } }), execute: jest.fn() };
    const service = new AssistantService(store as never, agent as never, restaurant as never, healthcare as never, ride as never, confirmations as never);

    const first = await service.chat(user, 'Tối nay tìm nhà hàng cho 2 người rồi gọi xe từ VinUni tới đó.', undefined, 'cor-1');
    expect(first.conversation_id).toMatch(/^conv_/);
    expect(first.items[0].kind).toBe('restaurant_options');
    expect(first.actions[0].kind).toBe('select_restaurant');
    expect(ride.chat).not.toHaveBeenCalled();
    expect(confirmations.prepareDomainConfirmation).not.toHaveBeenCalled();

    const selected = await service.act(user, { conversation_id: first.conversation_id, action_id: first.actions[0].id }, 'cor-2', 'idempotency-1');
    expect(restaurant.executeTool).toHaveBeenCalledTimes(3);
    expect(ride.chat).toHaveBeenCalledWith('actor-assistant', expect.stringContaining('12 Hoan Kiem, Ha Noi'), expect.any(String), 'cor-2');
    expect(confirmations.prepareDomainConfirmation).toHaveBeenCalledTimes(1);
    expect(selected.actions.map((action) => action.kind)).toEqual(['restaurant_confirm']);
    expect(confirmations.executeDomain).not.toHaveBeenCalled();
    expect(ride.confirmService).not.toHaveBeenCalled();

    const confirmed = await service.act(user, { conversation_id: first.conversation_id, action_id: selected.actions[0].id }, 'cor-3', 'restaurant-confirm-key');
    expect(confirmed.actions.map((action) => action.kind)).toEqual(['ride_service']);
  });

  it('processes only the newly touched task and keeps an unrelated action cohort', async () => {
    let conversation: { conversationId: string; actorId: string; messages: unknown[]; state: Record<string, unknown> } | undefined;
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async (value: { conversationId: string; actorId: string; userMessage: unknown; assistantMessage: unknown; stateUpdates: Record<string, unknown> }) => {
        conversation = { conversationId: value.conversationId, actorId: value.actorId, messages: [value.userMessage, value.assistantMessage], state: value.stateUpdates };
        return conversation;
      }),
    };
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => {
        if (payload.mode === 'compose') return { assistant_message: 'Mình đã cập nhật các lựa chọn.' };
        if (String(payload.message).includes('món')) {
          return {
            assistant_message: 'Mình đã tìm thấy món phù hợp.',
            plan: { tasks: [{ domain: 'food', goal: 'Tìm món', normalized_request: 'Tìm món phở', extracted_slots: { query: 'phở' } }] },
          };
        }
        return {
          assistant_message: 'Mình đã tìm thấy nhà hàng.',
          plan: { tasks: [{ domain: 'restaurant', goal: 'Tìm nhà hàng', normalized_request: 'Nhà hàng Hà Nội', extracted_slots: { location: 'Hà Nội', party_size: 2, start_at: '2099-01-01T19:00:00+07:00' } }] },
        };
      }),
      chat: jest.fn().mockResolvedValue({ response_type: 'options', message: 'Có món phù hợp.', data: { items: [{ name: 'Phở thật', price: 50000, restaurant: { name: 'Quán thật' } }], preview: { snapshot_hash: 'internal-snapshot', total: { amount: 50000, currency: 'VND' } }, order: { id: 'order-1', workflow_id: 'internal-workflow', amount: 50000 } }, state_updates: { cart_id: 'cart-1' } }),
    };
    const restaurant = { executeTool: jest.fn().mockResolvedValue([{ id: 'rest-1', name: 'Quán thật', location: '12 Hoàn Kiếm, Hà Nội' }]) };
    const healthcare = { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 };
    const ride = { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() };
    const confirmations = { prepareDomainConfirmation: jest.fn(), executeDomain: jest.fn(), execute: jest.fn() };
    const service = new AssistantService(store as never, agent as never, restaurant as never, healthcare as never, ride as never, confirmations as never);

    const first = await service.chat(user, 'Tìm nhà hàng Hà Nội cho 2 người lúc 19 giờ.', undefined, 'cor-1');
    expect(first.actions).toHaveLength(1);
    const second = await service.chat(user, 'Tìm thêm món phở.', first.conversation_id, 'cor-2');

    expect(restaurant.executeTool).toHaveBeenCalledTimes(1);
    expect(agent.chat).toHaveBeenCalledTimes(1);
    expect(second.items.map((item) => item.kind)).toEqual(expect.arrayContaining(['restaurant_options', 'food_options']));
    expect(second.actions.map((action) => action.kind)).toEqual(['select_restaurant']);
    const foodItem = second.items.find((item) => item.kind === 'food_options') as Record<string, unknown>;
    expect(foodItem).not.toHaveProperty('workflow_id');
    expect(foodItem).not.toHaveProperty('confirmation_id');
    expect(foodItem.preview).toEqual({ total: { amount: 50000, currency: 'VND' } });
    expect(foodItem.order).toEqual({ id: 'order-1', amount: 50000 });
  });

  it('forwards a Food continuation with the latest message and preserves Food context', async () => {
    let conversation: { conversationId: string; actorId: string; messages: unknown[]; state: Record<string, unknown> } | undefined;
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async (value: { conversationId: string; actorId: string; userMessage: unknown; assistantMessage: unknown; stateUpdates: Record<string, unknown> }) => {
        conversation = { conversationId: value.conversationId, actorId: value.actorId, messages: [value.userMessage, value.assistantMessage], state: value.stateUpdates };
        return conversation;
      }),
    };
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã cập nhật món ăn.' }
        : { plan: { tasks: [{ domain: 'food', goal: 'Tìm món giao tận nơi', normalized_request: 'Tìm phở', extracted_slots: String(payload.message).startsWith('Tìm') ? { query: 'phở' } : {} }] } }),
      chat: jest.fn()
        .mockResolvedValueOnce({ response_type: 'options', message: 'Đã tìm thấy món.', data: { items: [{ name: 'Phở thật', price: 50000 }] }, state_updates: { restaurant_candidates: [{ id: 'food-restaurant-secret' }], cart_id: 'cart-secret' } })
        .mockResolvedValueOnce({ response_type: 'options', message: 'Đã chọn quán.', data: { items: [{ name: 'Phở thật', price: 50000 }] }, state_updates: { cart_id: 'cart-secret' } }),
    };
    const service = new AssistantService(
      store as never,
      agent as never,
      { executeTool: jest.fn() } as never,
      { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
      { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never,
      { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never,
    );

    const first = await service.chat(user, 'Tìm phở giao về nhà.', undefined, 'cor-food-1');
    const second = await service.chat(user, 'Chọn quán đầu tiên.', first.conversation_id, 'cor-food-2');

    expect(agent.chat).toHaveBeenCalledTimes(2);
    expect(agent.chat.mock.calls[1][0]).toEqual(expect.objectContaining({ message: 'Chọn quán đầu tiên.' }));
    expect(agent.chat.mock.calls[1][0].workflow_context).toEqual(expect.objectContaining({ restaurant_candidates: [{ id: 'food-restaurant-secret' }], cart_id: 'cart-secret' }));
    expect(second.items[0].kind).toBe('food_options');
    expect((conversation?.state.food_context as Record<string, unknown>).cart_id).toBe('cart-secret');
  });

  it('clarifies a generic Food and Healthcare selection, then advances only Food for a specific restaurant choice', async () => {
    const store = new InMemoryCoreRepository();
    let planningCalls = 0;
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => {
        if (payload.mode === 'compose') return { assistant_message: 'Mình đã cập nhật các lựa chọn.' };
        planningCalls += 1;
        if (planningCalls === 1) {
          return {
            plan: {
              tasks: [
                { domain: 'food', goal: 'Tìm phở giao về nhà', normalized_request: 'Tìm phở giao về nhà', extracted_slots: { query: 'phở' } },
                { domain: 'healthcare', goal: 'Đặt lịch khám thần kinh', normalized_request: 'Đặt lịch khám thần kinh sáng mai', extracted_slots: { department: 'thần kinh' } },
              ],
            },
          };
        }
        // Deliberately suggest the wrong active task. Gateway follow-up
        // resolution must use the persisted candidate metadata instead.
        return { plan: { tasks: [{ domain: 'healthcare', goal: 'Đặt lịch khám thần kinh', normalized_request: 'Đặt lịch khám thần kinh sáng mai', extracted_slots: { department: 'thần kinh' } }] } };
      }),
      chat: jest.fn()
        .mockResolvedValueOnce({ response_type: 'options', message: 'Có quán phở phù hợp.', data: { items: [{ name: 'Phở bò', price: 50000, restaurant: { name: 'Quán Phở Thật' } }] }, state_updates: { restaurant_candidates: [{ id: 'food-candidate-1' }, { id: 'food-candidate-2' }] } })
        .mockResolvedValueOnce({ response_type: 'options', message: 'Đã chọn quán.', data: { items: [{ name: 'Phở bò', price: 50000, restaurant: { name: 'Quán Phở Thật' } }] }, state_updates: { restaurant_id: 'food-candidate-1' } }),
    };
    const healthcare = {
      executeTool: jest.fn().mockResolvedValue({ doctors: [{ name: 'Bác sĩ A', department: { name: 'Thần kinh' }, price: 300000, available_slots: [{ id: 10, start_time: '2099-01-02T09:00:00+07:00' }] }] }),
      acknowledgePayment: jest.fn(),
      defaultPatientId: 1,
    };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, healthcare as never, { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never, { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never);

    const combined = await service.chat(user, 'Tìm phở giao về nhà và đặt lịch khám thần kinh sáng mai.', undefined, 'cor-ambiguous-1');
    const beforeClarification = await store.getConversation(combined.conversation_id, user.sub);
    const generic = await service.chat(user, 'Chọn cái đầu tiên.', combined.conversation_id, 'cor-ambiguous-2');
    const afterClarification = await store.getConversation(combined.conversation_id, user.sub);

    expect(generic.message).toContain('đồ ăn');
    expect(generic.message).toContain('lịch khám');
    expect(generic.actions).toEqual(combined.actions);
    expect(afterClarification?.state).toEqual(beforeClarification?.state);
    expect(agent.chat).toHaveBeenCalledTimes(1);
    expect(healthcare.executeTool).toHaveBeenCalledTimes(1);

    const beforeHealthcare = (beforeClarification?.state.tasks as Array<Record<string, unknown>>).find((task) => task.domain === 'healthcare');
    const foodSelected = await service.chat(user, 'Chọn quán đầu tiên.', combined.conversation_id, 'cor-ambiguous-3');
    const afterFoodSelection = await store.getConversation(combined.conversation_id, user.sub);
    const afterHealthcare = (afterFoodSelection?.state.tasks as Array<Record<string, unknown>>).find((task) => task.domain === 'healthcare');

    expect(foodSelected.items.some((item) => item.kind === 'food_options')).toBe(true);
    expect(agent.chat).toHaveBeenCalledTimes(2);
    expect(healthcare.executeTool).toHaveBeenCalledTimes(1);
    expect(afterHealthcare).toEqual(beforeHealthcare);
    expect(foodSelected.actions).toEqual(combined.actions);
  });

  it('derives generic and specific follow-up domains from actions plus authoritative choice metadata', () => {
    const service = new AssistantService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const followUpDomains = (service as unknown as {
      followUpDomains(active: Array<Record<string, unknown>>, actions: Array<Record<string, unknown>>, folded: string): string[];
    }).followUpDomains.bind(service);
    const food = {
      id: 'food-task', domain: 'food', goal: 'Food', normalized_request: 'Food', extracted_slots: {}, depends_on: [], phase: 'IN_PROGRESS', revision: 0,
      authoritative: { food_context: { restaurant_candidates: [{ id: 'food-1' }] } },
    };
    const restaurant = {
      id: 'restaurant-task', domain: 'restaurant', goal: 'Restaurant', normalized_request: 'Restaurant', extracted_slots: {}, depends_on: [], phase: 'IN_PROGRESS', revision: 0,
      authoritative: { candidates: [{ id: 'restaurant-1' }] },
    };
    const healthcare = {
      id: 'healthcare-task', domain: 'healthcare', goal: 'Healthcare', normalized_request: 'Healthcare', extracted_slots: {}, depends_on: [], phase: 'IN_PROGRESS', revision: 0,
      authoritative: { doctors: [{ id: 'doctor-1' }] },
    };
    const restaurantAction = { id: 'restaurant-action', kind: 'select_restaurant', task_id: restaurant.id, task_revision: 0 };
    const healthcareAction = { id: 'healthcare-action', kind: 'select_healthcare_slot', task_id: healthcare.id, task_revision: 0 };

    expect(followUpDomains([food], [], 'chon cai dau tien')).toEqual(['food']);
    expect(followUpDomains([
      { ...food, authoritative: { food_context: { menu_item_candidates: [{ id: 'food-item-1' }] } } },
    ], [], 'chon cai dau tien')).toEqual(['food']);
    expect(followUpDomains([restaurant], [restaurantAction], 'chon cai dau tien')).toEqual(['restaurant']);
    expect(followUpDomains([healthcare], [healthcareAction], 'chon cai dau tien')).toEqual(['healthcare']);
    expect(followUpDomains([food, healthcare], [healthcareAction], 'chon cai dau tien')).toEqual(['food', 'healthcare']);
    expect(followUpDomains([food, restaurant], [restaurantAction], 'chon quan dau tien')).toEqual(['food']);
    expect(followUpDomains([food, restaurant], [restaurantAction], 'chon nha hang dau tien')).toEqual(['restaurant']);
    expect(followUpDomains([food, healthcare], [healthcareAction], 'chon lich dau tien')).toEqual(['healthcare']);
  });

  it('marks transient Assistant action failures retryable and succeeds on the same-key retry', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã cập nhật đơn.' }
        : { plan: { tasks: [{ domain: 'food', goal: 'Tìm món', normalized_request: 'Tìm phở', extracted_slots: { query: 'phở' } }] } }),
      chat: jest.fn().mockResolvedValue({ response_type: 'confirmation', message: 'Đã sẵn sàng', pending_confirmation: { id: 'food-confirm-retry' }, data: { order: { id: 'order-1', amount: 50000, currency: 'VND' } }, state_updates: {} }),
    };
    const confirmations = {
      execute: jest.fn()
        .mockRejectedValueOnce(new ServiceCallError({ service: 'food-service', operation: 'food.order.place', contractVersion: 'v1', httpStatus: 503, code: 'UPSTREAM_UNAVAILABLE', detail: 'Temporary outage', category: 'TRANSIENT', retryable: true, retryAfterMs: null, outcome: 'NOT_SENT' }))
        .mockResolvedValueOnce({ order: { id: 'order-1', amount: 50000, currency: 'VND' }, payment: { status: 'SUCCEEDED', amount: 50000, currency: 'VND' } }),
      executeDomain: jest.fn(),
      prepareDomainConfirmation: jest.fn(),
    };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never, { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never, confirmations as never);

    const first = await service.chat(user, 'Tìm phở giao về nhà.', undefined, 'cor-retry-1');
    const action = first.actions[0];
    await expect(service.act(user, { conversation_id: first.conversation_id, action_id: action.id }, 'cor-retry-2', 'food-retry-key')).rejects.toBeInstanceOf(ServiceCallError);
    const retried = await service.act(user, { conversation_id: first.conversation_id, action_id: action.id }, 'cor-retry-3', 'food-retry-key');

    expect(confirmations.execute).toHaveBeenCalledTimes(2);
    expect(retried.completed[0].kind).toBe('food_order');
    expect((await store.getAssistantActionExecution(user.sub, first.conversation_id, action.id))?.status).toBe('SUCCEEDED');
  });

  it('keeps the old action durable when Core commit fails after an idempotent Food success', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Đơn đã được cập nhật.' }
        : { plan: { tasks: [{ domain: 'food', goal: 'Tìm món', normalized_request: 'Tìm phở', extracted_slots: { query: 'phở' } }] } }),
      chat: jest.fn().mockResolvedValue({ response_type: 'confirmation', message: 'Đã sẵn sàng', pending_confirmation: { id: 'food-confirm-crash' }, data: { order: { id: 'order-crash', amount: 50000, currency: 'VND' } }, state_updates: {} }),
    };
    const resultsByKey = new Map<string, Record<string, unknown>>();
    let businessSideEffects = 0;
    const confirmations = {
      execute: jest.fn(async (...args: unknown[]) => {
        const key = String(args[4]);
        const existing = resultsByKey.get(key);
        if (existing) return existing;
        businessSideEffects += 1;
        const result = { order: { id: 'order-crash', amount: 50000, currency: 'VND' }, payment: { status: 'SUCCEEDED', amount: 50000, currency: 'VND' } };
        resultsByKey.set(key, result);
        return result;
      }),
      executeDomain: jest.fn(),
      prepareDomainConfirmation: jest.fn(),
    };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never, { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never, confirmations as never);
    const first = await service.chat(user, 'Tìm phở giao về nhà.', undefined, 'cor-crash-1');
    const action = first.actions[0];
    const originalCommit = store.commitAssistantActionSuccess.bind(store);
    let failOnce = true;
    jest.spyOn(store, 'commitAssistantActionSuccess').mockImplementation(async (value) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('injected-core-commit-failure');
      }
      return originalCommit(value);
    });

    await expect(service.act(user, { conversation_id: first.conversation_id, action_id: action.id }, 'cor-crash-2', 'food-crash-key')).rejects.toMatchObject({ response: { code: 'ASSISTANT_ACTION_COMMIT_RETRY', retryable: true } });
    const afterFailedCommit = await store.getConversation(first.conversation_id, user.sub);
    expect((afterFailedCommit?.state.actions as Array<{ id: string }>).map((candidate) => candidate.id)).toContain(action.id);
    expect((await store.getAssistantActionExecution(user.sub, first.conversation_id, action.id))?.status).toBe('PROCESSING');

    const records = (store as unknown as { assistantActionExecutions: Map<string, { processingExpiresAt?: string }> }).assistantActionExecutions;
    records.get(JSON.stringify([user.sub, first.conversation_id, action.id]))!.processingExpiresAt = new Date(Date.now() - 1).toISOString();
    const retried = await service.act(user, { conversation_id: first.conversation_id, action_id: action.id }, 'cor-crash-3', 'food-crash-key');

    expect(businessSideEffects).toBe(1);
    expect(confirmations.execute).toHaveBeenCalledTimes(2);
    expect(confirmations.execute.mock.calls.map((call) => call[4])).toEqual(['food-crash-key', 'food-crash-key']);
    expect(retried.completed[0].kind).toBe('food_order');
    const finalConversation = await store.getConversation(first.conversation_id, user.sub);
    expect((finalConversation?.state.actions as Array<{ id: string }>).map((candidate) => candidate.id)).not.toContain(action.id);
    expect((await store.getAssistantActionExecution(user.sub, first.conversation_id, action.id))?.status).toBe('SUCCEEDED');
  });

  it('allows only one concurrent same-key Assistant action execution', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Đơn đã được cập nhật.' }
        : { plan: { tasks: [{ domain: 'food', goal: 'Tìm món', normalized_request: 'Tìm phở', extracted_slots: { query: 'phở' } }] } }),
      chat: jest.fn().mockResolvedValue({ response_type: 'confirmation', message: 'Đã sẵn sàng', pending_confirmation: { id: 'food-confirm-concurrent' }, data: { order: { id: 'order-concurrent', amount: 50000, currency: 'VND' } }, state_updates: {} }),
    };
    let signalDomainStarted!: () => void;
    let releaseDomain!: () => void;
    const domainStarted = new Promise<void>((resolve) => { signalDomainStarted = resolve; });
    const domainRelease = new Promise<void>((resolve) => { releaseDomain = resolve; });
    const confirmations = {
      execute: jest.fn(async () => {
        signalDomainStarted();
        await domainRelease;
        return { order: { id: 'order-concurrent', amount: 50000, currency: 'VND' }, payment: { status: 'SUCCEEDED', amount: 50000, currency: 'VND' } };
      }),
      executeDomain: jest.fn(),
      prepareDomainConfirmation: jest.fn(),
    };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never, { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never, confirmations as never);
    const first = await service.chat(user, 'Tìm phở giao về nhà.', undefined, 'cor-concurrent-1');
    const action = first.actions[0];

    const firstExecution = service.act(user, { conversation_id: first.conversation_id, action_id: action.id }, 'cor-concurrent-2', 'food-concurrent-key');
    await domainStarted;
    await expect(service.act(user, { conversation_id: first.conversation_id, action_id: action.id }, 'cor-concurrent-3', 'food-concurrent-key')).rejects.toMatchObject({ response: { code: 'ASSISTANT_ACTION_PROCESSING', retryable: true } });
    releaseDomain();
    await firstExecution;

    expect(confirmations.execute).toHaveBeenCalledTimes(1);
  });

  it('sends a planner-safe projection instead of stored authoritative state', async () => {
    const conversation = {
      conversationId: 'conversation-safe',
      actorId: user.sub,
      messages: [{ role: 'user' as const, content: 'hello', createdAt: new Date().toISOString() }],
      state: {
        tasks: [{ id: 'task-secret', domain: 'food', goal: 'Tìm món', normalized_request: 'Tìm phở', extracted_slots: { query: 'phở' }, phase: 'IN_PROGRESS', revision: 1, authoritative: { confirmation_id: 'confirmation-secret', workflow_id: 'workflow-secret', order_id: 'order-secret', payment: { provider_reference: 'provider-secret' } } }],
        actions: [{ id: 'action-secret', kind: 'food_confirm', task_id: 'task-secret', task_revision: 1, cohort_id: 'cohort-secret', confirmation_id: 'confirmation-secret' }],
      },
    };
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async () => conversation),
    };
    const agent = { assistantChat: jest.fn().mockResolvedValue({ plan: { tasks: [] } }) };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never, { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never, { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never);

    await service.chat(user, 'Xin chào', conversation.conversationId, 'cor-safe');
    const payload = agent.assistantChat.mock.calls[0][0] as Record<string, unknown>;
    const serialized = JSON.stringify(payload.conversation_state);
    for (const forbidden of ['task-secret', 'confirmation-secret', 'workflow-secret', 'order-secret', 'provider-secret', 'action-secret', 'authoritative']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect((payload.conversation_state as { tasks: Array<Record<string, unknown>> }).tasks[0].task_ref).toBe(0);
    expect(payload.capability_snapshot).toEqual(expect.objectContaining({
      version: 'gateway-observed.v1',
      capabilities: expect.arrayContaining([
        expect.objectContaining({ name: 'ride.booking.prepare', risk_level: 'REVERSIBLE_WRITE', confirmation_gate: 'SERVICE_DETAILS' }),
      ]),
    }));
  });

  it('invalidates a pending action when the same task receives changed details', async () => {
    let conversation: { conversationId: string; actorId: string; messages: unknown[]; state: Record<string, unknown> } | undefined;
    let planningTurn = 0;
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async (value: { conversationId: string; actorId: string; userMessage: unknown; assistantMessage: unknown; stateUpdates: Record<string, unknown> }) => {
        conversation = { conversationId: value.conversationId, actorId: value.actorId, messages: [value.userMessage, value.assistantMessage], state: value.stateUpdates };
        return conversation;
      }),
    };
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã cập nhật.' }
        : { plan: { tasks: [{ domain: 'restaurant', goal: 'Tìm nhà hàng', normalized_request: 'Nhà hàng Hà Nội', extracted_slots: { location: 'Hà Nội', party_size: planningTurn++ === 0 ? 2 : 3, start_at: '2099-01-01T19:00:00+07:00' } }] } }),
    };
    const restaurant = { executeTool: jest.fn().mockResolvedValue([{ id: 'rest-1', name: 'Quán thật', location: '12 Hoàn Kiếm, Hà Nội' }]) };
    const healthcare = { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 };
    const ride = { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() };
    const confirmations = { prepareDomainConfirmation: jest.fn(), executeDomain: jest.fn(), execute: jest.fn() };
    const service = new AssistantService(store as never, agent as never, restaurant as never, healthcare as never, ride as never, confirmations as never);

    const first = await service.chat(user, 'Tìm nhà hàng cho 2 người.', undefined, 'cor-1');
    const oldAction = first.actions[0];
    const second = await service.chat(user, 'Đổi thành 3 người.', first.conversation_id, 'cor-2');

    expect(second.actions[0].kind).toBe('select_restaurant');
    expect(second.actions[0].id).not.toBe(oldAction.id);
    expect(restaurant.executeTool).toHaveBeenCalledTimes(1);
    await expect(service.act(user, { conversation_id: first.conversation_id, action_id: oldAction.id }, 'cor-3', 'retry-key')).rejects.toMatchObject({ response: { code: 'ACTION_NOT_AVAILABLE' } });
  });

  it('invalidates sibling selection actions after one restaurant is selected', async () => {
    const store = new InMemoryCoreRepository();
    const agent = { assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose' ? { assistant_message: 'Mình đã chuẩn bị.' } : { plan: { tasks: [{ domain: 'restaurant', goal: 'Tìm nhà hàng', normalized_request: 'Nhà hàng Hà Nội', extracted_slots: { location: 'Hà Nội', party_size: 2, start_at: '2099-01-01T19:00:00+07:00' } }] } }) };
    const restaurant = {
      executeTool: jest.fn()
        .mockResolvedValueOnce([{ id: 'rest-1', name: 'Quán Một', location: '12 Hoàn Kiếm, Hà Nội' }, { id: 'rest-2', name: 'Quán Hai', location: '20 Hoàn Kiếm, Hà Nội' }])
        .mockResolvedValueOnce({ restaurant_id: 'rest-1', available: true })
        .mockResolvedValueOnce({ id: 'hold-1', expires_at: '2099-01-01T18:00:00+07:00', status: 'ACTIVE' }),
    };
    const healthcare = { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 };
    const ride = { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() };
    const confirmations = { prepareDomainConfirmation: jest.fn().mockResolvedValue({ id: 'confirmation-1' }), executeDomain: jest.fn(), execute: jest.fn() };
    const service = new AssistantService(store as never, agent as never, restaurant as never, healthcare as never, ride as never, confirmations as never);

    const first = await service.chat(user, 'Tìm nhà hàng.', undefined, 'cor-1');
    expect(first.actions).toHaveLength(2);
    await service.act(user, { conversation_id: first.conversation_id, action_id: first.actions[0].id }, 'cor-2', 'select-key');

    await expect(service.act(user, { conversation_id: first.conversation_id, action_id: first.actions[1].id }, 'cor-3', 'sibling-key')).rejects.toMatchObject({ response: { code: 'ACTION_NOT_AVAILABLE' } });
    expect(restaurant.executeTool).toHaveBeenCalledTimes(3);
  });

  it('uses the authoritative Food payment and omits it when Food does not return one', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã cập nhật đơn.' }
        : { plan: { tasks: [{ domain: 'food', goal: 'Tìm món', normalized_request: 'Tìm món phở', extracted_slots: { query: 'phở' } }] } }),
      chat: jest.fn().mockResolvedValue({ response_type: 'confirmation', message: 'Đã sẵn sàng', pending_confirmation: { id: 'food-confirm-1' }, data: { order: { id: 'order-1', amount: 50000, currency: 'VND' } }, state_updates: {} }),
    };
    const confirmations = {
      execute: jest.fn().mockResolvedValue({ order: { id: 'order-1', amount: 50000, currency: 'VND' }, payment: { status: 'SUCCEEDED', amount: 50000, currency: 'VND', provider_reference: 'must-not-leak' } }),
      executeDomain: jest.fn(),
      prepareDomainConfirmation: jest.fn(),
    };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never, { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() } as never, confirmations as never);

    const first = await service.chat(user, 'Tìm món phở giao về nhà.', undefined, 'cor-food-1');
    const result = await service.act(user, { conversation_id: first.conversation_id, action_id: first.actions[0].id }, 'cor-food-2', 'food-action-1');
    expect(result.items[0].payment).toEqual({ status: 'SUCCEEDED', amount: 50000, currency: 'VND' });
    expect(result.items[0].payment).not.toHaveProperty('provider_reference');
  });

  it('feeds a held Healthcare facility and authoritative quote timing into a dependent Ride task', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã chuẩn bị lịch khám và báo giá xe.' }
        : { plan: { tasks: [
          { domain: 'healthcare', goal: 'Tìm lịch khám', normalized_request: 'Khám thần kinh', extracted_slots: { department: 'thần kinh', start_at: '2099-01-02T10:00:00+07:00' } },
          { domain: 'ride', goal: 'Đi tới cơ sở khám', normalized_request: 'Đặt xe từ VinUni tới lịch khám', extracted_slots: { pickup_address: 'VinUni' }, depends_on: [0] },
        ] } }),
    };
    const healthcare = {
      executeTool: jest.fn()
        .mockResolvedValueOnce({ doctors: [{ name: 'Bác sĩ A', department: { name: 'Thần kinh' }, price: 300000, available_slots: [{ id: 10, start_time: '2099-01-02T10:00:00+07:00' }] }] })
        .mockResolvedValueOnce({ appointment_id: 51, doctor_name: 'Bác sĩ A', department: 'Thần kinh', price: 300000, start_time: '2099-01-02T10:00:00+07:00', facility: { name: 'X-One Healthcare Clinic', address: '12 Nguyen Trai, Thanh Xuan, Ha Noi' }, status: 'DRAFT' }),
      acknowledgePayment: jest.fn(),
      defaultPatientId: 1,
    };
    const ride = {
      chat: jest.fn().mockResolvedValue({ workflow_id: 'ride-health-1', stage: 'SERVICE_CONFIRMATION', quote: { pickup_address: 'VinUni', dropoff_address: '12 Nguyen Trai, Thanh Xuan, Ha Noi', vehicle_type: 'CAR_4', amount: 60000, currency: 'VND', duration_minutes: 30, expires_at: '2099-01-01T18:00:00+07:00' } }),
      confirmService: jest.fn(),
      confirmPayment: jest.fn(),
    };
    const service = new AssistantService(store as never, agent as never, { executeTool: jest.fn() } as never, healthcare as never, ride as never, { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never);

    const first = await service.chat(user, 'Đặt lịch khám thần kinh rồi đặt xe từ VinUni đưa tôi tới đó.', undefined, 'cor-health-1');
    expect(first.actions.map((action) => action.kind)).toEqual(['select_healthcare_slot']);
    const selected = await service.act(user, { conversation_id: first.conversation_id, action_id: first.actions[0].id }, 'cor-health-2', 'health-select-1');
    expect(ride.chat).toHaveBeenCalledWith('actor-assistant', expect.stringContaining('12 Nguyen Trai, Thanh Xuan, Ha Noi'), expect.any(String), 'cor-health-2');
    expect((selected.items.find((item) => item.kind === 'ride_quote') as Record<string, unknown>).recommended_departure).toBe('2099-01-02T02:10:00.000Z');
    expect(selected.actions.map((action) => action.kind)).toEqual(['healthcare_payment']);
  });

  it('returns only a slot matching the requested Healthcare time before hold', async () => {
    let conversation: { conversationId: string; actorId: string; messages: unknown[]; state: Record<string, unknown> } | undefined;
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async (value: { conversationId: string; actorId: string; userMessage: unknown; assistantMessage: unknown; stateUpdates: Record<string, unknown> }) => {
        conversation = { conversationId: value.conversationId, actorId: value.actorId, messages: [value.userMessage, value.assistantMessage], state: value.stateUpdates };
        return conversation;
      }),
    };
    const agent = { assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose' ? { assistant_message: 'Mình đã tìm lịch.' } : { plan: { tasks: [{ domain: 'healthcare', goal: 'Tìm lịch khám', normalized_request: 'Khám thần kinh', extracted_slots: { department: 'thần kinh', start_at: '2099-01-01T10:00:00+07:00' } }] } }) };
    const healthcare = {
      executeTool: jest.fn().mockResolvedValue({ doctors: [{ name: 'Bác sĩ A', department: { name: 'Thần kinh' }, price: 300000, available_slots: [{ id: 10, start_time: '2099-01-01T10:00:00+07:00' }, { id: 11, start_time: '2099-01-01T08:00:00+07:00' }] }, { name: 'Bác sĩ B', department: { name: 'Thần kinh' }, price: 350000, available_slots: [{ id: 12, start_time: '2099-01-01T11:00:00+07:00' }] }] }),
      acknowledgePayment: jest.fn(),
      defaultPatientId: 1,
    };
    const restaurant = { executeTool: jest.fn() };
    const ride = { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() };
    const confirmations = { prepareDomainConfirmation: jest.fn(), executeDomain: jest.fn(), execute: jest.fn() };
    const service = new AssistantService(store as never, agent as never, restaurant as never, healthcare as never, ride as never, confirmations as never);

    const response = await service.chat(user, 'Tìm lịch khám thần kinh lúc 10 giờ.', undefined, 'cor-1');
    expect(healthcare.executeTool).toHaveBeenCalledWith(expect.objectContaining({ tool_name: 'healthcare.list_slots', arguments: { department: 'thần kinh' } }), user.sub, 'cor-1');
    expect(response.items[0].kind).toBe('healthcare_options');
    expect((response.items[0].options as Array<{ start_time?: string }>)[0].start_time).toBe('2099-01-01T10:00:00+07:00');
    expect(response.actions.map((action) => action.kind)).toEqual(['select_healthcare_slot']);
  });

  it('rejects a typed Agent capability whose risk metadata differs from the Gateway snapshot', () => {
    const service = new AssistantService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internal = service as unknown as {
      validateCoreAHandoff: (planner: Record<string, unknown>) => void;
    };
    expect(() => internal.validateCoreAHandoff({
      planning_decision: {
        tasks: [{
          task_ref: 0,
          domain: 'ride',
          depends_on: [],
          steps: [{
            capability: 'ride.booking.prepare',
            risk_ceiling: 'READ',
            confirmation_gate: 'SERVICE_DETAILS',
          }],
        }],
      },
    })).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'AGENT_CAPABILITY_REJECTED' }) }));
  });

  it('rejects a cyclic typed Agent dependency graph', () => {
    const service = new AssistantService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const internal = service as unknown as {
      validateCoreAHandoff: (planner: Record<string, unknown>) => void;
    };
    expect(() => internal.validateCoreAHandoff({
      planning_decision: {
        tasks: [
          { task_ref: 0, domain: 'restaurant', depends_on: [1], steps: [] },
          { task_ref: 1, domain: 'ride', depends_on: [0], steps: [] },
        ],
      },
    })).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'AGENT_DEPENDENCY_REJECTED' }) }));
  });

  it('blocks only dependent tasks and computes partial success deterministically', () => {
    const service = new AssistantService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internal = service as unknown as {
      propagateDependencyFailures: (tasks: Array<Record<string, unknown>>) => void;
      workflowStatus: (tasks: Array<Record<string, unknown>>) => string;
    };
    const tasks = [
      { id: 'restaurant', domain: 'restaurant', phase: 'FAILED', depends_on: [] },
      { id: 'ride', domain: 'ride', phase: 'PLANNING', depends_on: ['restaurant'] },
      { id: 'food', domain: 'food', phase: 'COMPLETED', depends_on: [] },
    ];
    internal.propagateDependencyFailures(tasks);
    expect(tasks[1]).toEqual(expect.objectContaining({
      phase: 'BLOCKED',
      blocking_task_id: 'restaurant',
      block_reason: 'DEPENDENCY_FAILED',
    }));
    expect(tasks[2].phase).toBe('COMPLETED');
    expect(internal.workflowStatus(tasks)).toBe('PARTIAL_SUCCESS');
  });

  it('uses typed PlanningDecision tasks instead of a conflicting legacy compatibility plan', async () => {
    const store = new InMemoryCoreRepository();
    const agent = {
      assistantChat: jest.fn(async (payload: Record<string, unknown>) => payload.mode === 'compose'
        ? { assistant_message: 'Mình đã tìm món phù hợp.' }
        : {
          decision_source: 'deterministic',
          plan: {
            tasks: [{
              domain: 'ride',
              goal: 'Legacy task must not run',
              normalized_request: 'Đặt xe',
              extracted_slots: { pickup_address: 'A', dropoff_address: 'B' },
            }],
          },
          planning_decision: {
            tasks: [{
              task_ref: 0,
              domain: 'food',
              operation: 'DISCOVER',
              goal: 'Tìm món',
              normalized_request: 'Tìm phở',
              semantic_slots: {
                query: { value: 'phở', source: 'USER_EXPLICIT' },
              },
              depends_on: [],
              missing_information: [],
              missing_authority: [],
              steps: [{
                step_ref: 0,
                purpose: 'Tìm món',
                capability: 'search_food',
                phase: 'DISCOVERY',
                requires_semantic_fields: [],
                requires_authority: [],
                depends_on_steps: [],
                risk_ceiling: 'READ',
                confirmation_gate: 'NONE',
              }],
              disposition: 'READY',
            }],
            workflow_relation: 'SINGLE_TASK',
            confirmation_invalidated: false,
            blocked_task_refs: [],
          },
        }),
      chat: jest.fn().mockResolvedValue({
        response_type: 'text',
        message: 'Đã tìm món.',
        data: {},
        state_updates: {},
      }),
    };
    const ride = { chat: jest.fn(), confirmService: jest.fn(), confirmPayment: jest.fn() };
    const service = new AssistantService(
      store as never,
      agent as never,
      { executeTool: jest.fn() } as never,
      { executeTool: jest.fn(), acknowledgePayment: jest.fn(), defaultPatientId: 1 } as never,
      ride as never,
      { execute: jest.fn(), executeDomain: jest.fn(), prepareDomainConfirmation: jest.fn() } as never,
    );

    const response = await service.chat(user, 'Tìm phở', undefined, 'cor-typed');

    expect(agent.chat).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Tìm phở',
    }), 'cor-typed');
    expect(ride.chat).not.toHaveBeenCalled();
    expect(response.workflow_status).toBe('IN_PROGRESS');
  });
});
