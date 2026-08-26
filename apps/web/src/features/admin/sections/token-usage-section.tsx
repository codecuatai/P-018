"use client";

import { useEffect, useState } from "react";
import { Cpu, DollarSign, Filter, Sparkles, TrendingUp, Zap } from "lucide-react";
import { errorText, getAdminTokenUsage } from "@/lib/api-client";
import type { AdminTokenUsageReport } from "@/types";

export function TokenUsageSection() {
  const [feature, setFeature] = useState("");
  const [model, setModel] = useState("");
  const [usage, setUsage] = useState<{ loading: boolean; data?: AdminTokenUsageReport; error?: string }>({ loading: true });

  const loadUsage = () => {
    setUsage({ loading: true });
    getAdminTokenUsage({
      feature: feature || undefined,
      model: model || undefined,
    })
      .then((data) => setUsage({ loading: false, data }))
      .catch((err) => setUsage({ loading: false, error: errorText(err) }));
  };

  useEffect(() => {
    loadUsage();
  }, [feature, model]);

  const data = usage.data;

  return (
    <div className="admin-subcontent">
      <div className="admin-filter-bar">
        <label className="admin-filter-item">
          <span>Tính năng (Feature):</span>
          <select value={feature} onChange={(e) => setFeature(e.target.value)} className="admin-select">
            <option value="">Tất cả tính năng</option>
            <option value="chat_turn">Chat Assistant</option>
            <option value="multi_service_planner">Multi-service Planner</option>
            <option value="tool_execution">Tool Execution</option>
            <option value="memory_extraction">Memory Extraction</option>
          </select>
        </label>
        <label className="admin-filter-item">
          <span>Mô hình (Model):</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="admin-select">
            <option value="">Tất cả mô hình</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
          </select>
        </label>
        <button className="button button-secondary" type="button" onClick={loadUsage}>
          <Filter size={15} /> Lọc
        </button>
      </div>

      {usage.loading ? (
        <div className="admin-card admin-loading"><span className="loading-mark" />Đang tính toán thống kê token & chi phí…</div>
      ) : usage.error ? (
        <div className="admin-card admin-error"><span>{usage.error}</span></div>
      ) : data ? (
        <>
          <div className="admin-metric-grid">
            <article className="admin-metric">
              <span className="admin-metric-icon"><Sparkles size={17} /></span>
              <span>Tổng Tokens tiêu thụ</span>
              <strong>{new Intl.NumberFormat("vi-VN").format(data.total_tokens)}</strong>
            </article>
            <article className="admin-metric">
              <span className="admin-metric-icon"><Cpu size={17} /></span>
              <span>Prompt Tokens</span>
              <strong>{new Intl.NumberFormat("vi-VN").format(data.total_prompt_tokens)}</strong>
            </article>
            <article className="admin-metric">
              <span className="admin-metric-icon"><Zap size={17} /></span>
              <span>Completion Tokens</span>
              <strong>{new Intl.NumberFormat("vi-VN").format(data.total_completion_tokens)}</strong>
            </article>
            <article className="admin-metric">
              <span className="admin-metric-icon"><DollarSign size={17} /></span>
              <span>Ước tính Chi phí (USD)</span>
              <strong>${data.total_estimated_cost_usd.toFixed(4)}</strong>
            </article>
          </div>

          <div className="admin-two-column" style={{ marginTop: "1rem" }}>
            <div className="admin-card">
              <div className="admin-card-title">
                <h3>Phân bổ theo tính năng</h3>
                <span>Token & Cost</span>
              </div>
              <div className="admin-domain-list">
                {Object.entries(data.by_feature).map(([feat, val]) => (
                  <div className="admin-domain-row" key={feat}>
                    <strong>{feat}</strong>
                    <span className="admin-domain-detail">{new Intl.NumberFormat("vi-VN").format(val.total)} tokens</span>
                    <span className="admin-badge">${val.cost.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title">
                <h3>Phân bổ theo Mô hình (Model)</h3>
                <span>Token & Cost</span>
              </div>
              <div className="admin-domain-list">
                {Object.entries(data.by_model).map(([mod, val]) => (
                  <div className="admin-domain-row" key={mod}>
                    <strong>{mod}</strong>
                    <span className="admin-domain-detail">{new Intl.NumberFormat("vi-VN").format(val.total)} tokens</span>
                    <span className="admin-badge">${val.cost.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.top_consumers.length > 0 && (
            <div className="admin-card" style={{ marginTop: "1rem" }}>
              <div className="admin-card-title">
                <h3>Top người dùng tiêu thụ tokens nhiều nhất</h3>
                <span>Xếp hạng theo tổng token</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Actor ID</th>
                      <th>Tổng Token</th>
                      <th>Ước tính Chi phí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_consumers.map((consumer) => (
                      <tr key={consumer.actor_id}>
                        <td><code>{consumer.actor_id}</code></td>
                        <td><strong>{new Intl.NumberFormat("vi-VN").format(consumer.total_tokens)}</strong></td>
                        <td>${consumer.estimated_cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="admin-card admin-empty">Chưa có dữ liệu thống kê token.</div>
      )}
    </div>
  );
}
