"use client";

import { Check, ChevronDown, CircleAlert, RefreshCw } from "lucide-react";
import { useId, useRef } from "react";

import type { ActivityEntry } from "@/types";

const STATUS_META: Record<ActivityEntry["status"], { label: string; className: string }> = {
  pending: { label: "Chờ xử lý", className: "is-pending" },
  running: { label: "Đang thực hiện", className: "is-running" },
  completed: { label: "Đã hoàn thành", className: "is-completed" },
  retrying: { label: "Đang thử lại", className: "is-retrying" },
  error: { label: "Có lỗi", className: "is-error" },
};

/**
 * Expandable activity timeline. The disclosure state lives in the parent
 * (AgentProgressIndicator) so the "View Activity" button stays a single,
 * un-nested control; this component owns the content region, its id, and the
 * focus-return behaviour.
 */
export function ActivityTimeline({ entries, open, onToggle }: { entries: ActivityEntry[]; open: boolean; onToggle: () => void }) {
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  if (!entries.length) return null;

  const handleToggle = (): void => {
    if (open) {
      // If keyboard focus is inside content that is about to become hidden and
      // inert, move it back to the toggle so it never lands in an invisible
      // region.
      const active = document.activeElement;
      if (active instanceof Node && contentRef.current?.contains(active)) toggleRef.current?.focus();
    }
    onToggle();
  };

  return (
    <div className="activity-timeline">
      <button ref={toggleRef} className="activity-timeline-toggle" type="button" aria-expanded={open} aria-controls={contentId} onClick={handleToggle}>
        <span>{open ? "Thu gọn hoạt động" : "Xem hoạt động"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div id={contentId} ref={contentRef} className={open ? "activity-timeline-body" : "activity-timeline-body is-collapsed"} inert={!open}>
        <div className="activity-timeline-inner">
          <ol className="activity-step-list">
            {entries.map((entry) => {
              const meta = STATUS_META[entry.status];
              return (
                <li key={entry.id} className="activity-step">
                  <span className={`activity-step-dot ${meta.className}`} aria-hidden="true">
                    {entry.status === "completed" ? <Check size={10} /> : entry.status === "error" ? <CircleAlert size={10} /> : entry.status === "retrying" ? <RefreshCw size={10} /> : null}
                  </span>
                  <span className="activity-step-copy">
                    <span className="activity-step-label">{entry.label}</span>
                    <strong className="activity-step-title">{entry.step}</strong>
                    {entry.detail ? <span className="activity-step-detail">{entry.detail}</span> : null}
                  </span>
                  <span className={`activity-step-status ${meta.className}`}>{meta.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
