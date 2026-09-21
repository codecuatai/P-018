"use client";

import React, { useState } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Layers,
  Network,
  Play,
  Plus,
  Power,
  PowerOff,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Terminal,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import type {
  McpApiKey,
  ProviderTab,
  ServiceChannelDef,
  WebhookTestResult,
} from "../provider.types";

interface TechSectionProps {
  activeTab: ProviderTab;
  onSelectTab: (tab: ProviderTab) => void;
  channels: ServiceChannelDef[];
  connectedServices: Record<string, boolean>;
  onToggleChannel: (id: string) => Promise<void>;
  onToggleAllChannels: (enable: boolean) => Promise<void>;
  onOpenAddChannelModal: () => void;
  mcpKeys: McpApiKey[];
  mcpKeyName: string;
  onChangeMcpKeyName: (name: string) => void;
  onCreateMcpKey: (e?: React.FormEvent) => Promise<void>;
  creatingMcpKey: boolean;
  onRevokeMcpKey: (id: string) => Promise<void>;
  newlyCreatedKey: string | null;
  webhookUrl: string;
  onChangeWebhookUrl: (url: string) => void;
  webhookSecret: string;
  onChangeWebhookSecret: (secret: string) => void;
  webhookEvent: string;
  onChangeWebhookEvent: (ev: string) => void;
  testingWebhook: boolean;
  onTestWebhook: () => Promise<void>;
  webhookTestResult: WebhookTestResult | null;
}

export function TechSection({
  activeTab,
  onSelectTab,
  channels,
  connectedServices,
  onToggleChannel,
  onToggleAllChannels,
  onOpenAddChannelModal,
  mcpKeys,
  mcpKeyName,
  onChangeMcpKeyName,
  onCreateMcpKey,
  creatingMcpKey,
  onRevokeMcpKey,
  newlyCreatedKey,
  webhookUrl,
  onChangeWebhookUrl,
  webhookSecret,
  onChangeWebhookSecret,
  webhookEvent,
  onChangeWebhookEvent,
  testingWebhook,
  onTestWebhook,
  webhookTestResult,
}: TechSectionProps) {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [configTarget, setConfigTarget] = useState<"claude" | "cursor">("claude");

  const activeChannelsCount = Object.values(connectedServices).filter((v) => v !== false).length;

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        "xone-provider-gateway": {
          command: "node",
          args: ["/path/to/P-018-Service/fastmcp/server.js"],
          env: {
            XONE_API_KEY: newlyCreatedKey || "xone_mcp_live_xxxxxxxxxxxxxxxx",
            XONE_GATEWAY_URL: "http://localhost:8100/api",
          },
        },
      },
    },
    null,
    2
  );

  const cursorMcpConfig = JSON.stringify(
    {
      name: "xone-provider-fastmcp",
      type: "sse",
      url: "http://localhost:8100/api/mcp/sse",
      headers: {
        Authorization: `Bearer ${newlyCreatedKey || "xone_mcp_live_xxxxxxxxxxxxxxxx"}`,
      },
    },
    null,
    2
  );

  return (
    <div className="provider-tech-workspace">
      {/* Subtab Navigation Bar */}
      <div
        className="provider-tabs-bar"
        aria-label="Cấu hình kỹ thuật, Kênh Microservices và MCP AI"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "20px",
          borderBottom: "2px solid #E2E8F0",
          paddingBottom: "10px",
          overflowX: "auto",
        }}
      >
        <button
          type="button"
          aria-pressed={activeTab === "mcp"}
          className={`provider-tab${activeTab === "mcp" ? " is-active" : ""}`}
          onClick={() => onSelectTab("mcp")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "mcp" ? "2px solid #7C3AED" : "1px solid #E2E8F0",
            background: activeTab === "mcp" ? "#F5F3FF" : "#FFFFFF",
            color: activeTab === "mcp" ? "#6D28D9" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Bot size={16} />
          <span>Cổng kết nối MCP & AI Keys</span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "10px",
              background: "#7C3AED",
              color: "#FFFFFF",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {mcpKeys.length}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "channels"}
          className={`provider-tab${activeTab === "channels" ? " is-active" : ""}`}
          onClick={() => onSelectTab("channels")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "channels" ? "2px solid #7C3AED" : "1px solid #E2E8F0",
            background: activeTab === "channels" ? "#F5F3FF" : "#FFFFFF",
            color: activeTab === "channels" ? "#6D28D9" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Network size={16} />
          <span>Kênh Microservices</span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "10px",
              background: activeChannelsCount > 0 ? "#10B981" : "#94A3B8",
              color: "#FFFFFF",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {activeChannelsCount}/{channels.length}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "webhooks"}
          className={`provider-tab${activeTab === "webhooks" ? " is-active" : ""}`}
          onClick={() => onSelectTab("webhooks")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "webhooks" ? "2px solid #7C3AED" : "1px solid #E2E8F0",
            background: activeTab === "webhooks" ? "#F5F3FF" : "#FFFFFF",
            color: activeTab === "webhooks" ? "#6D28D9" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Webhook size={16} />
          <span>Tích hợp Webhook & Chữ ký HMAC</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. MCP & AI KEYS TAB */}
      {/* ========================================================================= */}
      {activeTab === "mcp" && (
        <div style={{ display: "grid", gap: "24px" }}>
          {/* Header Card */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <Bot size={20} color="#7C3AED" />
                  <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                    Cổng Kết Nối Model Context Protocol (FastMCP & AI Agents)
                  </h2>
                </div>
                <p style={{ fontSize: "13px", color: "#64748B", margin: 0, maxWidth: "700px" }}>
                  Cung cấp quyền kết nối an toàn cho Claude Desktop, Cursor AI, Windsurf hoặc LangGraph Agents để tự động hóa việc tiếp nhận đơn, cập nhật trạng thái món ăn và tra cứu hành trình cuốc xe.
                </p>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: "#F5F3FF",
                  border: "1px solid #DDD6FE",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#6D28D9",
                }}
              >
                <ShieldCheck size={16} />
                <span>Bảo mật chuẩn SHA-256 HMAC</span>
              </div>
            </div>

            {/* Create API Key Form */}
            <form onSubmit={onCreateMcpKey} style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input
                  type="text"
                  required
                  value={mcpKeyName}
                  onChange={(e) => onChangeMcpKeyName(e.target.value)}
                  placeholder="Đặt tên khóa gợi nhớ: VD: Claude Desktop Mac M3, Cursor Dev Bot..."
                  style={{
                    flex: 1,
                    minWidth: "260px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    fontSize: "13px",
                    color: "#0F172A",
                  }}
                />
                <button
                  type="submit"
                  disabled={creatingMcpKey}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "10px 20px",
                    borderRadius: "8px",
                    background: "#7C3AED",
                    color: "#FFFFFF",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: creatingMcpKey ? "not-allowed" : "pointer",
                  }}
                >
                  <KeyRound size={16} />
                  <span>{creatingMcpKey ? "Đang khởi tạo..." : "Tạo Khóa MCP Mới"}</span>
                </button>
              </div>
            </form>

            {/* Newly Created Key Alert */}
            {newlyCreatedKey && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "14px 18px",
                  borderRadius: "10px",
                  background: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#065F46", marginBottom: "4px" }}>
                  🎉 Khóa API của bạn đã được khởi tạo thành công (Chỉ hiển thị 1 lần duy nhất):
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#FFFFFF",
                    borderRadius: "6px",
                    border: "1px solid #6EE7B7",
                    fontFamily: "monospace",
                    fontSize: "13px",
                    color: "#047857",
                    fontWeight: 700,
                    marginTop: "6px",
                  }}
                >
                  <span>{newlyCreatedKey}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(newlyCreatedKey, "key")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#059669",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {copiedSnippet === "key" ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedSnippet === "key" ? "Đã sao chép!" : "Sao chép"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active Keys Table */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>
              Danh Sách Khóa Đang Hoạt Động ({mcpKeys.length})
            </h3>

            {mcpKeys.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px", color: "#64748B", fontSize: "13px" }}>
                Chưa có khóa MCP API nào. Vui lòng tạo khóa ở phía trên để liên kết AI Agent.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #E2E8F0", color: "#64748B" }}>
                      <th style={{ padding: "10px 12px" }}>Tên định danh</th>
                      <th style={{ padding: "10px 12px" }}>Tiền tố khóa</th>
                      <th style={{ padding: "10px 12px" }}>Ngày tạo</th>
                      <th style={{ padding: "10px 12px" }}>Lần dùng cuối</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mcpKeys.map((key) => (
                      <tr key={key.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "12px", fontWeight: 600, color: "#0F172A" }}>{key.name}</td>
                        <td style={{ padding: "12px", fontFamily: "monospace", color: "#475569" }}>
                          {key.prefix ? `${key.prefix}••••••••` : "xone_mcp_••••••••"}
                        </td>
                        <td style={{ padding: "12px", color: "#64748B" }}>
                          {new Date(key.createdAt).toLocaleDateString("vi-VN")}
                        </td>
                        <td style={{ padding: "12px", color: "#64748B" }}>
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString("vi-VN") : "Chưa sử dụng"}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => void onRevokeMcpKey(key.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#DC2626",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Trash2 size={14} />
                            <span>Thu hồi khóa</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Client Configuration Snippets */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                  Mẫu Cấu Hình Cho Client (1-Click Copy)
                </h3>
                <span style={{ fontSize: "12px", color: "#64748B" }}>
                  Dán trực tiếp vào file cấu hình của Claude Desktop hoặc Cursor AI
                </span>
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setConfigTarget("claude")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: configTarget === "claude" ? "1px solid #7C3AED" : "1px solid #CBD5E1",
                    background: configTarget === "claude" ? "#F5F3FF" : "#FFFFFF",
                    color: configTarget === "claude" ? "#6D28D9" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  Claude Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTarget("cursor")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: configTarget === "cursor" ? "1px solid #7C3AED" : "1px solid #CBD5E1",
                    background: configTarget === "cursor" ? "#F5F3FF" : "#FFFFFF",
                    color: configTarget === "cursor" ? "#6D28D9" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  Cursor AI
                </button>
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <pre
                style={{
                  background: "#0F172A",
                  color: "#E2E8F0",
                  padding: "16px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  overflowX: "auto",
                  margin: 0,
                  fontFamily: "monospace",
                }}
              >
                {configTarget === "claude" ? claudeDesktopConfig : cursorMcpConfig}
              </pre>

              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    configTarget === "claude" ? claudeDesktopConfig : cursorMcpConfig,
                    "snippet"
                  )
                }
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.15)",
                  color: "#FFFFFF",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                }}
              >
                {copiedSnippet === "snippet" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedSnippet === "snippet" ? "Đã chép!" : "Sao chép JSON"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MICROSERVICES CHANNELS TAB */}
      {/* ========================================================================= */}
      {activeTab === "channels" && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Header Bar */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                Quản Lý Kênh Dịch Vụ Microservices
              </h2>
              <span style={{ fontSize: "12px", color: "#64748B" }}>
                Bật/tắt các cổng dịch vụ độc lập phân tải từ cổng Gateway X-One (:8100)
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void onToggleAllChannels(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  color: "#065F46",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <Power size={14} />
                <span>Bật tất cả</span>
              </button>

              <button
                type="button"
                onClick={() => void onToggleAllChannels(false)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <PowerOff size={14} />
                <span>Ngắt tất cả</span>
              </button>

              <button
                type="button"
                onClick={onOpenAddChannelModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#7C3AED",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <Plus size={14} />
                <span>+ Thêm Kênh Mới</span>
              </button>
            </div>
          </div>

          {/* Grid of Microservice Channels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {channels.map((ch) => {
              const isOnline = connectedServices[ch.domain] !== false;
              return (
                <div
                  key={ch.id}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    border: `1px solid ${isOnline ? "#E2E8F0" : "#F1F5F9"}`,
                    padding: "18px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    opacity: isOnline ? 1 : 0.65,
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: ch.bgColor,
                          color: ch.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "14px",
                        }}
                      >
                        {ch.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#0F172A" }}>{ch.name}</div>
                        <div style={{ fontSize: "11px", color: "#64748B", fontFamily: "monospace" }}>{ch.port}</div>
                      </div>
                    </div>

                    <label className="xone-switch" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isOnline}
                        onChange={() => void onToggleChannel(ch.id)}
                      />
                      <span className="xone-switch-slider" />
                    </label>
                  </div>

                  <p style={{ fontSize: "12px", color: "#475569", margin: "0 0 12px", lineHeight: "1.4" }}>
                    {ch.description}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #F1F5F9", paddingTop: "10px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: isOnline ? "#059669" : "#94A3B8",
                      }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: isOnline ? "#10B981" : "#94A3B8",
                        }}
                      />
                      <span>{isOnline ? "Đang trực tuyến" : "Tạm ngắt kết nối"}</span>
                    </span>

                    <span style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>
                      domain: {ch.domain}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. WEBHOOKS INTEGRATION TAB */}
      {/* ========================================================================= */}
      {activeTab === "webhooks" && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Webhook Configuration Card */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }}>
                Cấu Hình Webhook & Bảo Mật HMAC-SHA256
              </h2>
              <span style={{ fontSize: "13px", color: "#64748B" }}>
                Nhận tín hiệu gọi ngược khi có đơn món mới, cuốc xe mới hoặc cập nhật thanh toán đối tác
              </span>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Webhook Endpoint URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => onChangeWebhookUrl(e.target.value)}
                placeholder="https://api.doitac.vn/webhooks/xone-orders"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  color: "#0F172A",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Webhook Secret (Khóa bí mật tạo chữ ký HMAC-SHA256)
              </label>
              <input
                type="text"
                value={webhookSecret}
                onChange={(e) => onChangeWebhookSecret(e.target.value)}
                placeholder="whsec_xxxxxxxxxxxxxxxxxxxxxxxx"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  fontFamily: "monospace",
                  color: "#0F172A",
                }}
              />
            </div>
          </div>

          {/* Webhook Live Sandbox Card */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                  Webhook Live Sandbox
                </h3>
                <span style={{ fontSize: "12px", color: "#64748B" }}>
                  Bắn thử nghiệm gói tin webhook giả lập trực tiếp tới máy chủ của bạn kèm chữ ký HMAC-SHA256
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
              <select
                value={webhookEvent}
                onChange={(e) => onChangeWebhookEvent(e.target.value)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  color: "#0F172A",
                  background: "#FFFFFF",
                }}
              >
                <option value="order.created">order.created (Đơn món ăn mới)</option>
                <option value="ride.requested">ride.requested (Khách gọi xe mới)</option>
                <option value="reservation.booked">reservation.booked (Đặt bàn ăn)</option>
                <option value="pharmacy.prescription">pharmacy.prescription (Đơn thuốc cần duyệt)</option>
              </select>

              <button
                type="button"
                disabled={testingWebhook}
                onClick={onTestWebhook}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  background: "#7C3AED",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: testingWebhook ? "not-allowed" : "pointer",
                }}
              >
                <Send size={15} />
                <span>{testingWebhook ? "Đang phát webhook..." : "Gửi thử nghiệm Live"}</span>
              </button>
            </div>

            {webhookTestResult && (
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: "10px",
                  background: webhookTestResult.success ? "#ECFDF5" : "#FEF2F2",
                  border: `1px solid ${webhookTestResult.success ? "#A7F3D0" : "#FECACA"}`,
                  fontSize: "13px",
                  color: webhookTestResult.success ? "#065F46" : "#991B1B",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                  {webhookTestResult.success ? "Giao tiếp thành công!" : "Giao tiếp thất bại."}
                </div>
                <div>
                  Mã phản hồi HTTP: <strong>{webhookTestResult.status_code || "N/A"}</strong> · Độ trễ:{" "}
                  <strong>{webhookTestResult.latency_ms || 0}ms</strong>
                </div>
                {webhookTestResult.response_body && (
                  <pre
                    style={{
                      background: "rgba(0,0,0,0.05)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginTop: "8px",
                      fontSize: "11px",
                      overflowX: "auto",
                    }}
                  >
                    {webhookTestResult.response_body}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
