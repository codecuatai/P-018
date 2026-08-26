"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Car,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  HeartPulse,
  Mail,
  MessageSquare,
  Search,
  Shield,
  ShoppingBag,
  Star,
  ToggleLeft,
  ToggleRight,
  User,
  Utensils,
} from "lucide-react";
import { errorText, getAdminUserFeedback, getAdminUserServices } from "@/lib/api-client";
import type { AdminFeedbackSummary, AdminUserRecord, AdminUserServiceSummary } from "@/types";

export function UserServicesSection({ users }: { users: AdminUserRecord[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userSummary, setUserSummary] = useState<{ loading: boolean; data?: AdminUserServiceSummary; error?: string }>({ loading: false });
  const [userFeedback, setUserFeedback] = useState<{ loading: boolean; data?: AdminFeedbackSummary; error?: string }>({ loading: false });
  const [copiedId, setCopiedId] = useState(false);
  const [servicePermissions, setServicePermissions] = useState<Record<string, boolean>>({
    food: true,
    ride: true,
    restaurant: true,
    healthcare: true,
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    let isCancelled = false;

    setUserSummary({ loading: true });
    setUserFeedback({ loading: true });

    Promise.allSettled([
      getAdminUserServices(selectedUserId),
      getAdminUserFeedback(selectedUserId, 1, 10),
    ]).then(([summaryRes, feedbackRes]) => {
      if (isCancelled) return;
      if (summaryRes.status === "fulfilled") {
        setUserSummary({ loading: false, data: summaryRes.value });
      } else {
        setUserSummary({ loading: false, error: errorText(summaryRes.reason) });
      }
      if (feedbackRes.status === "fulfilled") {
        setUserFeedback({ loading: false, data: feedbackRes.value });
      } else {
        setUserFeedback({ loading: false, error: errorText(feedbackRes.reason) });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedUserId]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleCopyId = () => {
    if (!selectedUser) return;
    navigator.clipboard.writeText(selectedUser.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const toggleService = (domainKey: string, domainName: string) => {
    const nextState = !servicePermissions[domainKey];
    setServicePermissions((prev) => ({ ...prev, [domainKey]: nextState }));
    setToastMessage(
      `Đã ${nextState ? "kích hoạt" : "tạm dừng"} dịch vụ ${domainName} cho tài khoản ${selectedUser?.email || "này"}.`
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  const getUserInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
    }
    return email ? email.slice(0, 2).toUpperCase() : "US";
  };

  return (
    <div className="admin-subcontent">
      {/* User selection control */}
      <div className="admin-filter-bar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--color-navy)", whiteSpace: "nowrap" }}>
            Tài khoản quản lý:
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="admin-select"
            style={{ width: "100%", maxWidth: "420px" }}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name || user.email} ({user.email}) · {user.role.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            margin: "0.75rem 0",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            color: "#065F46",
            borderRadius: "8px",
            fontSize: "0.74rem",
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {selectedUser && (
        <div className="admin-user-card">
          <div className="admin-user-card-info">
            <div className="admin-user-avatar">
              {getUserInitials(selectedUser.full_name, selectedUser.email)}
            </div>
            <div className="admin-user-meta">
              <div className="admin-user-meta-top">
                <span className="admin-user-meta-name">
                  {selectedUser.full_name || "Chưa đặt tên"}
                </span>
                <span
                  className="admin-badge"
                  style={{
                    fontSize: "0.65rem",
                    background: selectedUser.role === "admin" ? "#FEF3C7" : "#F1F5F9",
                    color: selectedUser.role === "admin" ? "#92400E" : "#475569",
                    border: selectedUser.role === "admin" ? "1px solid #FDE68A" : "1px solid #E2E8F0",
                  }}
                >
                  <Shield size={11} style={{ marginRight: "3px" }} />
                  {selectedUser.role.toUpperCase()}
                </span>
                <span className={`admin-badge status-${selectedUser.status === "active" ? "healthy" : "unavailable"}`}>
                  <span className={`admin-status-dot status-${selectedUser.status === "active" ? "healthy" : "unavailable"}`} />
                  {selectedUser.status === "active" ? "Đang hoạt động" : "Đã khóa"}
                </span>
              </div>
              <div className="admin-user-meta-sub">
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Mail size={13} /> {selectedUser.email}
                </span>
                <span>•</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  ID: <code className="admin-code-pill">{selectedUser.id}</code>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-muted)" }}
                    title="Sao chép ID"
                  >
                    {copiedId ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {userSummary.loading ? (
        <div className="admin-card admin-loading">
          <span className="loading-mark" /> Đang tải dữ liệu đa dịch vụ của tài khoản…
        </div>
      ) : userSummary.error ? (
        <div className="admin-card admin-error">
          <span>{userSummary.error}</span>
        </div>
      ) : userSummary.data ? (
        <>
          {/* Multi-Service Operations Matrix */}
          <div style={{ marginTop: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-navy)", margin: 0 }}>
                Phân quyền & Hoạt động 4 Domain dịch vụ
              </h3>
              <span style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>
                Quản lý bật/tắt quyền truy cập từng dịch vụ theo tài khoản
              </span>
            </div>

            <div className="admin-service-matrix">
              {/* Food */}
              <div className="admin-service-item">
                <div className="admin-service-item-header">
                  <div className="admin-service-item-icon" style={{ background: "#FFF7ED", color: "#EA580C" }}>
                    <ShoppingBag size={18} />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleService("food", "Ẩm thực (Food)")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: servicePermissions.food ? "#059669" : "#94A3B8" }}
                    title={servicePermissions.food ? "Nhấn để tạm dừng dịch vụ" : "Nhấn để kích hoạt dịch vụ"}
                  >
                    {servicePermissions.food ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
                <div>
                  <strong style={{ fontSize: "0.78rem", color: "var(--color-navy)" }}>Ẩm thực (Food)</strong>
                  <div className="admin-service-item-stat">
                    <strong>{userSummary.data.food_count}</strong>
                    <span>đơn hàng đã đặt</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span
                    className={`admin-badge status-${servicePermissions.food ? "healthy" : "unavailable"}`}
                    style={{ fontSize: "0.64rem" }}
                  >
                    {servicePermissions.food ? "Quyền kích hoạt" : "Đã tạm dừng"}
                  </span>
                  <a
                    href="#transactions"
                    style={{ fontSize: "0.68rem", color: "var(--color-brand, #3B82F6)", textDecoration: "none", display: "flex", alignItems: "center", gap: "2px" }}
                  >
                    Xem lịch sử <ExternalLink size={10} />
                  </a>
                </div>
              </div>

              {/* Ride */}
              <div className="admin-service-item">
                <div className="admin-service-item-header">
                  <div className="admin-service-item-icon" style={{ background: "#ECFDF5", color: "#059669" }}>
                    <Car size={18} />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleService("ride", "Di chuyển (Ride)")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: servicePermissions.ride ? "#059669" : "#94A3B8" }}
                    title={servicePermissions.ride ? "Nhấn để tạm dừng dịch vụ" : "Nhấn để kích hoạt dịch vụ"}
                  >
                    {servicePermissions.ride ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
                <div>
                  <strong style={{ fontSize: "0.78rem", color: "var(--color-navy)" }}>Di chuyển (Ride)</strong>
                  <div className="admin-service-item-stat">
                    <strong>{userSummary.data.ride_count}</strong>
                    <span>chuyến xe hoàn tất</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span
                    className={`admin-badge status-${servicePermissions.ride ? "healthy" : "unavailable"}`}
                    style={{ fontSize: "0.64rem" }}
                  >
                    {servicePermissions.ride ? "Quyền kích hoạt" : "Đã tạm dừng"}
                  </span>
                  <a
                    href="#transactions"
                    style={{ fontSize: "0.68rem", color: "var(--color-brand, #3B82F6)", textDecoration: "none", display: "flex", alignItems: "center", gap: "2px" }}
                  >
                    Xem lịch sử <ExternalLink size={10} />
                  </a>
                </div>
              </div>

              {/* Restaurant */}
              <div className="admin-service-item">
                <div className="admin-service-item-header">
                  <div className="admin-service-item-icon" style={{ background: "#FEF3C7", color: "#D97706" }}>
                    <Utensils size={18} />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleService("restaurant", "Đặt bàn (Restaurant)")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: servicePermissions.restaurant ? "#059669" : "#94A3B8" }}
                    title={servicePermissions.restaurant ? "Nhấn để tạm dừng dịch vụ" : "Nhấn để kích hoạt dịch vụ"}
                  >
                    {servicePermissions.restaurant ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
                <div>
                  <strong style={{ fontSize: "0.78rem", color: "var(--color-navy)" }}>Đặt bàn (Restaurant)</strong>
                  <div className="admin-service-item-stat">
                    <strong>{userSummary.data.restaurant_count}</strong>
                    <span>lượt đặt bàn</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span
                    className={`admin-badge status-${servicePermissions.restaurant ? "healthy" : "unavailable"}`}
                    style={{ fontSize: "0.64rem" }}
                  >
                    {servicePermissions.restaurant ? "Quyền kích hoạt" : "Đã tạm dừng"}
                  </span>
                  <a
                    href="#transactions"
                    style={{ fontSize: "0.68rem", color: "var(--color-brand, #3B82F6)", textDecoration: "none", display: "flex", alignItems: "center", gap: "2px" }}
                  >
                    Xem lịch sử <ExternalLink size={10} />
                  </a>
                </div>
              </div>

              {/* Healthcare */}
              <div className="admin-service-item">
                <div className="admin-service-item-header">
                  <div className="admin-service-item-icon" style={{ background: "#EFF6FF", color: "#2563EB" }}>
                    <HeartPulse size={18} />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleService("healthcare", "Y tế (Healthcare)")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: servicePermissions.healthcare ? "#059669" : "#94A3B8" }}
                    title={servicePermissions.healthcare ? "Nhấn để tạm dừng dịch vụ" : "Nhấn để kích hoạt dịch vụ"}
                  >
                    {servicePermissions.healthcare ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
                <div>
                  <strong style={{ fontSize: "0.78rem", color: "var(--color-navy)" }}>Y tế (Healthcare)</strong>
                  <div className="admin-service-item-stat">
                    <strong>{userSummary.data.healthcare_count}</strong>
                    <span>lịch khám đã đặt</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span
                    className={`admin-badge status-${servicePermissions.healthcare ? "healthy" : "unavailable"}`}
                    style={{ fontSize: "0.64rem" }}
                  >
                    {servicePermissions.healthcare ? "Quyền kích hoạt" : "Đã tạm dừng"}
                  </span>
                  <a
                    href="#transactions"
                    style={{ fontSize: "0.68rem", color: "var(--color-brand, #3B82F6)", textDecoration: "none", display: "flex", alignItems: "center", gap: "2px" }}
                  >
                    Xem lịch sử <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* User Feedback & Reviews Section */}
          <div className="admin-card" style={{ marginTop: "16px", padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                borderBottom: "1px solid #E7EDF1",
                background: "#FAFCFD",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MessageSquare size={16} color="var(--color-navy)" />
                <h3 style={{ fontSize: "0.82rem", fontWeight: 700, margin: 0, color: "var(--color-navy)" }}>
                  Đánh giá & Phản hồi gần đây của người dùng
                </h3>
              </div>
              <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>
                {userFeedback.data?.items.length ?? 0} đánh giá đã ghi nhận
              </span>
            </div>

            {userFeedback.loading ? (
              <div className="admin-loading" style={{ padding: "30px" }}>
                <span className="loading-mark" /> Đang tải lịch sử đánh giá…
              </div>
            ) : userFeedback.data?.items && userFeedback.data.items.length > 0 ? (
              <div className="admin-table-wrap" style={{ border: "none", borderRadius: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }}>Domain</th>
                      <th style={{ width: "130px" }}>Đánh giá sao</th>
                      <th>Nội dung nhận xét</th>
                      <th style={{ width: "160px", textAlign: "right" }}>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userFeedback.data.items.map((fb) => (
                      <tr key={fb.id}>
                        <td>
                          <span
                            className="admin-badge"
                            style={{
                              fontWeight: 700,
                              fontSize: "0.68rem",
                              textTransform: "uppercase",
                            }}
                          >
                            {fb.domain}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: "#F59E0B", letterSpacing: "1px", fontSize: "0.85rem" }}>
                            {"★".repeat(fb.rating)}
                            {"☆".repeat(Math.max(0, 5 - fb.rating))}
                          </span>{" "}
                          <span style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>({fb.rating}/5)</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.74rem", color: "var(--color-ink)" }}>
                            {fb.comment || "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "0.7rem", color: "var(--color-muted-soft)" }}>
                            {new Date(fb.created_at).toLocaleString("vi-VN")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-panel" style={{ margin: "16px" }}>
                <div className="admin-empty-panel-icon">
                  <Star size={22} color="#F59E0B" />
                </div>
                <h4>Chưa có đánh giá nào</h4>
                <p>Người dùng này chưa để lại nhận xét hoặc chấm điểm cho dịch vụ nào trong hệ thống.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="admin-card admin-empty">Vui lòng chọn tài khoản để xem chi tiết.</div>
      )}
    </div>
  );
}
