export type MemoryType = 'user_preference' | 'episodic' | 'decision' | 'correction' | 'unresolved';
export type MemoryStatus = 'CANDIDATE' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED' | 'EXPIRED';
export type PrivacyClass = 'standard' | 'sensitive';

export interface MemoryItem {
  id: string; actorId: string; conversationId?: string; memoryType: MemoryType;
  namespace: string; key: string; typedValue: unknown; normalizedText?: string;
  confidence: number; salience: number; sourceTurnId?: string; validFrom: string;
  validUntil?: string; supersedesId?: string; userConfirmed: boolean;
  privacyClass: PrivacyClass; status: MemoryStatus; createdAt: string;
}

export interface MemoryCandidate extends Pick<MemoryItem, 'memoryType'|'namespace'|'key'|'typedValue'|'confidence'|'sourceTurnId'> {
  normalizedText?: string; salience?: number; validUntil?: string; requiresConfirmation?: boolean;
  privacyClass?: PrivacyClass;
}

export interface RetrievedMemory extends MemoryItem { whyRetrieved: string }

export function isUsableMemory(item: MemoryItem, now = Date.now()): boolean {
  return item.status === 'ACTIVE' && (!item.validUntil || Date.parse(item.validUntil) > now);
}

export function rankMemories(items: MemoryItem[], query: { actorId: string; key?: string; namespace?: string; now?: number }): RetrievedMemory[] {
  const now = query.now ?? Date.now();
  return items.filter((item) => item.actorId === query.actorId && isUsableMemory(item, now))
    .filter((item) => !query.namespace || item.namespace === query.namespace)
    .filter((item) => !query.key || item.key === query.key)
    .sort((a, b) => Number(b.userConfirmed) - Number(a.userConfirmed) || b.confidence - a.confidence || b.salience - a.salience || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((item) => ({ ...item, whyRetrieved: query.key && item.key === query.key ? 'exact_key' : 'scoped_rank' }));
}
