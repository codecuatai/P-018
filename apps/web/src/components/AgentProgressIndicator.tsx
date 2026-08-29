"use client";

import { Clock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { genericActivityEntries, genericProgressStep } from "@/lib/progress-filter";
import type { ActivityEntry } from "@/types";

import { ActivityTimeline } from "./ActivityTimeline";

const TICK_MS = 1_000;
const DEFAULT_LONG_WAIT_MS = 15_000;

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} phút ${String(seconds).padStart(2, "0")} giây` : `${totalSeconds} giây`;
}

/**
 * Indeterminate progress panel shown while an Assistant request is in flight.
 *
 * The backend does not stream progress events yet, so the panel never invents
 * per-service facts: it shows generic high-level stages driven by elapsed
 * time, a real elapsed timer, and (when provided) a timeline built only from
 * data the backend actually returned. No fake percentages are rendered.
 *
 * "Retry" stays long-wait-only and requires an onRetry handler — the caller
 * is responsible for guaranteeing idempotency (e.g. by re-using the original
 * idempotency key for the failed action). The square "Stop generating" control
 * lives in the chat composer, not in this panel, so the panel has no onStop.
 */
export function AgentProgressIndicator({ startedAt, activity, contextLabel, longWaitMs = DEFAULT_LONG_WAIT_MS, onRetry }: {
  startedAt: number;
  activity?: ActivityEntry[];
  contextLabel?: string;
  longWaitMs?: number;
  onRetry?: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - startedAt));
  const [activityOpen, setActivityOpen] = useState(false);

  // A single interval owns the timer. It reads Date.now() on every tick so a
  // throttled background tab catches up when it becomes visible again, and it
  // is torn down on unmount so a finished request never keeps ticking.
  useEffect(() => {
    const update = (): void => setElapsedMs(Math.max(0, Date.now() - startedAt));
    update();
    const interval = window.setInterval(update, TICK_MS);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const isLongWait = elapsedMs >= longWaitMs;
  const currentStep = genericProgressStep(elapsedMs);
  const timelineEntries = activity && activity.length > 0 ? activity : genericActivityEntries(elapsedMs);

  return (
    <div className="agent-progress">
      <div className="agent-progress-head">
        <span className="agent-progress-dots" aria-hidden="true"><span /><span /><span /></span>
        {/* The elapsed timer deliberately lives outside this status region so
            screen readers hear step changes, not a per-second countdown. */}
        <p className={`agent-progress-status${isLongWait ? " is-long-wait" : ""}`} role="status">
          {isLongWait ? "Lâu hơn dự kiến — mình vẫn đang xử lý yêu cầu." : contextLabel ?? currentStep.label}
        </p>
      </div>
      <p className="agent-progress-meta"><Clock size={13} aria-hidden="true" /> Đã chờ {formatElapsed(elapsedMs)}</p>
      {isLongWait && !onRetry ? <p className="agent-progress-note">Bạn có thể tiếp tục chờ hoặc dừng tạo phản hồi bất cứ lúc nào.</p> : null}
      {isLongWait && onRetry ? (
        <div className="agent-progress-actions">
          <button className="progress-action-button" type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Thử lại</button>
        </div>
      ) : null}
      <ActivityTimeline entries={timelineEntries} open={activityOpen} onToggle={() => setActivityOpen((value) => !value)} />
    </div>
  );
}
