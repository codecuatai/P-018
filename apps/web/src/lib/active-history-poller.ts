import { getActiveHistory } from "@/lib/api-client";
import { calculatePollingInterval, sameHistoryItems } from "@/lib/active-history-cadence";
import type { HistoryItem } from "@/types";

const STORAGE_KEY = "xone_active_history_cache_v1";
const SYNC_CHANNEL_NAME = "xone_active_history_channel";
const MIN_SHARED_FETCH_GAP_MS = 10_000; // 10 seconds min gap across all tabs

type CachedPayload = {
  userSub: string;
  items: HistoryItem[];
  timestamp: number;
  consecutiveUnchanged: number;
};

let inMemoryCache: CachedPayload | null = null;
let inFlightPromise: Promise<HistoryItem[]> | null = null;
const subscribers = new Set<(items: HistoryItem[]) => void>();

let broadcastChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data && typeof event.data === "object" && event.data.type === "ACTIVE_HISTORY_UPDATED") {
          const payload = event.data.payload as CachedPayload;
          handleExternalUpdate(payload);
        }
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function handleExternalUpdate(payload: CachedPayload): void {
  if (!payload || typeof payload !== "object") return;
  inMemoryCache = payload;
  subscribers.forEach((listener) => listener(payload.items));
}

function readStorageCache(userSub: string): CachedPayload | null {
  if (inMemoryCache && inMemoryCache.userSub === userSub) return inMemoryCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (parsed && parsed.userSub === userSub && Array.isArray(parsed.items) && typeof parsed.timestamp === "number") {
      inMemoryCache = parsed;
      return parsed;
    }
  } catch {}
  return null;
}

function writeStorageCache(payload: CachedPayload): void {
  inMemoryCache = payload;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
    const channel = getChannel();
    channel?.postMessage({ type: "ACTIVE_HISTORY_UPDATED", payload });
  }
  subscribers.forEach((listener) => listener(payload.items));
}

export function resetActiveHistoryPollerCache(): void {
  inMemoryCache = null;
  inFlightPromise = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}

export function subscribeActiveHistoryShared(
  userSub: string,
  callback: (items: HistoryItem[]) => void
): () => void {
  subscribers.add(callback);

  // Install window storage listener as fallback for cross-tab sync
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const payload = JSON.parse(event.newValue) as CachedPayload;
        if (payload.userSub === userSub) handleExternalUpdate(payload);
      } catch {}
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageEvent);
    getChannel(); // initialize BroadcastChannel
  }

  // Provide initial cached items if available
  const existing = readStorageCache(userSub);
  if (existing) {
    callback(existing.items);
  }

  return () => {
    subscribers.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

export async function fetchActiveHistoryShared(
  userSub: string,
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<{ items: HistoryItem[]; nextInterval: number }> {
  const now = Date.now();
  const cached = readStorageCache(userSub);

  // If fetched within 10 seconds by any tab/component and not forced, reuse cached result without HTTP call
  if (!options.force && cached && now - cached.timestamp < MIN_SHARED_FETCH_GAP_MS) {
    const nextInterval = calculatePollingInterval(cached.items, cached.consecutiveUnchanged);
    return { items: cached.items, nextInterval };
  }

  // Deduplicate concurrent in-flight requests in the same tab
  if (inFlightPromise) {
    const items = await inFlightPromise;
    const currentCached = readStorageCache(userSub);
    const nextInterval = calculatePollingInterval(items, currentCached?.consecutiveUnchanged ?? 0);
    return { items, nextInterval };
  }

  inFlightPromise = (async () => {
    try {
      const result = await getActiveHistory(options.signal);
      const items = result.items ?? [];
      const previous = cached?.items ?? [];
      const isSame = sameHistoryItems(previous, items);
      const consecutiveUnchanged = isSame ? (cached?.consecutiveUnchanged ?? 0) + 1 : 0;

      const payload: CachedPayload = {
        userSub,
        items,
        timestamp: Date.now(),
        consecutiveUnchanged,
      };

      writeStorageCache(payload);
      return items;
    } finally {
      inFlightPromise = null;
    }
  })();

  const items = await inFlightPromise;
  const currentCached = readStorageCache(userSub);
  const nextInterval = calculatePollingInterval(items, currentCached?.consecutiveUnchanged ?? 0);
  return { items, nextInterval };
}
