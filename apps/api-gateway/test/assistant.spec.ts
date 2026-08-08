import { AssistantService } from '../src/modules/conversation/assistant.service';

describe('Unified assistant orchestration', () => {
  const user = { sub: 'actor-assistant', email: 'demo@xone.vn', role: 'USER' };

  it('keeps restaurant to ride dependency authoritative and confirmation-gated', async () => {
    let conversation: { conversationId: string; actorId: string; messages: unknown[]; state: Record<string, unknown> } | undefined;
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async (value: { conversationId: string; actorId: string; userMessage: unknown; assistantMessage: unknown; stateUpdates: Record<string, unknown> }) => {
        conversation = {
          conversationId: value.conversationId,
          actorId: value.actorId,
          messages: [value.userMessage, value.assistantMessage],
          state: value.stateUpdates,
        };
        return conversation;
      }),
    };
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
    const confirmations = { prepareDomainConfirmation: jest.fn().mockResolvedValue({ id: 'confirmation-1' }), executeDomain: jest.fn(), execute: jest.fn() };
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
    expect(selected.actions.map((action) => action.kind)).toEqual(expect.arrayContaining(['restaurant_confirm', 'ride_service']));
    expect(confirmations.executeDomain).not.toHaveBeenCalled();
    expect(ride.confirmService).not.toHaveBeenCalled();
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
    let conversation: { conversationId: string; actorId: string; messages: unknown[]; state: Record<string, unknown> } | undefined;
    const store = {
      getConversation: jest.fn(async () => conversation),
      appendConversationTurn: jest.fn(async (value: { conversationId: string; actorId: string; userMessage: unknown; assistantMessage: unknown; stateUpdates: Record<string, unknown> }) => {
        conversation = { conversationId: value.conversationId, actorId: value.actorId, messages: [value.userMessage, value.assistantMessage], state: value.stateUpdates };
        return conversation;
      }),
    };
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
    expect(response.actions.map((action) => action.kind)).toEqual(['select_healthcare_slot', 'select_healthcare_slot']);
  });
});
