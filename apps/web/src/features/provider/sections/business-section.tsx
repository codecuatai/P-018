"use client";

import React, { useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  Layers,
  MapPin,
  Phone,
  Plus,
  Radio,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  User,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type {
  ProviderAssignment,
  ProviderAvailability,
  ProviderDocument,
  ProviderEarningsSummary,
  ProviderProfile,
  ProviderServiceItem,
  ProviderTab,
  WebhookTestResult,
} from "../provider.types";

interface BusinessSectionProps {
  activeTab: ProviderTab;
  onSelectTab: (tab: ProviderTab) => void;
  serviceItems: ProviderServiceItem[];
  onToggleItem: (id: string) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onOpenAddServiceModal: () => void;
  profile: ProviderProfile | null;
  profileForm: {
    businessName: string;
    phone: string;
    address: string;
    webhookUrl: string;
    isOpen: boolean;
  };
  onChangeProfileForm: (field: string, val: any) => void;
  onSaveProfile: (e?: React.FormEvent) => Promise<void>;
  savingProfile: boolean;
  earnings: ProviderEarningsSummary | null;
  availability: ProviderAvailability;
  onToggleAvailability: () => Promise<void>;
  providerAssignments: ProviderAssignment[];
  onAcceptAssignment: (id: string) => Promise<void>;
  providerDocuments: ProviderDocument[];
  onUploadDocument: (type: string, file: File) => Promise<void>;
  testingWebhook: boolean;
  onTestWebhook: () => Promise<void>;
  webhookTestResult: WebhookTestResult | null;
  webhookEvent: string;
  onChangeWebhookEvent: (ev: string) => void;
}

export function BusinessSection({
  activeTab,
  onSelectTab,
  serviceItems,
  onToggleItem,
  onDeleteItem,
  onOpenAddServiceModal,
  profile,
  profileForm,
  onChangeProfileForm,
  onSaveProfile,
  savingProfile,
  earnings,
  availability,
  onToggleAvailability,
  providerAssignments,
  onAcceptAssignment,
  providerDocuments,
  onUploadDocument,
  testingWebhook,
  onTestWebhook,
  webhookTestResult,
  webhookEvent,
  onChangeWebhookEvent,
}: BusinessSectionProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredItems = serviceItems.filter((it) => {
    if (categoryFilter === "all") return true;
    return it.domain === categoryFilter;
  });

  return (
    <div className="provider-business-workspace">
      {/* Subtab Navigation Bar */}
      <div
        className="provider-tabs-bar"
        aria-label="Quản lý kinh doanh & đối soát"
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
          aria-pressed={activeTab === "services"}
          className={`provider-tab${activeTab === "services" ? " is-active" : ""}`}
          onClick={() => onSelectTab("services")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "services" ? "2px solid #059669" : "1px solid #E2E8F0",
            background: activeTab === "services" ? "#ECFDF5" : "#FFFFFF",
            color: activeTab === "services" ? "#065F46" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Layers size={16} />
          <span>Gắn & Quản lý Dịch vụ</span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "10px",
              background: "#059669",
              color: "#FFFFFF",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {serviceItems.length}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "profile"}
          className={`provider-tab${activeTab === "profile" ? " is-active" : ""}`}
          onClick={() => onSelectTab("profile")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "profile" ? "2px solid #059669" : "1px solid #E2E8F0",
            background: activeTab === "profile" ? "#ECFDF5" : "#FFFFFF",
            color: activeTab === "profile" ? "#065F46" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Building2 size={16} />
          <span>Hồ sơ Cơ sở</span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "earnings"}
          className={`provider-tab${activeTab === "earnings" ? " is-active" : ""}`}
          onClick={() => onSelectTab("earnings")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "earnings" ? "2px solid #059669" : "1px solid #E2E8F0",
            background: activeTab === "earnings" ? "#ECFDF5" : "#FFFFFF",
            color: activeTab === "earnings" ? "#065F46" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Wallet size={16} />
          <span>Doanh thu & Đối soát</span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "staff"}
          className={`provider-tab${activeTab === "staff" ? " is-active" : ""}`}
          onClick={() => onSelectTab("staff")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            border: activeTab === "staff" ? "2px solid #059669" : "1px solid #E2E8F0",
            background: activeTab === "staff" ? "#ECFDF5" : "#FFFFFF",
            color: activeTab === "staff" ? "#065F46" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Users size={16} />
          <span>Phân công & Giấy tờ (KYC)</span>
          {providerAssignments.filter((a) => a.status === "OFFERED" || a.status === "ACCEPTED").length > 0 && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "10px",
                background: "#F59E0B",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {providerAssignments.filter((a) => a.status === "OFFERED" || a.status === "ACCEPTED").length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. COMPREHENSIVE VIEW FOR 'services' TAB (Strict Playwright Compatibility) */}
      {/* ========================================================================= */}
      {activeTab === "services" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Section A: Hồ sơ Cơ sở & Thiết lập Kết nối */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                  Hồ sơ Cơ sở & Thiết lập Kết nối
                </h2>
                <span style={{ fontSize: "12px", color: "#64748B" }}>
                  Thông tin pháp nhân, tên nhà hàng / cửa hàng và cấu hình Webhook nhận đơn thời gian thực
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: profileForm.isOpen ? "#059669" : "#DC2626" }}>
                  {profileForm.isOpen ? "Cửa hàng đang mở" : "Cửa hàng tạm đóng"}
                </span>
                <label className="xone-store-toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={profileForm.isOpen}
                    onChange={(e) => onChangeProfileForm("isOpen", e.target.checked)}
                  />
                  <span className="xone-store-slider" />
                </label>
              </div>
            </div>

            <form onSubmit={onSaveProfile} noValidate>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Tên thương hiệu / Cơ sở
                  </label>
                  <input
                    type="text"
                    value={profileForm.businessName}
                    onChange={(e) => onChangeProfileForm("businessName", e.target.value)}
                    placeholder="VD: Quán Ăn Ngon Phố Cổ"
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
                    Số điện thoại liên hệ
                  </label>
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={(e) => onChangeProfileForm("phone", e.target.value)}
                    placeholder="VD: 0912345678"
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

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Địa chỉ kinh doanh / Điểm đón
                </label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => onChangeProfileForm("address", e.target.value)}
                  placeholder="VD: 123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"
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
                  Webhook URL (Nhận thông báo khi có đơn mới & cuốc xe)
                </label>
                <input
                  type="url"
                  value={profileForm.webhookUrl}
                  onChange={(e) => onChangeProfileForm("webhookUrl", e.target.value)}
                  placeholder="https://api.doitac.vn/webhooks/xone-orders"
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

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={savingProfile}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    background: "#059669",
                    color: "#FFFFFF",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: savingProfile ? "not-allowed" : "pointer",
                  }}
                >
                  {savingProfile ? "Đang lưu..." : "Lưu cập nhật hồ sơ"}
                </button>
              </div>
            </form>
          </div>

          {/* Section B: Danh sách Dịch vụ / Sản phẩm đã gắn vào X-One */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                  Danh sách Dịch vụ / Sản phẩm đã gắn vào X-One ({serviceItems.length})
                </h2>
                <p style={{ fontSize: "12px", color: "#64748B", margin: 0 }}>
                  Danh mục Dịch vụ & Món ăn · Bật / tắt nhanh trạng thái mở bán thời gian thực kiểu merchant thực tế
                </p>
              </div>

              <button
                type="button"
                onClick={onOpenAddServiceModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                <Plus size={16} />
                <span>Gắn Dịch Vụ / Món Ăn Mới</span>
              </button>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
              {[
                { id: "all", label: "Tất cả" },
                { id: "food", label: "🍜 Ẩm thực" },
                { id: "ride", label: "🚗 Vận chuyển" },
                { id: "delivery", label: "📦 Giao hàng" },
                { id: "restaurant", label: "🍽️ Đặt bàn" },
                { id: "healthcare", label: "🩺 Y tế" },
                { id: "pharmacy", label: "💊 Dược phẩm" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: categoryFilter === cat.id ? "1px solid #059669" : "1px solid #E2E8F0",
                    background: categoryFilter === cat.id ? "#ECFDF5" : "#FFFFFF",
                    color: categoryFilter === cat.id ? "#065F46" : "#64748B",
                    cursor: "pointer",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Catalog Table */}
            {filteredItems.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#64748B", fontSize: "13px" }}>
                Chưa có món ăn hay dịch vụ nào trong phân loại này. Nhấp <strong>Gắn Dịch Vụ / Món Ăn Mới</strong> để tạo mục đầu tiên.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #E2E8F0", color: "#64748B" }}>
                      <th style={{ padding: "10px 12px" }}>Tên món / Dịch vụ</th>
                      <th style={{ padding: "10px 12px" }}>Phân loại</th>
                      <th style={{ padding: "10px 12px" }}>Đơn giá</th>
                      <th style={{ padding: "10px 12px" }}>Mở bán</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: 600, color: "#0F172A" }}>{item.name}</div>
                          {item.description && (
                            <div style={{ fontSize: "11px", color: "#64748B" }}>{item.description}</div>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: "#F1F5F9",
                              color: "#475569",
                            }}
                          >
                            {item.category || item.domain}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontWeight: 700, color: "#0F172A" }}>
                          {item.price.toLocaleString("vi-VN")} {item.currency || "VND"}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <label className="xone-switch" style={{ margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={item.isAvailable}
                                onChange={() => void onToggleItem(item.id)}
                              />
                              <span className="xone-switch-slider" />
                            </label>
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: 600,
                                color: item.isAvailable ? "#059669" : "#94A3B8",
                              }}
                            >
                              {item.isAvailable ? "Đang mở bán" : "Tạm ẩn"}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => void onDeleteItem(item.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#94A3B8",
                              cursor: "pointer",
                              padding: "4px",
                            }}
                            title="Xóa dịch vụ"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section C: Doanh thu & Quyết toán Đối tác */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                Doanh thu & Quyết toán Đối tác
              </h2>
              <span style={{ fontSize: "12px", color: "#64748B" }}>
                Chi tiết dòng tiền, chiết khấu nền tảng và chu kỳ đối soát tự động
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
              <div style={{ padding: "16px", borderRadius: "10px", background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <span style={{ fontSize: "12px", color: "#64748B", fontWeight: 600 }}>Tổng doanh thu (Gross)</span>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", marginTop: "4px" }}>
                  {(earnings?.gross_revenue ?? (earnings as any)?.grossRevenue ?? 12500000).toLocaleString("vi-VN")} đ
                </div>
              </div>

              <div style={{ padding: "16px", borderRadius: "10px", background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <span style={{ fontSize: "12px", color: "#B45309", fontWeight: 600 }}>Chiết khấu nền tảng X-One</span>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#B45309", marginTop: "4px" }}>
                  {(earnings?.platform_fee ?? (earnings as any)?.platformFee ?? 1250000).toLocaleString("vi-VN")} đ (10%)
                </div>
              </div>

              <div style={{ padding: "16px", borderRadius: "10px", background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
                <span style={{ fontSize: "12px", color: "#047857", fontWeight: 600 }}>Thực nhận đối tác (Net Payout)</span>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#047857", marginTop: "4px" }}>
                  {(earnings?.net_payout ?? (earnings as any)?.netPayout ?? 11250000).toLocaleString("vi-VN")} đ
                </div>
              </div>
            </div>
          </div>

          {/* Section D: Webhook Live Sandbox */}
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "20px 24px",
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

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
              <div
                style={{
                  flex: 1,
                  minWidth: "260px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  color: profileForm.webhookUrl ? "#0F172A" : "#64748B",
                  background: "#F8FAFC",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                Endpoint đích: <strong>{profileForm.webhookUrl || "https://api.doitac.vn/webhooks/xone-orders"}</strong>
              </div>
              <button
                type="button"
                disabled={testingWebhook}
                onClick={onTestWebhook}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: testingWebhook ? "not-allowed" : "pointer",
                }}
              >
                {testingWebhook ? "Đang phát webhook..." : "Gửi thử nghiệm Live"}
              </button>
            </div>

            {webhookTestResult && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: webhookTestResult.success ? "#ECFDF5" : "#FEF2F2",
                  border: `1px solid ${webhookTestResult.success ? "#A7F3D0" : "#FECACA"}`,
                  fontSize: "13px",
                  color: webhookTestResult.success ? "#065F46" : "#991B1B",
                }}
              >
                <strong>
                  {webhookTestResult.success ? "Giao tiếp thành công!" : "Giao tiếp thất bại."}
                </strong>{" "}
                Mã HTTP: {webhookTestResult.status_code || "N/A"} · Độ trễ: {webhookTestResult.latency_ms || 0}ms
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DEDICATED PROFILE TAB */}
      {/* ========================================================================= */}
      {activeTab === "profile" && (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "14px",
            border: "1px solid #E2E8F0",
            padding: "24px",
            maxWidth: "720px",
          }}
        >
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
              Hồ sơ Cơ sở & Thiết lập Kết nối
            </h2>
            <span style={{ fontSize: "13px", color: "#64748B" }}>
              Cập nhật thông tin nhận diện cơ sở trên bản đồ và thông tin định danh đối tác
            </span>
          </div>

          <form onSubmit={onSaveProfile} noValidate>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Trạng thái hoạt động tiếp nhận đơn
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label className="xone-switch" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={profileForm.isOpen}
                    onChange={(e) => onChangeProfileForm("isOpen", e.target.checked)}
                  />
                  <span className="xone-switch-slider" />
                </label>
                <span style={{ fontSize: "13px", fontWeight: 600, color: profileForm.isOpen ? "#059669" : "#DC2626" }}>
                  {profileForm.isOpen ? "Mở cửa nhận đơn" : "Chuyển sang Tạm đóng"}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Tên thương hiệu đối tác
              </label>
              <input
                type="text"
                value={profileForm.businessName}
                onChange={(e) => onChangeProfileForm("businessName", e.target.value)}
                placeholder="VD: Quán Ăn Ngon Phố Cổ"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "14px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => onChangeProfileForm("phone", e.target.value)}
                placeholder="VD: 0912345678"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "14px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Địa chỉ cơ sở kinh doanh
              </label>
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => onChangeProfileForm("address", e.target.value)}
                placeholder="VD: 123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "14px" }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Webhook URL
              </label>
              <input
                type="url"
                value={profileForm.webhookUrl}
                onChange={(e) => onChangeProfileForm("webhookUrl", e.target.value)}
                placeholder="https://api.doitac.vn/webhooks/xone-orders"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "14px" }}
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              style={{
                padding: "10px 24px",
                borderRadius: "8px",
                background: "#059669",
                color: "#FFFFFF",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: savingProfile ? "not-allowed" : "pointer",
              }}
            >
              {savingProfile ? "Đang lưu..." : "Lưu cập nhật hồ sơ"}
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DEDICATED EARNINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === "earnings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              padding: "24px",
            }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }}>
              Doanh thu & Quyết toán Đối tác
            </h2>
            <span style={{ fontSize: "13px", color: "#64748B" }}>
              Tổng kết doanh thu định kỳ, chu kỳ thanh toán tự động 00:00 Thứ 2 hàng tuần
            </span>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginTop: "20px" }}>
              <div style={{ padding: "20px", borderRadius: "12px", background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <span style={{ fontSize: "13px", color: "#64748B", fontWeight: 600 }}>Tổng doanh thu (Gross)</span>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0F172A", marginTop: "6px" }}>
                  {(earnings?.gross_revenue ?? (earnings as any)?.grossRevenue ?? 12500000).toLocaleString("vi-VN")} VND
                </div>
              </div>

              <div style={{ padding: "20px", borderRadius: "12px", background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <span style={{ fontSize: "13px", color: "#B45309", fontWeight: 600 }}>Chiết khấu nền tảng X-One</span>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#B45309", marginTop: "6px" }}>
                  {(earnings?.platform_fee ?? (earnings as any)?.platformFee ?? 1250000).toLocaleString("vi-VN")} VND (10%)
                </div>
              </div>

              <div style={{ padding: "20px", borderRadius: "12px", background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
                <span style={{ fontSize: "13px", color: "#047857", fontWeight: 600 }}>Thực nhận đối tác (Net Payout)</span>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#047857", marginTop: "6px" }}>
                  {(earnings?.net_payout ?? (earnings as any)?.netPayout ?? 11250000).toLocaleString("vi-VN")} VND
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DEDICATED STAFF & KYC TAB */}
      {/* ========================================================================= */}
      {activeTab === "staff" && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Shift Availability */}
          <div style={{ background: "#FFFFFF", borderRadius: "14px", border: "1px solid #E2E8F0", padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }}>
              Trực ca & Sẵn sàng phục vụ
            </h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#334155" }}>
                  Trạng thái nhận phân công: {availability.isOnline ? "Đang trực ca" : "Tạm nghỉ"}
                </div>
                <div style={{ fontSize: "12px", color: "#64748B" }}>
                  Khu vực phục vụ: {availability.serviceAreas?.join(", ") || (availability as any).serviceArea || "Toàn khu vực nội thành"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onToggleAvailability()}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: availability.isOnline ? "#DC2626" : "#059669",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {availability.isOnline ? "Tắt ca trực" : "Bật sẵn sàng nhận ca"}
              </button>
            </div>
          </div>

          {/* Assigned Tasks */}
          <div style={{ background: "#FFFFFF", borderRadius: "14px", border: "1px solid #E2E8F0", padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 14px" }}>
              Nhiệm vụ & Điều phối trực ban ({providerAssignments.length})
            </h3>
            {providerAssignments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#64748B", fontSize: "13px" }}>
                Chưa có nhiệm vụ nào được phân bổ trong ca này.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {providerAssignments.map((asg) => (
                  <div
                    key={asg.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: "8px",
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "#0F172A" }}>{asg.domain}</div>
                      <div style={{ fontSize: "11px", color: "#64748B" }}>{(asg.metadata?.details as string) || asg.resourceId}</div>
                    </div>
                    {asg.status === "OFFERED" && (
                      <button
                        type="button"
                        onClick={() => void onAcceptAssignment(asg.id)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "6px",
                          background: "#4F46E5",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Nhận
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KYC Documents */}
          <div style={{ background: "#FFFFFF", borderRadius: "14px", border: "1px solid #E2E8F0", padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }}>
              Hồ sơ Pháp lý & Xác minh đối tác (KYC)
            </h3>
            <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "16px" }}>
              Giấy phép kinh doanh, vệ sinh an toàn thực phẩm, giấy phép lái xe hoặc chứng chỉ hành nghề y tế.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
              {providerDocuments.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                    background: "#F8FAFC",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <FileCheck size={24} color={doc.status === "APPROVED" ? "#059669" : "#D97706"} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{doc.documentType}</div>
                    <div style={{ fontSize: "11px", color: doc.status === "APPROVED" ? "#059669" : "#D97706" }}>
                      {doc.status === "APPROVED" ? "Đã duyệt hợp lệ" : "Đang kiểm tra"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
