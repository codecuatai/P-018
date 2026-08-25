"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { errorText, getRideTracking } from "@/lib/api-client";
import type { RideTracking } from "@/types";

const POLL_INTERVAL_MS = 1000;

type RideSnapshot = {
  data?: RideTracking;
  loading: boolean;
  error: string;
};

type RideEntry = RideSnapshot & {
  bookingId: string;
  listeners: Set<() => void>;
  timer?: number;
  controller?: AbortController;
  inFlight: boolean;
  snapshot: RideSnapshot;
};

const cache = new Map<string, RideEntry>();
let visibilityListenerInstalled = false;

function isTerminalStatus(status?: string): boolean {
  return status === "COMPLETED" || status === "NO_DRIVER" || status === "FAILED" || status === "PAYMENT_FAILED" || status === "CANCELLED";
}

function getEntry(bookingId: string): RideEntry {
  const existing = cache.get(bookingId);
  if (existing) return existing;
  const entry: RideEntry = { bookingId, listeners: new Set(), loading: true, error: "", inFlight: false, snapshot: { loading: true, error: "" } };
  cache.set(bookingId, entry);
  return entry;
}

function notify(entry: RideEntry): void {
  entry.snapshot = { data: entry.data, loading: entry.loading, error: entry.error };
  entry.listeners.forEach((listener) => listener());
}

function clearTimer(entry: RideEntry): void {
  if (entry.timer !== undefined) window.clearTimeout(entry.timer);
  entry.timer = undefined;
}

function schedule(entry: RideEntry): void {
  clearTimer(entry);
  if (!entry.listeners.size || document.visibilityState === "hidden" || isTerminalStatus(entry.data?.status)) return;
  entry.timer = window.setTimeout(() => { void fetchRide(entry, true); }, POLL_INTERVAL_MS);
}

async function fetchRide(entry: RideEntry, background: boolean): Promise<void> {
  if (!entry.listeners.size || entry.inFlight || document.visibilityState === "hidden" || (background && isTerminalStatus(entry.data?.status))) return;
  entry.inFlight = true;
  const controller = new AbortController();
  entry.controller?.abort();
  entry.controller = controller;
  if (!background) {
    entry.loading = true;
    entry.error = "";
    notify(entry);
  }
  try {
    const data = await getRideTracking(entry.bookingId, controller.signal);
    if (controller.signal.aborted || entry.controller !== controller || !entry.listeners.size) return;
    entry.data = data;
    entry.error = "";
    entry.loading = false;
    notify(entry);
  } catch (reason) {
    if (!controller.signal.aborted) {
      entry.error = errorText(reason);
      entry.loading = false;
      notify(entry);
    }
  } finally {
    if (entry.controller === controller) entry.controller = undefined;
    entry.inFlight = false;
    schedule(entry);
  }
}

function handleVisibilityChange(): void {
  cache.forEach((entry) => {
    if (document.visibilityState === "hidden") {
      clearTimer(entry);
      entry.controller?.abort();
      return;
    }
    if (entry.listeners.size && !entry.inFlight && !isTerminalStatus(entry.data?.status)) void fetchRide(entry, true);
  });
}

function ensureVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === "undefined") return;
  document.addEventListener("visibilitychange", handleVisibilityChange);
  visibilityListenerInstalled = true;
}

function subscribe(bookingId: string, listener: () => void): () => void {
  const entry = getEntry(bookingId);
  entry.listeners.add(listener);
  ensureVisibilityListener();
  if (!entry.data && !entry.inFlight) void fetchRide(entry, false);
  else schedule(entry);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) {
      clearTimer(entry);
      entry.controller?.abort();
    }
  };
}

function getSnapshot(bookingId: string): RideSnapshot {
  return getEntry(bookingId).snapshot;
}

const serverSnapshot: RideSnapshot = { loading: false, error: "" };

export function useRideTracking(bookingId?: string, enabled = true): RideSnapshot & { refresh: () => void } {
  const key = bookingId?.trim() ?? "";
  const activeKey = enabled ? key : "";
  const subscribeToEntry = useCallback((listener: () => void) => activeKey ? subscribe(activeKey, listener) : () => undefined, [activeKey]);
  const readSnapshot = useCallback(() => activeKey ? getSnapshot(activeKey) : serverSnapshot, [activeKey]);
  const snapshot = useSyncExternalStore(subscribeToEntry, readSnapshot, () => serverSnapshot);
  const refresh = useCallback(() => {
    if (!activeKey) return;
    const entry = getEntry(activeKey);
    void fetchRide(entry, false);
  }, [activeKey]);
  useEffect(() => { if (activeKey) ensureVisibilityListener(); }, [activeKey]);
  return { ...snapshot, refresh };
}

export function markRideTrackingCancelled(bookingId: string): void {
  const key = bookingId.trim();
  if (!key) return;
  const entry = getEntry(key);
  clearTimer(entry);
  entry.controller?.abort();
  entry.controller = undefined;
  entry.inFlight = false;
  entry.data = entry.data ? { ...entry.data, status: "CANCELLED" } : { booking_id: key, status: "CANCELLED", progress: 0, eta_seconds: 0 };
  entry.loading = false;
  entry.error = "";
  notify(entry);
}

export function resetRideTrackingCache(): void {
  cache.forEach((entry) => { clearTimer(entry); entry.controller?.abort(); });
  cache.clear();
}
