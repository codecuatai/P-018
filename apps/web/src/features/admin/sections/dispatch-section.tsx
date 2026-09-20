"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Car,
  CheckCircle2,
  Clock3,
  Filter,
  Plus,
  RefreshCw,
  ShoppingBag,
  Stethoscope,
  Store,
  Utensils,
  Workflow,
  X,
} from "lucide-react";

import {
  createOperationsAssignment,
  errorText,
  getOperationsAssignments,
  updateOperationsAssignment,
  type OperationsAssignment,
  type ProviderAssignment,
} from "@/lib/api-client";

export function DispatchSection() {
  const [items, setItems] = useState<OperationsAssignment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [filterDomain, setFilterDomain] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterProviderId, setFilterProviderId] = useState<string>("");

  // Create Assignment Modal / Collapsible Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    providerId: "",
    domain: "food",
    resourceId: "",
    dueAt: "",
  });
  const [creating, setCreating] = useState(false);

  const loadAssignments = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await getOperationsAssignments({
        domain: filterDomain || undefined,
        status: (filterStatus || undefined) as ProviderAssignment["status"] | undefined,
        providerId: filterProviderId.trim() || undefined,
      });
      setItems(res.items);
      setTotalCount(res.count);
      setOverdueCount(res.overdue);
    } catch (err) {
      setError(errorText(err) || "Không thể tải danh sách điều phối & phân công.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, [filterDomain, filterStatus]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.providerId.trim() || !createForm.resourceId.trim()) {
      setActionMessage({ type: "error", text: "Vui lòng nhập đầy đủ Provider ID và Resource ID." });
      return;
    }

    setCreating(true);
    setActionMessage(null);
    try {
      await createOperationsAssignment({
        provider_id: createForm.providerId.trim(),
        domain: createForm.domain,
        resource_id: createForm.resourceId.trim(),
        ...(createForm.dueAt ? { due_at: new Date(createForm.dueAt).toISOString() } : {}),
      });
      setActionMessage({ type: "success", text: "Đã tạo phân công mới thành công và chuyển vào hàng đợi." });
      setCreateForm({ providerId: "", domain: "food", resourceId: "", dueAt: "" });
      setShowCreateForm(false);
      await loadAssignments(true);
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) || "Không thể tạo phân công mới." });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: ProviderAssignment["status"]) => {
    setActionMessage(null);
    try {
      const updated = await updateOperationsAssignment(id, { status });
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setActionMessage({ type: "success", text: `Đã cập nhật trạng thái phân công thành: ${status}` });
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) || "Không thể cập nhật trạng thái." });
    }
  };

  const activeCount = useMemo(() => {
    return items.filter((i) => i.status === "OFFERED" || i.status === "ACCEPTED" || i.status === "IN_PROGRESS").length;
  }, [items]);

  const completedCount = useMemo(() => {
    return items.filter((i) => i.status === "COMPLETED").length;
  }, [items]);

  const getDomainIcon = (domain?: string) => {
    if (!domain) return <Workflow size={13} />;
    switch (domain.toLowerCase()) {
      case "ride":
        return <Car size={13} />;
      case "food":
        return <Utensils size={13} />;
      case "delivery":
        return <ShoppingBag size={13} />;
      case "restaurant":
        return <Store size={13} />;
      case "healthcare":
        return <Stethoscope size={13} />;
      default:
        return <Workflow size={13} />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "OFFERED":
      case "ACCEPTED":
        return "badge-status-offered";
      case "IN_PROGRESS":
        return "badge-status-progress";
      case "COMPLETED":
        return "badge-status-completed";
      case "CANCELLED":
      case "REJECTED":
        return "badge-status-cancelled";
      default:
        return "";
    }
  };

  return (
    <div className="admin-subcontent">
      {/* Metrics Row */}
      <div className="admin-metric-grid">
        <article className="admin-metric">
          <span className="admin-metric-icon">
            <Workflow size={17} />
          </span>
          <span>Tổng phân công</span>
          <strong>{totalCount}</strong>
        </article>

        <article className="admin-metric">
          <span className="admin-metric-icon">
            <Activity size={17} />
          </span>
          <span>Đang thực hiện</span>
          <strong style={{ color: "#2563EB" }}>{activeCount}</strong>
        </article>

        <article className="admin-metric">
          <span className="admin-metric-icon" style={{ color: overdueCount > 0 ? "#DC2626" : undefined }}>
            <AlertTriangle size={17} />
          </span>
          <span>Quá hạn SLA</span>
          <strong style={{ color: overdueCount > 0 ? "#DC2626" : undefined }}>
            {overdueCount}
          </strong>
        </article>

        <article className="admin-metric">
          <span className="admin-metric-icon" style={{ color: "#16A34A" }}>
            <CheckCircle2 size={17} />
          </span>
          <span>Đã hoàn tất</span>
          <strong style={{ color: "#16A34A" }}>{completedCount}</strong>
        </article>
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div
          className={`admin-alert ${actionMessage.type === "success" ? "admin-alert-success" : "admin-alert-error"}`}
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            borderRadius: "8px",
            background: actionMessage.type === "success" ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${actionMessage.type === "success" ? "#BBF7D0" : "#FECACA"}`,
            color: actionMessage.type === "success" ? "#166534" : "#991B1B",
            fontSize: "var(--text-xs)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter & Action Toolbar */}
      <div
        className="admin-filter-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <label className="admin-filter-item">
            <span>Domain:</span>
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className="admin-select"
            >
              <option value="">Tất cả domain</option>
              <option value="food">Giao đồ ăn (Food)</option>
              <option value="ride">Gọi xe (Ride)</option>
              <option value="delivery">Giao hàng (Delivery)</option>
              <option value="restaurant">Đặt bàn (Restaurant)</option>
              <option value="healthcare">Y tế (Healthcare)</option>
            </select>
          </label>

          <label className="admin-filter-item">
            <span>Trạng thái:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="admin-select"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="OFFERED">Chờ nhận (OFFERED)</option>
              <option value="ACCEPTED">Đã nhận (ACCEPTED)</option>
              <option value="IN_PROGRESS">Đang thực hiện (IN_PROGRESS)</option>
              <option value="COMPLETED">Hoàn tất (COMPLETED)</option>
              <option value="CANCELLED">Đã hủy (CANCELLED)</option>
            </select>
          </label>

          <label className="admin-filter-item">
            <span>Provider ID:</span>
            <input
              type="text"
              placeholder="Nhập mã provider..."
              value={filterProviderId}
              onChange={(e) => setFilterProviderId(e.target.value)}
              className="admin-input"
              style={{ width: "160px" }}
            />
          </label>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadAssignments()}
          >
            <Filter size={14} /> Lọc
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="button button-primary"
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Plus size={14} /> {showCreateForm ? "Đóng form" : "Phân công mới"}
          </button>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadAssignments(true)}
            disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : undefined} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Collapsible Assignment Creation Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateAssignment}
          className="admin-card"
          style={{
            marginTop: "14px",
            padding: "16px",
            background: "#F8FAFC",
            border: "1px solid #CBD5E1",
            borderRadius: "10px",
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <h4 style={{ margin: "0 0 4px", fontSize: "var(--text-sm)", fontWeight: 700, color: "#0F172A" }}>
              Tạo lệnh điều phối & phân công đối tác
            </h4>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "#64748B" }}>
              Gán thủ công đối tác cho đơn hàng hoặc dịch vụ khi hệ thống tự động không tìm được nguồn cung.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Domain dịch vụ:
              </label>
              <select
                value={createForm.domain}
                onChange={(e) => setCreateForm((f) => ({ ...f, domain: e.target.value }))}
                className="admin-select"
                style={{ width: "100%" }}
              >
                <option value="food">Food (Giao đồ ăn)</option>
                <option value="ride">Ride (Gọi xe)</option>
                <option value="delivery">Delivery (Giao hàng)</option>
                <option value="restaurant">Restaurant (Nhà hàng)</option>
                <option value="healthcare">Healthcare (Y tế)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Provider ID (Tài xế / Đối tác):
              </label>
              <input
                type="text"
                required
                placeholder="VD: prv_001 hoặc usr_driver..."
                value={createForm.providerId}
                onChange={(e) => setCreateForm((f) => ({ ...f, providerId: e.target.value }))}
                className="admin-input"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Mã đơn hàng / Resource ID:
              </label>
              <input
                type="text"
                required
                placeholder="VD: ord_food_123 hoặc ride_456..."
                value={createForm.resourceId}
                onChange={(e) => setCreateForm((f) => ({ ...f, resourceId: e.target.value }))}
                className="admin-input"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Hạn hoàn thành SLA:
              </label>
              <input
                type="datetime-local"
                value={createForm.dueAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, dueAt: e.target.value }))}
                className="admin-input"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowCreateForm(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={creating}
            >
              {creating ? "Đang gán..." : "Xác nhận phân công"}
            </button>
          </div>
        </form>
      )}

      {/* Assignments Table Card */}
      <div className="admin-card" style={{ marginTop: "14px" }}>
        <div className="admin-card-title">
          <h3>Danh sách điều phối & phân công</h3>
          <span>Tổng số: {totalCount}</span>
        </div>

        {loading ? (
          <div className="admin-loading">
            <span className="loading-mark" />
            Đang tải dữ liệu điều phối…
          </div>
        ) : error ? (
          <div className="admin-error">
            <span>{error}</span>
            <button type="button" className="button button-sm button-secondary" onClick={() => void loadAssignments()}>
              Thử lại
            </button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "#64748B", fontSize: "var(--text-xs)" }}>
            Chưa có lệnh phân công nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mã Assignment</th>
                  <th>Domain</th>
                  <th>Mã đơn / Resource ID</th>
                  <th>Provider ID</th>
                  <th>Người phân công</th>
                  <th>Thời hạn SLA</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const providerId = item.providerId || (item as any).provider_id;
                  const resourceId = item.resourceId || (item as any).resource_id;
                  const dueAt = item.dueAt || (item as any).due_at;
                  const assignedBy = item.assignedBy || (item as any).assigned_by;
                  const isOverdue =
                    dueAt &&
                    new Date(dueAt).getTime() < Date.now() &&
                    (item.status === "OFFERED" || item.status === "ACCEPTED" || item.status === "IN_PROGRESS" || (item.status as any) === "ASSIGNED");

                  return (
                    <tr key={item.id}>
                      <td>
                        <code style={{ fontSize: "11px", fontWeight: 700, color: "#1E293B" }}>
                          {item.id}
                        </code>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "#F1F5F9",
                            fontSize: "11px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          {getDomainIcon(item.domain)}
                          {item.domain}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "#0F172A" }}>
                          {resourceId}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: "11px", color: "#475569" }}>{providerId}</code>
                      </td>
                      <td>
                        <span style={{ fontSize: "11px", color: "#64748B" }}>
                          {assignedBy || "Tự động"}
                        </span>
                      </td>
                      <td>
                        {dueAt ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <Clock3 size={12} color={isOverdue ? "#DC2626" : "#64748B"} />
                            <span style={{ fontSize: "11px", color: isOverdue ? "#DC2626" : "#334155", fontWeight: isOverdue ? 700 : 400 }}>
                              {new Date(dueAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                              {new Date(dueAt).toLocaleDateString("vi-VN")}
                            </span>
                            {isOverdue && (
                              <span
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 800,
                                  background: "#FEE2E2",
                                  color: "#991B1B",
                                  padding: "2px 5px",
                                  borderRadius: "4px",
                                }}
                              >
                                QUÁ SLA
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>Không giới hạn</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-end" }}>
                          {(item.status === "OFFERED" || item.status === "ACCEPTED") && (
                            <button
                              type="button"
                              className="button button-sm button-secondary"
                              onClick={() => void handleUpdateStatus(item.id, "IN_PROGRESS")}
                              title="Bắt đầu thực hiện"
                            >
                              Bắt đầu
                            </button>
                          )}
                          {item.status === "IN_PROGRESS" && (
                            <button
                              type="button"
                              className="button button-sm button-primary"
                              onClick={() => void handleUpdateStatus(item.id, "COMPLETED")}
                              title="Đánh dấu hoàn thành"
                            >
                              Hoàn tất
                            </button>
                          )}
                          {item.status !== "COMPLETED" && item.status !== "CANCELLED" && item.status !== "REJECTED" && (
                            <button
                              type="button"
                              className="button button-sm button-secondary"
                              onClick={() => void handleUpdateStatus(item.id, "CANCELLED")}
                              title="Hủy lệnh phân công"
                              style={{ color: "#DC2626" }}
                            >
                              Hủy
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export const OperationsDispatchSubtab = DispatchSection;
