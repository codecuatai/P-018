"use client";

import { useEffect, useState } from "react";
import {
  Car,
  Check,
  Copy,
  HeartPulse,
  Mail,
  MessageSquare,
  Search,
  Shield,
  ShoppingBag,
  Star,
  Utensils,
} from "lucide-react";
import { errorText, getAdminUserFeedback, getAdminUserServices } from "@/lib/api-client";
import type { AdminFeedbackSummary, AdminUserRecord, AdminUserServiceSummary } from "@/types";

export function UserServicesSection({ users }: { users: AdminUserRecord[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userQuery, setUserQuery] = useState("");
  const [userSummary, setUserSummary] = useState<{ loading: boolean; data?: AdminUserServiceSummary; error?: string }>({ loading: false });
  const [userFeedback, setUserFeedback] = useState<{ loading: boolean; data?: AdminFeedbackSummary; error?: string }>({ loading: false });
  const [copiedId, setCopiedId] = useState(false);

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
  const normalizedQuery = userQuery.trim().toLowerCase();
  const filteredUsers = users.filter((user) =>
    [user.full_name, user.email, user.role, user.status].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery),
  );

  const handleCopyId = () => {
    if (!selectedUser) return;
    navigator.clipboard.writeText(selectedUser.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getUserInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
    }
    return email ? email.slice(0, 2).toUpperCase() : "US";
  };

  const services = userSummary.data
    ? [
        { key: "food", name: "Ẩm thực (Food)", icon: <ShoppingBag size={18} />, iconStyle: { background: "#FFF7ED", color: "#EA580C" }, count: userSummary.data.food_count, unit: "đơn hàng đã đặt" },
        { key: "ride", name: "Di chuyển (Ride)", icon: <Car size={18} />, iconStyle: { background: "#ECFDF5", color: "#059669" }, count: userSummary.data.ride_count, unit: "chuyến xe hoàn tất" },
        { key: "restaurant", name: "Đặt bàn (Restaurant)", icon: <Utensils size={18} />, iconStyle: { background: "#FEF3C7", color: "#EA580C" }, count: userSummary.data.restaurant_count, unit: "lượt đặt bàn" },
        { key: "healthcare", name: "Y tế (Healthcare)", icon: <HeartPulse size={18} />, iconStyle: { background: "#EEF2FF", color: "#4F46E5" }, count: userSummary.data.healthcare_count, unit: "lịch khám đã đặt" },
      ]
    : [];

  return (
    <div className="admin-subcontent">
      {/* User selection control */}
      <div className="admin-filter-bar admin-user-picker">
        <label className="admin-field-label" htmlFor="admin-user-search">Tài khoản quản lý</label>
        <div className="admin-search-field">
          <Search size={16} aria-hidden="true" />
          <input
            id="admin-user-search"
            type="search"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Tìm theo tên, email hoặc quyền…"
            aria-label="Tìm kiếm tài khoản"
          />
        </div>
        <div className="admin-select-wrap">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="admin-select"
            aria-label="Chọn tài khoản quản lý"
          >
            {filteredUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name || user.email} ({user.email}) · {user.role.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <span className="admin-filter-count">{filteredUsers.length}/{users.length} tài khoản</span>
      </div>

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
                    fontSize: "var(--text-micro)",
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
          {/* Multi-Service Activity Matrix (read-only) */}
          <div style={{ marginTop: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-navy)", margin: 0 }}>
                Hoạt động 4 Domain dịch vụ
              </h3>
              <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
                Số liệu sử dụng dịch vụ theo tài khoản
              </span>
            </div>

            <div className="admin-service-matrix">
              {services.map((svc) => (
                <div className="admin-service-item" key={svc.key}>
                  <div className="admin-service-item-header">
                    <div className="admin-service-item-icon" style={svc.iconStyle}>
                      {svc.icon}
                    </div>
                  </div>
                  <div>
                    <strong style={{ fontSize: "var(--text-xs)", color: "var(--color-navy)" }}>{svc.name}</strong>
                    <div className="admin-service-item-stat">
                      <strong>{svc.count}</strong>
                      <span>{svc.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
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
                <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, margin: 0, color: "var(--color-navy)" }}>
                  Đánh giá & Phản hồi gần đây của người dùng
                </h3>
              </div>
              <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
                {userFeedback.data?.items.length ?? 0} đánh giá đã ghi nhận
              </span>
            </div>

            {userFeedback.loading ? (
              <div className="admin-loading" style={{ padding: "30px" }}>
                <span className="loading-mark" /> Đang tải lịch sử đánh giá…
              </div>
            ) : userFeedback.error ? (
              <div className="admin-error" style={{ padding: "20px" }}>
                <span>{userFeedback.error}</span>
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
                              fontSize: "var(--text-micro)",
                              textTransform: "uppercase",
                            }}
                          >
                            {fb.domain}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: "#F59E0B", letterSpacing: "1px", fontSize: "var(--text-sm)" }}>
                            {"★".repeat(Math.max(0, Math.min(5, fb.rating)))}
                            {"☆".repeat(Math.max(0, 5 - fb.rating))}
                          </span>{" "}
                          <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>({fb.rating}/5)</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-ink)" }}>
                            {fb.comment || "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted-soft)" }}>
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
