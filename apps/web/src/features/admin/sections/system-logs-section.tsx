"use client";

import { useEffect, useState } from "react";
import { Filter, RefreshCw, ScrollText } from "lucide-react";
import { errorText, getAdminLogs } from "@/lib/api-client";
import type { AdminLogEntry } from "@/types";

export function SystemLogsSection() {
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [logs, setLogs] = useState<{ loading: boolean; items: AdminLogEntry[]; total: number; error?: string }>({ loading: true, items: [], total: 0 });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadLogs = () => {
    setLogs((prev) => ({ ...prev, loading: true }));
    getAdminLogs({
      actor_id: actorId.trim() || undefined,
      action: action.trim() || undefined,
      correlation_id: correlationId.trim() || undefined,
      page: 1,
      page_size: 50,
    })
      .then((res) => setLogs({ loading: false, items: res.items, total: res.total }))
      .catch((err) => setLogs({ loading: false, items: [], total: 0, error: errorText(err) }));
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="admin-subcontent">
      <div className="admin-filter-bar">
        <label className="admin-filter-item">
          <span>Action:</span>
          <input
            type="text"
            placeholder="e.g. ADMIN_API_KEY_CREATED"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="admin-input"
          />
        </label>
        <label className="admin-filter-item">
          <span>Actor ID:</span>
          <input
            type="text"
            placeholder="e.g. usr_123"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="admin-input"
          />
        </label>
        <label className="admin-filter-item">
          <span>Correlation ID:</span>
          <input
            type="text"
            placeholder="e.g. cor_abc"
            value={correlationId}
            onChange={(e) => setCorrelationId(e.target.value)}
            className="admin-input"
          />
        </label>
        <button className="button button-secondary" type="button" onClick={loadLogs}>
          <Filter size={15} /> Lọc logs
        </button>
      </div>

      <div className="admin-card" style={{ marginTop: "1rem" }}>
        <div className="admin-card-title">
          <h3>Nhật ký hoạt động hệ thống & Audit Events</h3>
          <span>Tổng số: {logs.total}</span>
        </div>

        {logs.loading ? (
          <div className="admin-loading"><span className="loading-mark" />Đang tải audit logs…</div>
        ) : logs.error ? (
          <div className="admin-error"><span>{logs.error}</span></div>
        ) : logs.items.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Hành động (Action)</th>
                  <th>Actor ID</th>
                  <th>Resource ID</th>
                  <th>Correlation ID</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {logs.items.map((log) => (
                  <tr key={log.id}>
                    <td><small>{new Date(log.created_at).toLocaleString("vi-VN")}</small></td>
                    <td><strong>{log.action}</strong></td>
                    <td><code>{log.actor_id || "—"}</code></td>
                    <td><code>{log.resource_id || "—"}</code></td>
                    <td><code>{log.correlation_id || "—"}</code></td>
                    <td>
                      <button
                        className="button button-secondary"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                        type="button"
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      >
                        {expandedLogId === log.id ? "Đóng" : "Payload"}
                      </button>
                      {expandedLogId === log.id && (
                        <pre style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--bg-card, #18181b)", borderRadius: "4px", fontSize: "0.75rem", overflowX: "auto" }}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty">Không có nhật ký nào phù hợp với bộ lọc.</div>
        )}
      </div>
    </div>
  );
}
