"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Lock,
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

interface KeyTestStatus {
  loading?: boolean;
  tested?: boolean;
  success?: boolean;
  message?: string;
  latency_ms?: number;
  testedAt?: string;
}

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
  const [testResults, setTestResults] = useState<Record<string, KeyTestStatus>>({});
  const [testingAll, setTestingAll] = useState(false);
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
    setTestResults((prev) => ({
      ...prev,
      [id]: { loading: true },
    }));
    setActionMessage(null);
    try {
      const res = await testAdminApiKey(id);
      const result: KeyTestStatus = {
        loading: false,
        tested: true,
        success: res.success,
        message: res.message,
        latency_ms: res.latency_ms,
        testedAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      setTestResults((prev) => ({ ...prev, [id]: result }));
      if (res.success) {
        setActionMessage({
          type: "success",
          text: `Khóa ${id.slice(0, 10)}... hoạt động tốt (Độ trễ: ${res.latency_ms} ms).`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: `Khóa ${id.slice(0, 10)}... không khả dụng: ${res.message} (Độ trễ: ${res.latency_ms} ms).`,
        });
      }
    } catch (err) {
      const msg = errorText(err);
      setTestResults((prev) => ({
        ...prev,
        [id]: { loading: false, tested: true, success: false, message: msg },
      }));
      setActionMessage({ type: "error", text: msg });
    }
  };

  const handleTestAll = async () => {
    const activeKeys = filteredKeys.filter((k) => k.status === "active");
    if (activeKeys.length === 0) return;
    setTestingAll(true);
    setActionMessage(null);
    for (const key of activeKeys) {
      await handleTest(key.id);
    }
    setTestingAll(false);
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
            onClick={handleTestAll}
            disabled={testingAll || keys.loading || filteredKeys.filter((k) => k.status === "active").length === 0}
            title="Kiểm tra kết nối tất cả các khóa đang hoạt động"
          >
            <Activity size={14} className={testingAll ? "spin" : ""} /> {testingAll ? "Đang kiểm tra…" : "Kiểm tra tất cả"}
          </button>
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
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}>{actionMessage.text}</span>
        </div>
      )}

      {/* Add API Key Form Card */}
      {showAddModal && (
        <div className="admin-card admin-api-form-card">
          <div className="admin-card-title admin-api-form-heading">
            <h3>
              <Key size={16} color="var(--color-brand, #6366F1)" /> Cấu hình API Key mới
            </h3>
            <span>
              Khóa được mã hóa AES-256-GCM và lưu an toàn, tuyệt đối không lộ secret ra ngoài.
            </span>
          </div>

          <form onSubmit={handleCreate} className="admin-api-form">
            <div className="admin-api-form-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">Dịch vụ (Provider)</label>
                <select
                  value={formProvider}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setFormProvider(val);
                    if (val === "gemini" && formLabel === "default") {
                      setFormLabel(DEFAULT_GEMINI_LABEL);
                    }
                  }}
                  className="admin-select"
                >
                  <option value="gemini">Google Gemini AI</option>
                  <option value="trello">Trello</option>
                  <option value="geoapify">Geoapify Maps</option>
                  <option value="google_maps">Google Maps</option>
                  <option value="other">Khác</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Nhãn / Mô tả</label>
                <input
                  type="text"
                  placeholder="Ví dụ: gemini-3.5-flash-lite / trello-main"
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
            <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "#92400E" }}>Xoay API Key mới</h3>
            <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>Nhập secret mới để thay thế khóa hiện tại</span>
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
            <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, margin: 0, color: "var(--color-navy)" }}>
              Danh sách khóa API đã đăng ký
            </h3>
          </div>
          <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
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
                  <th style={{ width: "100px" }}>Provider</th>
                  <th style={{ minWidth: "160px" }}>Nhãn / Mô tả</th>
                  <th style={{ width: "120px" }}>Khóa bí mật</th>
                  <th style={{ width: "110px" }}>Trạng thái</th>
                  <th style={{ width: "160px" }}>Sức khỏe kết nối</th>
                  <th style={{ width: "130px" }}>Cập nhật lúc</th>
                  <th style={{ minWidth: "260px", textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeys.map((key) => {
                  const updatedBy = key.updated_by || (key as any).updatedBy || "admin";
                  const updatedAt = key.updated_at || (key as any).updatedAt;
                  const isActive = key.status === "active";
                  const testStatus = testResults[key.id];

                  return (
                    <tr key={key.id}>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "var(--text-micro)",
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
                          <strong style={{ fontSize: "var(--text-xs)", color: "var(--color-navy)" }}>{key.label}</strong>
                          <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>ID: {key.id}</span>
                        </div>
                      </td>
                      <td>
                        <div
                          className="admin-key-masked"
                          title="Khóa bí mật được mã hóa AES-256-GCM an toàn trong Database"
                        >
                          <Lock size={11} className="admin-key-lock-icon" />
                          <span className="admin-masked-dots">••••••••••••</span>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-badge status-${isActive ? "healthy" : "unavailable"}`}>
                          <span className={`admin-status-dot status-${isActive ? "healthy" : "unavailable"}`} />
                          {isActive ? "Hoạt động" : "Đã vô hiệu"}
                        </span>
                      </td>
                      <td>
                        {testStatus?.loading ? (
                          <span className="admin-health-pill testing">
                            <RefreshCw size={11} className="spin" /> Đang kiểm tra…
                          </span>
                        ) : testStatus?.tested ? (
                          testStatus.success ? (
                            <span
                              className="admin-health-pill success"
                              title={`${testStatus.message || "Hoạt động tốt"} - Lúc ${testStatus.testedAt}`}
                            >
                              <CheckCircle2 size={11} /> Khả dụng ({testStatus.latency_ms ?? 0}ms)
                            </span>
                          ) : (
                            <span
                              className="admin-health-pill error"
                              title={`${testStatus.message || "Không khả dụng"} - Lúc ${testStatus.testedAt}`}
                            >
                              <XCircle size={11} /> {testStatus.message || "Lỗi kết nối"}
                            </span>
                          )
                        ) : (
                          <span
                            className="admin-health-pill unverified"
                            title="Bấm 'Kiểm tra' để gửi request xác thực khóa"
                          >
                            <Activity size={11} /> Chưa kiểm tra
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted-soft)" }}>
                          {formatTimestamp(updatedAt)}
                        </span>
                      </td>
                      <td className="admin-api-actions-cell">
                        <div className="admin-action-btn-group">
                          <button
                            type="button"
                            className="admin-action-btn admin-action-btn-test"
                            onClick={() => handleTest(key.id)}
                            disabled={actionLoading || testStatus?.loading}
                            title="Kiểm tra kết nối và hạn mức của khóa"
                          >
                            {testStatus?.loading ? (
                              <RefreshCw size={12} className="spin" />
                            ) : (
                              <Zap size={12} />
                            )}
                            <span>{testStatus?.loading ? "Đang thử…" : "Kiểm tra"}</span>
                          </button>

                          {isActive && (
                            <>
                              <button
                                type="button"
                                className="admin-action-btn admin-action-btn-rotate"
                                onClick={() => setRotateKeyId(key.id)}
                                disabled={actionLoading || testStatus?.loading}
                                title="Đổi sang secret key mới"
                              >
                                <RefreshCw size={12} />
                                <span>Đổi khóa</span>
                              </button>
                              <button
                                type="button"
                                className="admin-action-btn admin-action-btn-revoke"
                                onClick={() => handleRevoke(key.id, key.label)}
                                disabled={actionLoading || testStatus?.loading}
                                title="Vô hiệu hóa khóa này"
                              >
                                <ShieldAlert size={12} />
                                <span>Thu hồi</span>
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
