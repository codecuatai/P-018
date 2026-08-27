import { AssistantController } from '../src/modules/conversation/assistant.controller';
import type { CorrelatedRequest } from '../src/common/correlation-id.middleware';
import type { AuthUser } from '../src/modules/auth/auth.types';

describe('Assistant action idempotency header', () => {
  const request = { user: { sub: 'actor-1', email: 'actor@example.test', role: 'USER' }, correlationId: 'cor-1' } as unknown as CorrelatedRequest & { user: AuthUser };
  const response = { conversation_id: 'conv-1', message: 'ok', items: [], actions: [], completed: [] };

  it('forwards structured current location to the assistant service', async () => {
    const service = { chat: jest.fn().mockResolvedValue(response) };
    const controller = new AssistantController(service as never);
    const location = {
      latitude: 21.0285,
      longitude: 105.8542,
      accuracy_meters: 10,
      captured_at: '2026-08-27T03:00:00.000Z',
      source: 'device' as const,
    };

    await controller.chat({ message: 'Gọi xe', conversation_id: 'conv-1', current_location: location }, request);

    expect(service.chat).toHaveBeenCalledWith(request.user, 'Gọi xe', 'conv-1', 'cor-1', location);
  });

  it.each([undefined, '', '   '])('rejects a missing or blank key (%p)', async (key) => {
    const service = { act: jest.fn() };
    const controller = new AssistantController(service as never);
    await expect(controller.action({ conversation_id: 'conv-1', action_id: 'act-1' }, key, request)).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
    });
    expect(service.act).not.toHaveBeenCalled();
  });

  it('rejects a key longer than 255 characters without truncating it', async () => {
    const service = { act: jest.fn() };
    const controller = new AssistantController(service as never);
    await expect(controller.action({ conversation_id: 'conv-1', action_id: 'act-1' }, 'x'.repeat(256), request)).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_INVALID' },
    });
    expect(service.act).not.toHaveBeenCalled();
  });

  it('strips only surrounding whitespace and forwards the same stable key', async () => {
    const service = { act: jest.fn().mockResolvedValue(response) };
    const controller = new AssistantController(service as never);
    await controller.action({ conversation_id: 'conv-1', action_id: 'act-1' }, '  k  ', request);
    expect(service.act).toHaveBeenCalledWith(request.user, { conversation_id: 'conv-1', action_id: 'act-1' }, 'cor-1', 'k');
  });
});
