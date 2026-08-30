import { InMemoryCoreRepository } from '../src/modules/core/core.module';

describe('conversation pagination', () => {
  it('returns only the requested page with a stable order and total', async () => {
    const repository = new InMemoryCoreRepository();
    const actorId = 'actor-history';
    for (let index = 0; index < 25; index += 1) {
      await repository.saveConversation({ conversationId: `conversation-${String(index).padStart(2, '0')}`, actorId, messages: [], state: {}, version: 0, status: index === 24 ? 'ARCHIVED' : 'ACTIVE', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z' });
    }

    const first = await repository.listConversations(actorId, { includeArchived: true, page: 1, pageSize: 10 });
    const second = await repository.listConversations(actorId, { includeArchived: true, page: 2, pageSize: 10 });
    const activeOnly = await repository.listConversations(actorId, { page: 1, pageSize: 10 });

    expect(first).toMatchObject({ total: 25 });
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(10);
    expect(new Set([...first.items, ...second.items].map((item) => item.conversationId)).size).toBe(20);
    expect(first.items[0]?.conversationId).toBe('conversation-24');
    expect(activeOnly).toMatchObject({ total: 24 });
    expect(activeOnly.items).not.toContainEqual(expect.objectContaining({ status: 'ARCHIVED' }));
  });
});
