"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { errorText, getFoodTracking } from "@/lib/api-client";
import type { FoodTracking } from "@/types";

const POLL_INTERVAL_MS = 3_000;
type Snapshot = { data?: FoodTracking; loading: boolean; error: string };
type Entry = Snapshot & { orderId: string; listeners: Set<() => void>; timer?: number; controller?: AbortController; inFlight: boolean; snapshot: Snapshot };
const cache = new Map<string, Entry>();
let visibilityListenerInstalled = false;

function terminal(status?: string): boolean { return ["DELIVERED", "CANCELLED", "PAYMENT_FAILED", "RESTAURANT_REJECTED", "REFUNDED"].includes(status ?? ""); }
function entry(orderId: string): Entry { const found = cache.get(orderId); if (found) return found; const created: Entry = { orderId, listeners: new Set(), loading: true, error: "", inFlight: false, snapshot: { loading: true, error: "" } }; cache.set(orderId, created); return created; }
function notify(value: Entry): void { value.snapshot = { data: value.data, loading: value.loading, error: value.error }; value.listeners.forEach((listener) => listener()); }
function clear(value: Entry): void { if (value.timer !== undefined) window.clearTimeout(value.timer); value.timer = undefined; }
function schedule(value: Entry): void { clear(value); if (!value.listeners.size || document.visibilityState === "hidden" || terminal(value.data?.status)) return; value.timer = window.setTimeout(() => { void fetchTracking(value, true); }, POLL_INTERVAL_MS); }
async function fetchTracking(value: Entry, background: boolean): Promise<void> {
  if (!value.listeners.size || value.inFlight || document.visibilityState === "hidden" || (background && terminal(value.data?.status))) return;
  value.inFlight = true; const controller = new AbortController(); value.controller?.abort(); value.controller = controller;
  if (!background) { value.loading = true; value.error = ""; notify(value); }
  try { const data = await getFoodTracking(value.orderId, controller.signal); if (controller.signal.aborted || value.controller !== controller || !value.listeners.size) return; value.data = data; value.error = ""; value.loading = false; notify(value); }
  catch (reason) { if (!controller.signal.aborted) { value.error = errorText(reason); value.loading = false; notify(value); } }
  finally { if (value.controller === controller) { value.controller = undefined; value.inFlight = false; schedule(value); } }
}
function visibility(): void { cache.forEach((value) => { if (document.visibilityState === "hidden") { clear(value); value.controller?.abort(); value.controller = undefined; value.inFlight = false; } else if (value.listeners.size && !value.inFlight && !terminal(value.data?.status)) void fetchTracking(value, true); }); }
function ensureVisibility(): void { if (!visibilityListenerInstalled && typeof document !== "undefined") { document.addEventListener("visibilitychange", visibility); visibilityListenerInstalled = true; } }
function subscribe(orderId: string, listener: () => void, enabled: boolean): () => void { const value = entry(orderId); const wasInactive = value.listeners.size === 0; value.listeners.add(listener); ensureVisibility(); if (enabled && !value.inFlight && (wasInactive || !value.data)) void fetchTracking(value, false); else if (enabled) schedule(value); return () => { value.listeners.delete(listener); if (!value.listeners.size) { clear(value); value.controller?.abort(); value.controller = undefined; value.inFlight = false; } }; }
const serverSnapshot: Snapshot = { loading: false, error: "" };
export function useFoodTracking(orderId?: string, enabled = true): Snapshot & { refresh: () => void } { const key = orderId?.trim() ?? ""; const subscribeToEntry = useCallback((listener: () => void) => key ? subscribe(key, listener, enabled) : () => undefined, [key, enabled]); const read = useCallback(() => key ? entry(key).snapshot : serverSnapshot, [key]); const snapshot = useSyncExternalStore(subscribeToEntry, read, () => serverSnapshot); const refresh = useCallback(() => { if (key) void fetchTracking(entry(key), false); }, [key]); useEffect(() => { ensureVisibility(); }, []); return { ...snapshot, refresh }; }
export function resetFoodTrackingCache(): void { cache.forEach((value) => { clear(value); value.controller?.abort(); }); cache.clear(); }
