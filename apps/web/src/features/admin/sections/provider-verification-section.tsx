"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import {
  errorText,
  getOperationsProviderDocuments,
  reviewOperationsProviderDocument,
  type ProviderDocument,
} from "@/lib/api-client";

export function ProviderVerificationSection() {
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [searchProviderId, setSearchProviderId] = useState<string>("");

  // Review Modal State
  const [selectedDoc, setSelectedDoc] = useState<ProviderDocument | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNote, setReviewNote] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadDocuments = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const items = await getOperationsProviderDocuments(searchProviderId.trim() || undefined);
      setDocuments(items);
    } catch (err) {
      setError(errorText(err) || "Không thể tải danh sách tài liệu đối tác.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, [searchProviderId]);

  const handleOpenReviewModal = (doc: ProviderDocument, defaultStatus: "APPROVED" | "REJECTED" = "APPROVED") => {
    setSelectedDoc(doc);
    setReviewStatus(defaultStatus);
    setReviewNote(doc.reviewNote || "");
  };

  const handleCloseReviewModal = () => {
    setSelectedDoc(null);
    setReviewNote("");
    setSubmittingReview(false);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc) return;

    setSubmittingReview(true);
    setActionMessage(null);
    try {
      const updated = await reviewOperationsProviderDocument(selectedDoc.id, {
        status: reviewStatus,
        review_note: reviewNote.trim() || undefined,
      });

      setDocuments((prev) =>
        prev.map((doc) => (doc.id === selectedDoc.id ? { ...doc, ...updated } : doc)),
      );
      setActionMessage({
        type: "success",
        text: `Đã ${reviewStatus === "APPROVED" ? "phê duyệt" : "từ chối"} hồ sơ ${selectedDoc.id} thành công.`,
      });
      handleCloseReviewModal();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: errorText(err) || "Không thể cập nhật trạng thái thẩm định.",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleQuickReview = async (id: string, status: "APPROVED" | "REJECTED") => {
    setActionMessage(null);
    try {
      const updated = await reviewOperationsProviderDocument(id, {
        status,
        review_note: status === "APPROVED" ? "Phê duyệt nhanh qua bảng điều hành" : "Từ chối nhanh - hồ sơ không hợp lệ",
      });
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, ...updated } : doc)));
      setActionMessage({
        type: "success",
        text: `Đã ${status === "APPROVED" ? "duyệt nhanh" : "từ chối"} hồ sơ thành công.`,
      });
    } catch (err) {
      setActionMessage({ type: "error", text: errorText(err) || "Không thể cập nhật hồ sơ." });
    }
  };

  // Metrics
  const pendingCount = useMemo(() => documents.filter((d) => d.status === "PENDING").length, [documents]);
  const approvedCount = useMemo(() => documents.filter((d) => d.status === "APPROVED").length, [documents]);
  const rejectedCount = useMemo(() => documents.filter((d) => d.status === "REJECTED").length, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((d) => {
      if (statusFilter && d.status !== statusFilter) return false;
      return true;
    });
  }, [documents, statusFilter]);

  const formatDocumentType = (type?: string) => {
    if (!type) return "Chưa xác định";
    switch (type.toLowerCase()) {
      case "driver_license":
      case "license":
        return "Bằng lái xe";
      case "identity_card":
      case "id_card":
      case "cccd":
        return "Căn cước công dân (CCCD)";
      case "vehicle_registration":
        return "Đăng ký xe / Cà vẹt";
      case "business_license":
        return "Giấy phép kinh doanh";
      case "food_safety_cert":
        return "Chứng nhận ATTP";
      case "medical_license":
        return "Chứng chỉ hành nghề Y tế";
      default:
        return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "999px",
              background: "#FEF3C7",
              color: "#92400E",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            <Clock3 size={11} /> Chờ duyệt
          </span>
        );
      case "APPROVED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "999px",
              background: "#DCFCE7",
              color: "#166534",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            <Check size={11} /> Đã duyệt
          </span>
        );
      case "REJECTED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "999px",
              background: "#FEE2E2",
              color: "#991B1B",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            <X size={11} /> Bị từ chối
          </span>
        );
      case "EXPIRED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "999px",
              background: "#F1F5F9",
              color: "#475569",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            Hết hạn
          </span>
        );
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  return (
    <div className="admin-subcontent">
      {/* Metric Cards */}
      <div className="admin-metric-grid">
        <article className="admin-metric">
          <span className="admin-metric-icon" style={{ color: "#D97706" }}>
            <Clock3 size={17} />
          </span>
          <span>Chờ thẩm định</span>
          <strong style={{ color: "#D97706" }}>{pendingCount}</strong>
        </article>

        <article className="admin-metric">
          <span className="admin-metric-icon" style={{ color: "#16A34A" }}>
            <CheckCircle2 size={17} />
          </span>
          <span>Đã phê duyệt</span>
          <strong style={{ color: "#16A34A" }}>{approvedCount}</strong>
        </article>

        <article className="admin-metric">
          <span className="admin-metric-icon" style={{ color: "#DC2626" }}>
            <XCircle size={17} />
          </span>
          <span>Bị từ chối</span>
          <strong style={{ color: "#DC2626" }}>{rejectedCount}</strong>
        </article>

        <article className="admin-metric">
          <span className="admin-metric-icon">
            <ShieldCheck size={17} />
          </span>
          <span>Tổng số hồ sơ</span>
          <strong>{documents.length}</strong>
        </article>
      </div>

      {/* Alert Notifications */}
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

      {/* Filter Tabs & Toolbar */}
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
        {/* Status Pills */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "", label: "Tất cả", count: documents.length },
            { id: "PENDING", label: "Chờ duyệt", count: pendingCount },
            { id: "APPROVED", label: "Đã duyệt", count: approvedCount },
            { id: "REJECTED", label: "Bị từ chối", count: rejectedCount },
            { id: "EXPIRED", label: "Hết hạn" },
          ].map((pill) => {
            const isActive = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                className={`button button-sm ${isActive ? "button-primary" : "button-secondary"}`}
                onClick={() => setStatusFilter(pill.id)}
                style={{ borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "5px" }}
              >
                <span>{pill.label}</span>
                {pill.count != null && (
                  <span
                    style={{
                      background: isActive ? "rgba(255,255,255,0.3)" : "#E2E8F0",
                      color: isActive ? "#FFFFFF" : "#475569",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      fontSize: "10px",
                      fontWeight: 700,
                    }}
                  >
                    {pill.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Tìm theo Provider ID..."
              value={searchProviderId}
              onChange={(e) => setSearchProviderId(e.target.value)}
              className="admin-input"
              style={{ width: "200px", paddingLeft: "26px" }}
            />
            <Search size={13} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          </div>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadDocuments(true)}
            disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : undefined} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Documents Table */}
      <div className="admin-card" style={{ marginTop: "14px" }}>
        <div className="admin-card-title">
          <h3>Danh sách hồ sơ giấy tờ đối tác</h3>
          <span>Hiển thị: {filteredDocuments.length} hồ sơ</span>
        </div>

        {loading ? (
          <div className="admin-loading">
            <span className="loading-mark" />
            Đang tải hồ sơ đối tác…
          </div>
        ) : error ? (
          <div className="admin-error">
            <span>{error}</span>
            <button type="button" className="button button-sm button-secondary" onClick={() => void loadDocuments()}>
              Thử lại
            </button>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#64748B", fontSize: "var(--text-xs)" }}>
            Không có hồ sơ nào trong trạng thái này.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mã hồ sơ</th>
                  <th>Provider ID</th>
                  <th>Loại giấy tờ</th>
                  <th>Tệp đính kèm</th>
                  <th>Hạn dùng</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú thẩm định</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => {
                  const providerId = doc.providerId || (doc as any).provider_id;
                  const documentType = doc.documentType || (doc as any).document_type;
                  const documentUrl = doc.documentUrl || (doc as any).document_url;
                  const expiresAt = doc.expiresAt || (doc as any).expires_at;
                  const reviewNote = doc.reviewNote || (doc as any).review_note;

                  return (
                    <tr key={doc.id}>
                      <td>
                        <code style={{ fontSize: "11px", fontWeight: 700, color: "#1E293B" }}>{doc.id}</code>
                      </td>
                      <td>
                        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "#0F172A" }}>
                          {providerId}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "var(--text-xs)", fontWeight: 500, color: "#334155" }}>
                          <FileText size={13} color="#64748B" />
                          {formatDocumentType(documentType)}
                        </span>
                      </td>
                      <td>
                        {documentUrl ? (
                          <a
                            href={documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="button button-sm button-secondary"
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "3px 8px" }}
                          >
                            <ExternalLink size={12} /> Xem tệp
                          </a>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>Không có file</span>
                        )}
                      </td>
                      <td>
                        {expiresAt ? (
                          <span style={{ fontSize: "11px", color: new Date(expiresAt).getTime() < Date.now() ? "#DC2626" : "#475569" }}>
                            {new Date(expiresAt).toLocaleDateString("vi-VN")}
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>Vô thời hạn</span>
                        )}
                      </td>
                      <td>{getStatusBadge(doc.status)}</td>
                      <td>
                        <span style={{ fontSize: "11px", color: reviewNote ? "#334155" : "#94A3B8", fontStyle: reviewNote ? "normal" : "italic" }}>
                          {reviewNote || "Chưa có ghi chú"}
                        </span>
                      </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="button button-sm button-primary"
                          onClick={() => handleOpenReviewModal(doc, "APPROVED")}
                        >
                          Thẩm định
                        </button>
                        {doc.status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              className="button button-sm button-secondary"
                              onClick={() => void handleQuickReview(doc.id, "APPROVED")}
                              title="Duyệt nhanh"
                              style={{ color: "#16A34A" }}
                            >
                              Duyệt
                            </button>
                            <button
                              type="button"
                              className="button button-sm button-secondary"
                              onClick={() => void handleQuickReview(doc.id, "REJECTED")}
                              title="Từ chối nhanh"
                              style={{ color: "#DC2626" }}
                            >
                              Từ chối
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
        )}
      </div>

      {/* Review Modal */}
      {selectedDoc && (
        <div
          className="admin-modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            className="admin-modal"
            style={{
              background: "#FFFFFF",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              width: "100%",
              maxWidth: "520px",
              padding: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 700, color: "#0F172A" }}>
                Thẩm định hồ sơ đối tác
              </h3>
              <button
                type="button"
                onClick={handleCloseReviewModal}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Document Info Card */}
            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                fontSize: "var(--text-xs)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <span style={{ color: "#64748B", display: "block" }}>Provider ID:</span>
                  <strong style={{ color: "#0F172A" }}>{selectedDoc.providerId}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748B", display: "block" }}>Loại tài liệu:</span>
                  <strong style={{ color: "#0F172A" }}>{formatDocumentType(selectedDoc.documentType)}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748B", display: "block" }}>Hạn sử dụng:</span>
                  <span style={{ color: "#334155" }}>
                    {selectedDoc.expiresAt ? new Date(selectedDoc.expiresAt).toLocaleDateString("vi-VN") : "Vô thời hạn"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#64748B", display: "block" }}>Tệp đính kèm:</span>
                  {selectedDoc.documentUrl ? (
                    <a href={selectedDoc.documentUrl} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600 }}>
                      Mở liên kết xem tệp ↗
                    </a>
                  ) : (
                    <span style={{ color: "#94A3B8" }}>Không có</span>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmitReview}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, color: "#1E293B", marginBottom: "8px" }}>
                  Quyết định thẩm định:
                </label>
                <div style={{ display: "flex", gap: "12px" }}>
                  <label
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      border: `1px solid ${reviewStatus === "APPROVED" ? "#16A34A" : "#CBD5E1"}`,
                      background: reviewStatus === "APPROVED" ? "#F0FDF4" : "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      color: reviewStatus === "APPROVED" ? "#166534" : "#475569",
                    }}
                  >
                    <input
                      type="radio"
                      name="reviewStatus"
                      value="APPROVED"
                      checked={reviewStatus === "APPROVED"}
                      onChange={() => setReviewStatus("APPROVED")}
                    />
                    Phê duyệt (APPROVED)
                  </label>

                  <label
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      border: `1px solid ${reviewStatus === "REJECTED" ? "#DC2626" : "#CBD5E1"}`,
                      background: reviewStatus === "REJECTED" ? "#FEF2F2" : "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      color: reviewStatus === "REJECTED" ? "#991B1B" : "#475569",
                    }}
                  >
                    <input
                      type="radio"
                      name="reviewStatus"
                      value="REJECTED"
                      checked={reviewStatus === "REJECTED"}
                      onChange={() => setReviewStatus("REJECTED")}
                    />
                    Từ chối (REJECTED)
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, color: "#1E293B", marginBottom: "6px" }}>
                  Ghi chú thẩm định / Lý do từ chối (tùy chọn):
                </label>
                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  maxLength={500}
                  placeholder={
                    reviewStatus === "APPROVED"
                      ? "VD: Giấy tờ hợp lệ, hình ảnh rõ nét, còn hạn sử dụng."
                      : "VD: Ảnh chụp mờ thông tin, yêu cầu chụp lại bản gốc và tải lên lại."
                  }
                  className="admin-input"
                  style={{ width: "100%", padding: "8px 10px", resize: "vertical" }}
                />
                <span style={{ display: "block", textAlign: "right", fontSize: "10px", color: "#94A3B8", marginTop: "4px" }}>
                  {reviewNote.length}/500 ký tự
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleCloseReviewModal}
                  disabled={submittingReview}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className={`button ${reviewStatus === "APPROVED" ? "button-primary" : "button-secondary"}`}
                  disabled={submittingReview}
                  style={reviewStatus === "REJECTED" ? { color: "#DC2626", borderColor: "#DC2626" } : undefined}
                >
                  {submittingReview ? "Đang lưu…" : "Xác nhận thẩm định"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export const ProviderDocumentsSubtab = ProviderVerificationSection;
