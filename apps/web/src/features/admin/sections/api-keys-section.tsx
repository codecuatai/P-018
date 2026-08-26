"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import {
  errorText,
  getAdminApiKeys,
  postAdminApiKey,
  revokeAdminApiKey,
  rotateAdminApiKey,
  testAdminApiKey,
} from "@/lib/api-client";
import type { AdminApiKeyRecord } from "@/types";

const DEFAULT_GEMINI_LABEL = "gemini-3.5-flash-lite";

function formatTimestamp(val?: string): string {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<{ loading: boolean; items: AdminApiKeyRecord[]; error?: string }>({
    loading: true,
    items: [],
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [rotateKeyId, setRotateKeyId] = useState<string | null>(null);
  const [newKeyInput, setNewKeyInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // New Key Form State
  const [formProvider, setFormProvider] = useState<"gemini" | "trello" | "geoapify" | "google_maps" | "other">("gemini");
  const [formLabel, setFormLabel] = useState(DEFAULT_GEMINI_LABEL);
  const [formKey, setFormKey] = useState("");

  const loadKeys = () => {
    setKeys((prev) => ({ ...prev, loading: true, error: undefined }));
    getAdminApiKeys()
      .then((res) => setKeys({ loading: false, items: res.items }))
      .catch((err) => setKeys({ loading: false, items: [], error: errorText(err) }));
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim() || !formKey.trim()) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      await postAdminApiKey({
        provider: formProvider,
        label: formLabel.trim(),
        key: formKey.trim(),
      });
      setActionMessage({ type: "success", text: "Thêm API Key thành công." });
      setShowAddModal(false);
      setFormLabel(DEFAULT_GEMINI_LABEL);
      setFormKey("");
      loadKeys();
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRotate = async (id: string) => {
    if (!newKeyInput.trim()) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      await rotateAdminApiKey(id, { key: newKeyInput.trim() });
      setActionMessage({ type: "success", text: "Xoay API Key thành công." });
      setRotateKeyId(null);
      setNewKeyInput("");
      loadKeys();
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (id: string, label: string) => {
    if (!confirm(`Bạn có chắc chắn muốn vô hiệu hóa API Key "${label}" không? Thao tác này sẽ dừng ngay quyền truy cập của key.`)) {
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      await revokeAdminApiKey(id);
      setActionMessage({ type: "success", text: "Vô hiệu hóa API Key thành công." });
      loadKeys();
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTest = async (id: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await testAdminApiKey(id);
      if (res.success) {
        setActionMessage({ type: "success", text: `${res.message} (Độ trễ: ${res.latency_ms} ms)` });
      } else {
        setActionMessage({ type: "error", text: `${res.message} (Độ trễ: ${res.latency_ms} ms)` });
      }
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredKeys = useMemo(() => {
    return keys.items.filter((item) => {
      const matchProvider = providerFilter === "all" || item.provider === providerFilter;
      const matchSearch =
        searchQuery === "" ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.last4.toLowerCase().includes(searchQuery.toLowerCase());
      return matchProvider && matchSearch;
    });
  }, [keys.items, providerFilter, searchQuery]);

  return (
    <div className="admin-subcontent">
      {/* Header controls */}
      <div className="admin-filter-bar admin-api-toolbar">
        <div className="admin-filter-left admin-api-filters">
          <div className="admin-search-wrap admin-api-search">
            <input
              type="search"
              placeholder="Tìm theo nhãn, provider, key…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-input"
            />
            <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          </div>
          <div className="admin-select-wrap admin-api-provider-filter">
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="admin-select">
              <option value="all">Tất cả Provider</option>
              <option value="gemini">Google Gemini AI</option>
              <option value="trello">Trello</option>
              <option value="geoapify">Geoapify Maps</option>
              <option value="google_maps">Google Maps</option>
              <option value="other">Khác</option>
            </select>
          </div>
        </div>

        <div className="admin-api-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={loadKeys}
            disabled={keys.loading}
            title="Làm mới danh sách"
          >
            <RefreshCw size={14} className={keys.loading ? "spin" : ""} /> Làm mới
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={15} /> Thêm API Key mới
          </button>
        </div>
      </div>

      {/* Action status notification banner */}
      {actionMessage && (
        <div
          className={`admin-card ${actionMessage.type === "success" ? "admin-success-banner" : "admin-error"}`}
          style={{
            margin: "0.75rem 0",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: actionMessage.type === "success" ? "#ECFDF5" : "#FEF2F2",
            border: `1px solid ${actionMessage.type === "success" ? "#A7F3D0" : "#FECACA"}`,
            color: actionMessage.type === "success" ? "#065F46" : "#991B1B",
            borderRadius: "8px",
          }}
        >
          {actionMessage.type === "success" ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
          <span style={{ fontSize: "0.74rem", fontWeight: 500 }}>{actionMessage.text}</span>
        </div>
      )}

      {/* Add API Key Form Card */}
      {showAddModal && (
        <div
          className="admin-card admin-api-form-card"
        >
          <div className="admin-card-title admin-api-form-heading">
            <h3>
              <Key size={16} color="var(--color-brand, #3B82F6)" /> Cấu hình API Key mới
            </h3>
            <span>
              Khóa được mã hóa AES-256-GCM và lưu an toàn, chỉ hiển thị hậu tố bảo vệ.
            </span>
          </div>

          <form onSubmit={handleCreate} className="admin-api-form">
            <div className="admin-api-form-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">Provider tích hợp</label>
                <div className="admin-select-wrap">
                <select
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value as any)}
                  className="admin-select"
                  style={{ width: "100%" }}
                >
                  <option value="gemini">Google Gemini AI</option>
                  <option value="trello">Trello</option>
                  <option value="geoapify">Geoapify Maps</option>
                  <option value="google_maps">Google Maps</option>
                  <option value="other">Khác</option>
                </select>
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Nhãn / Mô tả nhận diện</label>
                <input
                  type="text"
                  placeholder="gemini-3.5-flash-lite"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="admin-input"
                  required
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Giá trị API Key (Secret)</label>
              <div className="admin-api-secret-field">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập secret key: AIzaSy... / trello_token..."
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  className="admin-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="admin-api-secret-toggle"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="admin-api-form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={actionLoading}
              >
                Hủy
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={actionLoading}
              >
                {actionLoading ? "Đang lưu…" : "Lưu API Key"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rotate Key Inline Form */}
      {rotateKeyId && (
        <div
          className="admin-card"
          style={{
            margin: "1rem 0",
            borderColor: "var(--warning, #f59e0b)",
            background: "#FFFDF7",
            padding: "14px 18px",
            borderRadius: "8px",
          }}
        >
          <div className="admin-card-title">
            <h3 style={{ fontSize: "0.84rem", fontWeight: 700, color: "#92400E" }}>Xoay API Key mới</h3>
            <span style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>Nhập secret mới để thay thế khóa hiện tại</span>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <input
              type="password"
              placeholder="Nhập chuỗi API Key mới…"
              value={newKeyInput}
              onChange={(e) => setNewKeyInput(e.target.value)}
              className="admin-input"
              style={{ flex: 1 }}
            />
            <button
              className="button button-primary"
              type="button"
              onClick={() => handleRotate(rotateKeyId)}
              disabled={actionLoading}
            >
              Xác nhận xoay
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setRotateKeyId(null);
                setNewKeyInput("");
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Keys Table Card */}
      <div className="admin-card" style={{ marginTop: "12px", padding: 0, overflow: "hidden" }}>
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
            <ShieldCheck size={16} color="var(--color-navy)" />
            <h3 style={{ fontSize: "0.82rem", fontWeight: 700, margin: 0, color: "var(--color-navy)" }}>
              Danh sách khóa API đã đăng ký
            </h3>
          </div>
          <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>
            {filteredKeys.length} / {keys.items.length} khóa
          </span>
        </div>

        {keys.loading ? (
          <div className="admin-loading" style={{ padding: "30px" }}>
            <span className="loading-mark" /> Đang tải danh sách API Keys…
          </div>
        ) : keys.error ? (
          <div className="admin-error" style={{ padding: "20px" }}>
            <span>{keys.error}</span>
          </div>
        ) : filteredKeys.length > 0 ? (
          <div className="admin-table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: "120px" }}>Provider</th>
                  <th>Nhãn / Mô tả</th>
                  <th style={{ width: "110px" }}>Giá trị ẩn</th>
                  <th style={{ width: "110px" }}>Trạng thái</th>
                  <th style={{ width: "120px" }}>Cập nhật bởi</th>
                  <th style={{ width: "140px" }}>Cập nhật lúc</th>
                  <th style={{ width: "160px", textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeys.map((key) => {
                  const updatedBy = key.updated_by || (key as any).updatedBy || "admin";
                  const updatedAt = key.updated_at || (key as any).updatedAt;
                  const isActive = key.status === "active";

                  return (
                    <tr key={key.id}>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.72rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.3px",
                            color: "var(--color-navy)",
                          }}
                        >
                          {key.provider}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "0.74rem", color: "var(--color-navy)" }}>{key.label}</strong>
                          <span style={{ fontSize: "0.65rem", color: "var(--color-muted)" }}>ID: {key.id}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <code className="admin-code-pill">{key.last4 || "••••"}</code>
                          <button
                            type="button"
                            onClick={() => handleCopy(key.last4, key.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--color-muted)" }}
                            title="Sao chép"
                          >
                            {copiedId === key.id ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-badge status-${isActive ? "healthy" : "unavailable"}`}>
                          <span className={`admin-status-dot status-${isActive ? "healthy" : "unavailable"}`} />
                          {isActive ? "Hoạt động" : "Đã vô hiệu"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>{updatedBy}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-muted-soft)" }}>
                          {formatTimestamp(updatedAt)}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                          <button
                            className="button button-secondary"
                            style={{ padding: "3px 8px", fontSize: "0.7rem" }}
                            type="button"
                            onClick={() => handleTest(key.id)}
                            disabled={actionLoading}
                            title="Kiểm tra kết nối"
                          >
                            <Zap size={11} /> Test
                          </button>
                          {isActive && (
                            <>
                              <button
                                className="button button-secondary"
                                style={{ padding: "3px 8px", fontSize: "0.7rem" }}
                                type="button"
                                onClick={() => setRotateKeyId(key.id)}
                                disabled={actionLoading}
                                title="Xoay khóa mới"
                              >
                                Rotate
                              </button>
                              <button
                                className="button button-secondary"
                                style={{ padding: "3px 8px", fontSize: "0.7rem", color: "#DC2626" }}
                                type="button"
                                onClick={() => handleRevoke(key.id, key.label)}
                                disabled={actionLoading}
                                title="Thu hồi khóa"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-panel">
            <div className="admin-empty-panel-icon">
              <Key size={22} />
            </div>
            <h4>Chưa có API Key nào</h4>
            <p>
              {searchQuery || providerFilter !== "all"
                ? "Không tìm thấy API Key nào phù hợp với bộ lọc hiện tại."
                : "Chưa có khóa API nào được cấu hình trong hệ thống."}
            </p>
            <button className="button button-primary" type="button" onClick={() => setShowAddModal(true)}>
              <Plus size={14} /> Thêm khóa API đầu tiên
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
