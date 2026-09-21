"use client";

import React, { useState } from "react";
import { Plus, Radio, X } from "lucide-react";
import {
  PRESET_CHANNEL_TEMPLATES,
  renderChannelIcon,
  type ServiceChannelDef,
} from "../../provider.types";

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChannel: (channel: ServiceChannelDef) => void;
}

export function AddChannelModal({
  isOpen,
  onClose,
  onAddChannel,
}: AddChannelModalProps) {
  const [activePreset, setActivePreset] = useState<ServiceChannelDef>(
    PRESET_CHANNEL_TEMPLATES[0]
  );
  const [customName, setCustomName] = useState(activePreset.name);
  const [customPort, setCustomPort] = useState(activePreset.port);
  const [customDomain, setCustomDomain] = useState(activePreset.domain);
  const [customDesc, setCustomDesc] = useState(activePreset.description);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: ServiceChannelDef) => {
    setActivePreset(preset);
    setCustomName(preset.name);
    setCustomPort(preset.port);
    setCustomDomain(preset.domain);
    setCustomDesc(preset.description);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newChan: ServiceChannelDef = {
      id: customDomain.toLowerCase().replace(/[^a-z0-9]/g, "_") || `chan_${Date.now()}`,
      name: customName || activePreset.name,
      port: customPort || activePreset.port,
      domain: customDomain || activePreset.domain,
      description: customDesc || activePreset.description,
      icon: activePreset.icon,
      color: activePreset.color,
      bgColor: activePreset.bgColor,
      isBuiltIn: false,
    };
    onAddChannel(newChan);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "560px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #E2E8F0",
            background: "#F8FAFC",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#EEF2FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4F46E5",
              }}
            >
              <Radio size={20} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#0F172A",
                  margin: 0,
                }}
              >
                Đăng Ký Thêm Kênh Dịch Vụ Mới
              </h2>
              <span style={{ fontSize: "12px", color: "#64748B" }}>
                Mở rộng phân hệ microservice tiếp nhận tác vụ AI cho đối tác
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
              color: "#64748B",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "8px",
              }}
            >
              Chọn mẫu kênh dịch vụ sẵn có:
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              {PRESET_CHANNEL_TEMPLATES.map((tmpl) => {
                const isSelected = activePreset.id === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectPreset(tmpl)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: isSelected ? `2px solid ${tmpl.color}` : "1px solid #E2E8F0",
                      background: isSelected ? tmpl.bgColor : "#FFFFFF",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ color: tmpl.color }}>
                      {renderChannelIcon(tmpl.icon, 18)}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#0F172A",
                        }}
                      >
                        {tmpl.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748B" }}>
                        {tmpl.port}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Tên hiển thị kênh
              </label>
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  color: "#0F172A",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Service Port / Endpoint
              </label>
              <input
                type="text"
                required
                value={customPort}
                onChange={(e) => setCustomPort(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  color: "#0F172A",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
              Domain Key
            </label>
            <input
              type="text"
              required
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "13px",
                color: "#0F172A",
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
              Mô tả hoạt động
            </label>
            <textarea
              rows={2}
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "13px",
                color: "#0F172A",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                background: "#F1F5F9",
                border: "1px solid #CBD5E1",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                background: "#4F46E5",
                border: "none",
                color: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              Kích hoạt kênh này
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
