"use client";

import React from "react";
import { PlusCircle, Radio } from "lucide-react";
import type { ServiceChannelDef } from "../provider.types";

interface MicroservicesStatusBarProps {
  channels: ServiceChannelDef[];
  connectedServices: Record<string, boolean>;
  onSeedSample?: (domain: string, label: string) => Promise<any>;
  seedingDomain?: string | null;
  allowedDomain?: string;
}

export function MicroservicesStatusBar({
  channels,
  connectedServices,
  onSeedSample,
  seedingDomain,
  allowedDomain,
}: MicroservicesStatusBarProps) {
  const activeCount = Object.values(connectedServices).filter((v) => v !== false).length;
  const totalCount = channels.length;
  const isAll = !allowedDomain || allowedDomain === "all";
  const showFood = isAll || allowedDomain === "restaurant_merchant" || allowedDomain === "food";
  const showRide = isAll || allowedDomain === "ride_driver" || allowedDomain === "ride";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "#FFFFFF",
        borderRadius: "12px",
        border: "1px solid #E2E8F0",
        marginBottom: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        flexWrap: "wrap",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Radio size={16} color="#4F46E5" />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>
            Trạng thái Microservices:
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "12px",
              background: activeCount > 0 ? "#ECFDF5" : "#FEF2F2",
              color: activeCount > 0 ? "#047857" : "#B91C1C",
            }}
          >
            {activeCount}/{totalCount} Trực tuyến
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {channels.map((ch) => {
            const isOnline = connectedServices[ch.domain] !== false;
            return (
              <span
                key={ch.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: isOnline ? ch.bgColor : "#F1F5F9",
                  color: isOnline ? ch.color : "#94A3B8",
                  border: `1px solid ${isOnline ? `${ch.color}20` : "#E2E8F0"}`,
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: isOnline ? "#10B981" : "#94A3B8",
                  }}
                />
                <span>{ch.name}</span>
                <span style={{ opacity: 0.6, fontSize: "10px" }}>({ch.port.split(" ")[1] || ch.port})</span>
              </span>
            );
          })}
        </div>
      </div>

      {onSeedSample && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {showFood && (
            <button
              type="button"
              disabled={Boolean(seedingDomain)}
              onClick={() => onSeedSample("food", "đơn món ăn mẫu")}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#FFF7ED",
                border: "1px solid #FFEDD5",
                color: "#C2410C",
                borderRadius: "6px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <PlusCircle size={12} />
              <span>Seed Đơn Món</span>
            </button>
          )}
          {showRide && (
            <button
              type="button"
              disabled={Boolean(seedingDomain)}
              onClick={() => onSeedSample("ride", "chuyến đi mẫu")}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#EEF2FF",
                border: "1px solid #E0E7FF",
                color: "#4338CA",
                borderRadius: "6px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <PlusCircle size={12} />
              <span>Seed Cuốc Xe</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
