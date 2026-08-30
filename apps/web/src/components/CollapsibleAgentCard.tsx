"use client";

import { ChevronDown } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

export function CollapsibleAgentCard({
  label,
  title,
  status,
  summary,
  defaultCollapsed = false,
  children,
}: {
  label: string;
  title: string;
  status?: string;
  summary?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = (): void => {
    if (!collapsed) {
      const active = document.activeElement;
      if (active instanceof Node && contentRef.current?.contains(active)) toggleRef.current?.focus();
    }
    setCollapsed(!collapsed);
  };

  return (
    <section className="collapsible-agent-card" aria-label={title}>
      <header className="collapsible-card-header">
        <div className="collapsible-card-copy">
          <span className="collapsible-card-eyebrow">{label}</span>
          <h3 className="collapsible-card-title">{title}</h3>
          {collapsed && status ? <span className="collapsible-card-status">{status}</span> : null}
          {collapsed && summary ? <p className="collapsible-card-summary">{summary}</p> : null}
        </div>
        <button
          ref={toggleRef}
          className="collapsible-card-toggle"
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={toggle}
        >
          <ChevronDown size={15} aria-hidden="true" />
          <span>{collapsed ? "Hiện tất cả" : "Thu gọn"}</span>
        </button>
      </header>
      <div
        id={contentId}
        ref={contentRef}
        className={collapsed ? "collapsible-card-content is-collapsed" : "collapsible-card-content"}
        inert={collapsed}
      >
        <div className="collapsible-card-content-inner">{children}</div>
      </div>
    </section>
  );
}
