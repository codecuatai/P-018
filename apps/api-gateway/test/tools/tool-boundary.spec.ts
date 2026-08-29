import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

import { ToolProposal, ToolService } from '../../src/modules/tools/tool.module';
import { AssistantService } from '../../src/modules/conversation/assistant.service';

function proposal(overrides: Partial<ToolProposal> = {}): ToolProposal {
  return {
    schema_version: '1',
    capability_name: 'search_food',
    semantic_arguments: { keyword: 'pho bo' },
    workflow_id: 'conv_one',
    tool_call_id: 'call_one',
    risk_ceiling: 'READ',
    confirmation_gate: 'none',
    ...overrides,
  };
}

describe('Gateway-only tool execution boundary', () => {
  const food = {
    get: jest.fn().mockResolvedValue([]),
    post: jest.fn().mockResolvedValue({ id: 'cart_one', items: [] }),
  };
  const confirmations = {};
  const store = {
    audit: jest.fn().mockResolvedValue(undefined),
    listSavedAddresses: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => jest.clearAllMocks());

  it('validates a proposal before dispatching through the Gateway', async () => {
    const service = new ToolService(food as never, confirmations as never, store as never);

    await service.executeProposal(
      proposal(),
      { keyword: 'pho bo' },
      { sub: 'usr_one', email: 'one@example.test', role: 'customer' },
      'cor_one',
      'conv_one',
      'food:test-read:r0:p0',
    );

    expect(food.get).toHaveBeenCalledWith(
      '/api/v1/food/search?keyword=pho+bo',
      'cor_one',
      'usr_one',
    );
    expect(store.audit).toHaveBeenCalledTimes(2);
  });

  it('rejects authoritative IDs in Agent semantic arguments', async () => {
    const service = new ToolService(food as never, confirmations as never, store as never);

    await expect(service.executeProposal(
      proposal({ semantic_arguments: { cart_id: 'cart_injected' } }),
      { keyword: 'pho bo' },
      { sub: 'usr_one', email: 'one@example.test', role: 'customer' },
      'cor_one',
      'conv_one',
      'food:test-invalid:r0:p0',
    )).rejects.toMatchObject({
      response: { code: 'INVALID_TOOL_PROPOSAL' },
    });
    expect(food.get).not.toHaveBeenCalled();
  });

  it('dispatches view_menu with server-side pagination and keeps the legacy no-query call', async () => {
    const service = new ToolService(food as never, confirmations as never, store as never);
    const actor = { sub: 'usr_one', email: 'one@example.test', role: 'customer' };

    await service.executeProposal(
      proposal({ capability_name: 'view_menu', semantic_arguments: { limit: 50, offset: 100 } }),
      { restaurant_id: 'res_pho_hanoi', limit: 50, offset: 100 },
      actor,
      'cor_one',
      'conv_one',
      'food:test-menu:r0:p0',
    );

    expect(food.get).toHaveBeenCalledWith(
      '/api/v1/restaurants/res_pho_hanoi/menu?limit=50&offset=100',
      'cor_one',
    );

    jest.clearAllMocks();
    await service.executeProposal(
      proposal({ capability_name: 'view_menu', semantic_arguments: {} }),
      { restaurant_id: 'res_pho_hanoi' },
      actor,
      'cor_one',
      'conv_one',
      'food:test-menu:r0:p0',
    );

    expect(food.get).toHaveBeenCalledWith('/api/v1/restaurants/res_pho_hanoi/menu', 'cor_one');
  });

  it('binds Food write idempotency to the Gateway-owned execution ID', async () => {
    const service = new ToolService(food as never, confirmations as never, store as never);

    await service.executeProposal(
      proposal({
        capability_name: 'add_to_cart',
        semantic_arguments: { quantity: 1 },
        tool_call_id: 'call_add_one',
        risk_ceiling: 'REVERSIBLE_WRITE',
      }),
      {
        cart_id: 'cart_trusted',
        menu_item_id: 'item_trusted',
        quantity: 1,
        selected_options: [],
      },
      { sub: 'usr_one', email: 'one@example.test', role: 'customer' },
      'cor_one',
      'conv_one',
      'food:test-write:r0:p0',
    );

    expect(food.post).toHaveBeenCalledWith(
      '/api/v1/carts/cart_trusted/items',
      expect.objectContaining({ menu_item_id: 'item_trusted' }),
      'cor_one',
      `tool:${createHash('sha256').update(JSON.stringify({
        actor_id: 'usr_one',
        execution_id: 'food:test-write:r0:p0',
        capability_name: 'add_to_cart',
      })).digest('hex')}:add_to_cart`,
      'usr_one',
    );
  });

  it('rejects malformed Agent and Gateway execution identifiers', async () => {
    const service = new ToolService(food as never, confirmations as never, store as never);
    const actor = { sub: 'usr_one', email: 'one@example.test', role: 'customer' };

    await expect(service.executeProposal(
      proposal({ tool_call_id: 'invalid call id' }),
      { keyword: 'pho bo' },
      actor,
      'cor_one',
      'conv_one',
      'food:test:r0:p0',
    )).rejects.toMatchObject({ response: { code: 'INVALID_TOOL_PROPOSAL' } });
    await expect(service.executeProposal(
      proposal(),
      { keyword: 'pho bo' },
      actor,
      'cor_one',
      'conv_one',
      'invalid execution id',
    )).rejects.toMatchObject({ response: { code: 'INVALID_TOOL_PROPOSAL' } });
  });

  it('keeps Gateway write keys stable, actor-scoped, capability-scoped, and bounded', () => {
    const service = new ToolService(food as never, confirmations as never, store as never);
    const internal = service as unknown as {
      writeKey(name: string, actorId: string, correlationId: string, conversationId?: string, executionId?: string): string;
    };
    const first = internal.writeKey('add_to_cart', 'usr_one', 'cor_one', 'conv_one', 'food:task:r0:p0');

    expect(internal.writeKey('add_to_cart', 'usr_one', 'cor_changed', 'conv_one', 'food:task:r0:p0')).toBe(first);
    expect(internal.writeKey('add_to_cart', 'usr_two', 'cor_one', 'conv_one', 'food:task:r0:p0')).not.toBe(first);
    expect(internal.writeKey('remove_cart_item', 'usr_one', 'cor_one', 'conv_one', 'food:task:r0:p0')).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(128);
  });

  it('does not expose an HTTP execution route', () => {
    const source = readFileSync(
      join(__dirname, '../../src/modules/tools/tool.module.ts'),
      'utf8',
    );

    expect(source).not.toContain("@Post('execute')");
    expect(source).not.toContain('/internal/tools/execute');
  });

  it('resolves authoritative IDs in Gateway before dependent Food writes', async () => {
    const executeProposal = jest.fn(async (
      value: ToolProposal,
      _resolvedArguments: Record<string, unknown>,
      _actor: unknown,
      _correlationId: string,
      _workflowId: string,
      _trustedExecutionId: string,
    ) => {
      if (value.capability_name === 'view_menu_item') {
        return {
          id: 'item_trusted',
          option_groups: [
            {
              id: 'size',
              required: true,
              options: [{ id: 'regular', name: 'Regular' }],
            },
          ],
        };
      }
      if (value.capability_name === 'create_cart') {
        return { id: 'cart_trusted', items: [] };
      }
      return {
        id: 'cart_trusted',
        items: [{ id: 'line_one', menu_item_id: 'item_trusted', quantity: 1 }],
      };
    });
    const assistant = new AssistantService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { executeProposal } as never,
    );
    const proposals = [
      proposal({ capability_name: 'view_menu_item', semantic_arguments: {}, tool_call_id: 'call_view' }),
      proposal({ capability_name: 'create_cart', semantic_arguments: {}, tool_call_id: 'call_cart', risk_ceiling: 'REVERSIBLE_WRITE' }),
      proposal({ capability_name: 'add_to_cart', semantic_arguments: { quantity: 1 }, tool_call_id: 'call_add', risk_ceiling: 'REVERSIBLE_WRITE' }),
    ] as unknown as Record<string, unknown>[];
    const dispatcher = assistant as unknown as {
      dispatchFoodProposals(
        values: Record<string, unknown>[],
        context: Record<string, unknown>,
        selected: Record<string, unknown>,
        user: { sub: string; email: string; role: 'customer' },
        correlationId: string,
        workflowId: string,
        trustedExecutionScope: string,
      ): Promise<{ stateUpdates: Record<string, unknown> }>;
    };

    const result = await dispatcher.dispatchFoodProposals(
      proposals,
      {},
      { id: 'item_trusted', restaurant_id: 'restaurant_trusted' },
      { sub: 'usr_one', email: 'one@example.test', role: 'customer' },
      'cor_one',
      'conv_one',
      'food:task-one:r0',
    );

    expect(executeProposal.mock.calls.map((call) => call[1])).toEqual([
      { menu_item_id: 'item_trusted' },
      { restaurant_id: 'restaurant_trusted' },
      {
        cart_id: 'cart_trusted',
        menu_item_id: 'item_trusted',
        quantity: 1,
        selected_options: [{ group_id: 'size', option_id: 'regular' }],
      },
    ]);
    expect(executeProposal.mock.calls.map((call) => call[5])).toEqual([
      'food:task-one:r0:p0',
      'food:task-one:r0:p1',
      'food:task-one:r0:p2',
    ]);
    expect(result.stateUpdates.cart_id).toBe('cart_trusted');
  });
});
