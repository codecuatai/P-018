import { getActiveHistory } from "@/lib/api-client";
import { calculatePollingInterval, sameHistoryItems } from "@/lib/active-history-cadence";
import type { HistoryItem } from "@/types";

const STORAGE_KEY = "xone_active_history_cache_v1";
const SYNC_CHANNEL_NAME = "xone_active_history_channel";
const MIN_SHARED_FETCH_GAP_MS = 10_000;

type CachedPayload = {
  userSub: string;
  items: HistoryItem[];
  timestamp: number;
  consecutiveUnchanged: number;
};

const cache = new Map<string, CachedPayload>();
const inFlight = new Map<string, Promise<HistoryItem[]>>();
const subscribers = new Map<string, Set<(items: HistoryItem[]) => void>>();
let broadcastChannel: BroadcastChannel | null = null;

function normalizedUserSub(userSub: string): string {
  return userSub.trim();
}

function isCachedPayload(value: unknown): value is CachedPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CachedPayload>;
  return typeof candidate.userSub === "string"
    && Boolean(candidate.userSub.trim())
    && Array.isArray(candidate.items)
    && typeof candidate.timestamp === "number"
    && Number.isFinite(candidate.timestamp)
    && typeof candidate.consecutiveUnchanged === "number"
    && Number.isFinite(candidate.consecutiveUnchanged);
}

function notify(userSub: string, items: HistoryItem[]): void {
  subscribers.get(userSub)?.forEach((listener) => listener(items));
}

function handleExternalUpdate(value: unknown): void {
  if (!isCachedPayload(value)) return;
  const userSub = normalizedUserSub(value.userSub);
  if (!userSub) return;
  const payload = { ...value, userSub };
  cache.set(userSub, payload);
  notify(userSub, payload.items);
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  if (broadcastChannel) return broadcastChannel;
  try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event.data && typeof event.data === "object" && event.data.type === "ACTIVE_HISTORY_UPDATED") {
        handleExternalUpdate(event.data.payload);
      }
    };
  } catch {
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function readStorageCache(userSub: string): CachedPayload | null {
  const key = normalizedUserSub(userSub);
  if (!key) return null;
  const memory = cache.get(key);
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCachedPayload(parsed) || normalizedUserSub(parsed.userSub) !== key) return null;
    const payload = { ...parsed, userSub: key };
    cache.set(key, payload);
    return payload;
  } catch {
    return null;
  }
}

function writeStorageCache(payload: CachedPayload): void {
  const key = normalizedUserSub(payload.userSub);
  if (!key) return;
  const normalized = { ...payload, userSub: key };
  cache.set(key, normalized);
  if (typeof window !== "undefined") {
    try {
      // The payload is limited to the already-shaped public history read model.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage is an optimization; an unavailable quota must not break polling.
    }
    getChannel()?.postMessage({ type: "ACTIVE_HISTORY_UPDATED", payload: normalized });
  }
  notify(key, normalized.items);
}

export function resetActiveHistoryPollerCache(): void {
  cache.clear();
  inFlight.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore unavailable storage in private/restricted browser contexts.
    }
  }
}

export function subscribeActiveHistoryShared(userSub: string, callback: (items: HistoryItem[]) => void): () => void {
  const key = normalizedUserSub(userSub);
  if (!key) return () => undefined;
  const listeners = subscribers.get(key) ?? new Set<(items: HistoryItem[]) => void>();
  listeners.add(callback);
  subscribers.set(key, listeners);

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed: unknown = JSON.parse(event.newValue);
      if (isCachedPayload(parsed) && normalizedUserSub(parsed.userSub) === key) handleExternalUpdate(parsed);
    } catch {
      // A malformed cross-tab payload is ignored.
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageEvent);
    getChannel();
  }
  const existing = readStorageCache(key);
  if (existing) callback(existing.items);

  return () => {
    listeners.delete(callback);
    if (!listeners.size) subscribers.delete(key);
    if (typeof window !== "undefined") window.removeEventListener("storage", handleStorageEvent);
  };
}

export async function fetchActiveHistoryShared(
  userSub: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<{ items: HistoryItem[]; nextInterval: number }> {
  const key = normalizedUserSub(userSub);
  if (!key) return { items: [], nextInterval: calculatePollingInterval([], 0) };

  const now = Date.now();
  const cached = readStorageCache(key);
  if (!options.force && cached && now - cached.timestamp < MIN_SHARED_FETCH_GAP_MS) {
    return { items: cached.items, nextInterval: calculatePollingInterval(cached.items, cached.consecutiveUnchanged) };
  }

  const existing = inFlight.get(key);
  if (existing) {
    const items = await existing;
    const current = readStorageCache(key);
    return { items, nextInterval: calculatePollingInterval(items, current?.consecutiveUnchanged ?? 0) };
  }

  const request = (async () => {
    const result = await getActiveHistory(options.signal);
    const items = result.items ?? [];
    const previous = cached?.items ?? [];
    const consecutiveUnchanged = sameHistoryItems(previous, items) ? (cached?.consecutiveUnchanged ?? 0) + 1 : 0;
    writeStorageCache({ userSub: key, items, timestamp: Date.now(), consecutiveUnchanged });
    return items;
  })();
  inFlight.set(key, request);
  try {
    const items = await request;
    const current = readStorageCache(key);
    return { items, nextInterval: calculatePollingInterval(items, current?.consecutiveUnchanged ?? 0) };
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
}
