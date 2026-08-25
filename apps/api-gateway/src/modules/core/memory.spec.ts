import { MemoryItem, rankMemories } from './memory';

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
