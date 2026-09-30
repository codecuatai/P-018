"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  Store,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { XOneMark } from "@/components/XOneMark";
import { sanitizeDisplayText } from "../provider.types";

interface ProviderHeaderProps {
  isDisconnected: boolean;
  isMaster: boolean;
  partnerTypeLabel: string;
  isOpen: boolean;
  onSetStoreStatus: (status: "online" | "busy" | "offline") => Promise<void>;
  soundEnabled: boolean;
  onToggleSound: () => void;
  businessName?: string;
  partnerStatus?: string;
  userEmail?: string;
  userFullName?: string;
  onLogout: () => Promise<void>;
}

export function ProviderHeader({
  isDisconnected,
  isMaster,
  partnerTypeLabel,
  isOpen,
  onSetStoreStatus,
  soundEnabled,
  onToggleSound,
  businessName,
  userEmail,
  userFullName,
  onLogout,
}: ProviderHeaderProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const displayName = sanitizeDisplayText(
    businessName || userFullName || userEmail?.split("@")[0],
    isDisconnected
      ? "Tài Khoản Đã Ngắt Kết Nối"
      : isMaster
        ? "Đối Tác Dịch Vụ X-One (Chính)"
        : "Đối tác"
  );

  const avatarChar = sanitizeDisplayText(businessName || userFullName || userEmail, "P")[0].toUpperCase();

  return (
    <header className="app-global-header admin-global-header">
      <div className="app-global-header-left">
        <Link className="brand-link header-brand" href="/app/provider">
          <XOneMark size={26} />
          <span>X-One</span>
        </Link>
        <span
          className="admin-badge-header admin-banner-subtitle"
          style={{
            background: isDisconnected ? "#FEF2F2" : isMaster ? "#EEF2FF" : "#ECFDF5",
            borderColor: isDisconnected ? "#FECACA" : isMaster ? "#C7D2FE" : "#A7F3D0",
            color: isDisconnected ? "#DC2626" : isMaster ? "#4338CA" : "#065F46",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: "8px",
            border: "1px solid",
          }}
        >
          <Store size={13} />
          <span>{partnerTypeLabel}</span>
        </span>
      </div>

      <div className="app-global-header-right">
        {/* Real-world Store Status Selector Menu */}
        <div className="provider-status-picker" style={{ position: "relative" }}>
          <button
            type="button"
            className={`provider-status-button ${
              isOpen ? "provider-status-button--online" : "provider-status-button--busy"
            }`}
            onClick={() => setShowStatusMenu((v) => !v)}
            title="Nhấp để đổi trạng thái hoạt động của đối tác"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              borderRadius: "8px",
              background: isOpen ? "#ECFDF5" : "#FFFBEB",
              border: `1px solid ${isOpen ? "#A7F3D0" : "#FDE68A"}`,
              color: isOpen ? "#065F46" : "#B45309",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: isOpen ? "#10B981" : "#F59E0B",
                display: "inline-block",
                boxShadow: isOpen ? "0 0 6px rgba(16, 185, 129, 0.5)" : "none",
              }}
            />
            <span>{isOpen ? "Đang mở cửa nhận đơn" : "Tạm dừng nhận đơn"}</span>
            <ChevronDown size={13} />
          </button>

          {showStatusMenu && (
            <div
              className="provider-status-menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "#FFFFFF",
                borderRadius: "12px",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                border: "1px solid #E2E8F0",
                padding: "8px",
                minWidth: "260px",
                zIndex: 100,
              }}
            >
              <button
                type="button"
                className={`provider-status-option ${isOpen ? "is-selected" : ""}`}
                onClick={() => {
                  setShowStatusMenu(false);
                  void onSetStoreStatus("online");
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: isOpen ? "#F0FDF4" : "transparent",
                  border: "none",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#10B981",
                    marginTop: "4px",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>
                    Mở cửa nhận đơn (Online)
                  </strong>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    Sẵn sàng tiếp nhận cuốc xe, món ăn & lịch hẹn mới
                  </span>
                </div>
              </button>

              <button
                type="button"
                className={`provider-status-option ${!isOpen ? "is-selected" : ""}`}
                onClick={() => {
                  setShowStatusMenu(false);
                  void onSetStoreStatus("busy");
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: !isOpen ? "#FFFBEB" : "transparent",
                  border: "none",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#F59E0B",
                    marginTop: "4px",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>
                    Tạm nghỉ / Bận (Busy)
                  </strong>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    Tạm dừng nhận khách trong giờ cao điểm
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="provider-status-option"
                onClick={() => {
                  setShowStatusMenu(false);
                  void onSetStoreStatus("offline");
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: "transparent",
                  border: "none",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#EF4444",
                    marginTop: "4px",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>
                    Đóng cửa (Offline)
                  </strong>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    Ngắt tiếp nhận toàn bộ dịch vụ trên hệ thống
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Audio Chime Toggle */}
        <button
          type="button"
          className="button button-secondary button-sm"
          onClick={onToggleSound}
          aria-label={soundEnabled ? "Tắt chuông báo đơn mới" : "Bật chuông báo đơn mới"}
          title={
            soundEnabled
              ? "Đang bật chuông báo đơn mới — Nhấp để tắt"
              : "Đang tắt chuông báo — Nhấp để bật"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            height: "32px",
            padding: "0 12px",
            borderRadius: "8px",
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            fontSize: "12px",
            fontWeight: 600,
            color: "#334155",
            cursor: "pointer",
          }}
        >
          {soundEnabled ? (
            <Volume2 size={14} style={{ color: "#059669" }} />
          ) : (
            <VolumeX size={14} style={{ color: "#94A3B8" }} />
          )}
          <span>{soundEnabled ? "Chuông: Bật" : "Chuông: Tắt"}</span>
        </button>

        {/* Customer Portal Link */}
        <Link
          href="/app"
          className="role-switch-link role-badge-customer"
          aria-label="Mở giao diện khách hàng"
          title="Xem giao diện người dùng / khách hàng"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            textDecoration: "none",
            color: "#0F766E",
            background: "#F0FDFA",
            border: "1px solid #CCFBF1",
          }}
        >
          <UserRound size={13} />
          <span>Giao diện Khách hàng</span>
        </Link>

        {/* Profile Card & Logout */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              className="admin-user-avatar"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: isDisconnected ? "#FEE2E2" : isMaster ? "#EEF2FF" : "#ECFDF5",
                color: isDisconnected ? "#DC2626" : isMaster ? "#4338CA" : "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "13px",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              {avatarChar}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#0F172A", lineHeight: 1.2 }}>
                {displayName}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: isDisconnected ? "#DC2626" : isMaster ? "#4338CA" : "#059669",
                  fontWeight: 600,
                }}
              >
                {isDisconnected
                  ? "Đã ngắt kết nối"
                  : isMaster
                    ? "Đối tác Master Hệ thống"
                    : "Đối tác dịch vụ xác thực"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onLogout()}
            className="admin-action-btn admin-action-btn-revoke"
            aria-label="Đăng xuất khỏi tài khoản"
            style={{
              height: "30px",
              padding: "0 10px",
              borderRadius: "7px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "#FEE2E2",
              border: "1px solid #FECACA",
              color: "#DC2626",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
            title="Đăng xuất khỏi tài khoản"
          >
            <LogOut size={13} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
