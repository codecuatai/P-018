import { MemoryItem, rankMemories } from './memory';
import { InMemoryCoreRepository } from './core.module';

describe('memory retrieval', () => {
  const base: Omit<MemoryItem, 'id' | 'actorId'> = { namespace: 'food', key: 'spice_level', typedValue: 'low', memoryType: 'user_preference', confidence: 0.9, salience: 0.5, userConfirmed: true, privacyClass: 'standard', status: 'ACTIVE', validFrom: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' };
  it('isolates actors and rejects expired entries', () => {
    const result = rankMemories([{ ...base, id: 'a', actorId: 'actor-a' }, { ...base, id: 'b', actorId: 'actor-b' }, { ...base, id: 'expired', actorId: 'actor-a', validUntil: '2025-01-01T00:00:00.000Z' }], { actorId: 'actor-a', now: Date.parse('2026-01-01T00:00:00.000Z') });
    expect(result.map((item) => item.id)).toEqual(['a']);
  });
  it('returns provenance and ranks exact keys', () => {
    const result = rankMemories([{ ...base, id: 'other', actorId: 'actor-a', key: 'other', userConfirmed: false, confidence: 0.99 }, { ...base, id: 'exact', actorId: 'actor-a', sourceTurnId: 'turn-1' }], { actorId: 'actor-a', key: 'spice_level' });
    expect(result[0]).toMatchObject({ id: 'exact', sourceTurnId: 'turn-1', whyRetrieved: 'exact_key' });
  });
});

describe('memory repository runtime', () => {
  it('persists ordered turns and isolates them by actor', async () => {
    const repo = new InMemoryCoreRepository();
    await repo.appendConversationTurn({ conversationId: 'c1', actorId: 'a1', userMessage: { role: 'user', content: 'hello', createdAt: new Date().toISOString() }, assistantMessage: { role: 'assistant', content: 'hi', createdAt: new Date().toISOString() }, stateUpdates: {} });
    expect((await repo.listConversationTurns('c1', 'a1')).map((turn) => turn.sequenceNo)).toEqual([1, 2]);
    expect(await repo.listConversationTurns('c1', 'a2')).toEqual([]);
  });

  it('supersedes an active memory and rejects sensitive promotion', async () => {
    const repo = new InMemoryCoreRepository();
    const first = await repo.promoteMemory('a1', undefined, { memoryType: 'user_preference', namespace: 'food', key: 'spice', typedValue: 'high', confidence: 0.9 });
    const second = await repo.promoteMemory('a1', undefined, { memoryType: 'correction', namespace: 'food', key: 'spice', typedValue: 'low', confidence: 1 }, { userConfirmed: true });
    expect(second.supersedesId).toBe(first.id);
    expect((await repo.retrieveMemories('a1', { key: 'spice' })).map((item) => item.typedValue)).toEqual(['low']);
    await expect(repo.promoteMemory('a1', undefined, { memoryType: 'user_preference', namespace: 'health', key: 'condition', typedValue: 'x', confidence: 1, privacyClass: 'sensitive' })).rejects.toThrow('SENSITIVE_MEMORY_REQUIRES_DOMAIN_OWNER');
  });
});
