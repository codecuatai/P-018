"use client";

import React from "react";
import { Plug2, Store, Zap } from "lucide-react";
import type { ProviderWorkspace } from "../provider.types";

interface WorkspaceSwitcherProps {
  currentWorkspace: ProviderWorkspace;
  onSelectWorkspace: (workspace: ProviderWorkspace) => void;
  activeOrdersCount: number;
  catalogItemsCount: number;
  activeChannelsCount: number;
  totalChannelsCount: number;
}

export function WorkspaceSwitcher({
  currentWorkspace,
  onSelectWorkspace,
  activeOrdersCount,
  catalogItemsCount,
  activeChannelsCount,
  totalChannelsCount,
}: WorkspaceSwitcherProps) {
  return (
    <div
      className="provider-workspace-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        background: "#FFFFFF",
        borderRadius: "14px",
        border: "1px solid #E2E8F0",
        marginBottom: "20px",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        overflowX: "auto",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", paddingRight: "8px", borderRight: "1px solid #E2E8F0", flexShrink: 0 }}>
        Không Gian:
      </div>

      {/* Workspace 1: Live Operations */}
      <button
        type="button"
        onClick={() => onSelectWorkspace("operations")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 18px",
          borderRadius: "10px",
          border: currentWorkspace === "operations" ? "2px solid #4F46E5" : "1px solid #E2E8F0",
          background: currentWorkspace === "operations" ? "#EEF2FF" : "#F8FAFC",
          color: currentWorkspace === "operations" ? "#4338CA" : "#475569",
          fontWeight: 700,
          fontSize: "14px",
          cursor: "pointer",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "7px",
            background: currentWorkspace === "operations" ? "#4F46E5" : "#E2E8F0",
            color: currentWorkspace === "operations" ? "#FFFFFF" : "#64748B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Zap size={16} />
        </div>
        <span>⚡ Trung tâm điều hành</span>
        {activeOrdersCount > 0 && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "12px",
              background: "#EA580C",
              color: "#FFFFFF",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {activeOrdersCount}
          </span>
        )}
      </button>

      {/* Workspace 2: Store & Business */}
      <button
        type="button"
        onClick={() => onSelectWorkspace("business")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 18px",
          borderRadius: "10px",
          border: currentWorkspace === "business" ? "2px solid #059669" : "1px solid #E2E8F0",
          background: currentWorkspace === "business" ? "#ECFDF5" : "#F8FAFC",
          color: currentWorkspace === "business" ? "#065F46" : "#475569",
          fontWeight: 700,
          fontSize: "14px",
          cursor: "pointer",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "7px",
            background: currentWorkspace === "business" ? "#059669" : "#E2E8F0",
            color: currentWorkspace === "business" ? "#FFFFFF" : "#64748B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Store size={16} />
        </div>
        <span>🏪 Quản lý Kinh doanh</span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "12px",
            background: currentWorkspace === "business" ? "#A7F3D0" : "#E2E8F0",
            color: currentWorkspace === "business" ? "#065F46" : "#64748B",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          {catalogItemsCount} món
        </span>
      </button>

      {/* Workspace 3: Tech & AI MCP */}
      <button
        type="button"
        onClick={() => onSelectWorkspace("tech")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 18px",
          borderRadius: "10px",
          border: currentWorkspace === "tech" ? "2px solid #7C3AED" : "1px solid #E2E8F0",
          background: currentWorkspace === "tech" ? "#F5F3FF" : "#F8FAFC",
          color: currentWorkspace === "tech" ? "#6D28D9" : "#475569",
          fontWeight: 700,
          fontSize: "14px",
          cursor: "pointer",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "7px",
            background: currentWorkspace === "tech" ? "#7C3AED" : "#E2E8F0",
            color: currentWorkspace === "tech" ? "#FFFFFF" : "#64748B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plug2 size={16} />
        </div>
        <span>🔌 Kỹ thuật & AI MCP</span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "12px",
            background: currentWorkspace === "tech" ? "#DDD6FE" : "#E2E8F0",
            color: currentWorkspace === "tech" ? "#5B21B6" : "#64748B",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          {activeChannelsCount}/{totalChannelsCount} kênh
        </span>
      </button>
    </div>
  );
}
