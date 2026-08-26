"use client";

import { useEffect, useState } from "react";
import { Filter, MessageSquare, Star } from "lucide-react";
import { errorText, getAdminAllFeedback } from "@/lib/api-client";
import type { AdminFeedbackSummary } from "@/types";

export function FeedbackSection() {
  const [domain, setDomain] = useState<string>("");
  const [ratingMin, setRatingMin] = useState<string>("");
  const [feedbackState, setFeedbackState] = useState<{ loading: boolean; data?: AdminFeedbackSummary; error?: string }>({ loading: true });

  const loadFeedback = () => {
    setFeedbackState({ loading: true });
    getAdminAllFeedback({
      domain: domain || undefined,
      rating_min: ratingMin ? Number(ratingMin) : undefined,
      page: 1,
      page_size: 50,
    })
      .then((data) => setFeedbackState({ loading: false, data }))
      .catch((err) => setFeedbackState({ loading: false, error: errorText(err) }));
  };

  useEffect(() => {
    loadFeedback();
  }, [domain, ratingMin]);

  const stats = feedbackState.data?.stats;

  return (
    <div className="admin-subcontent">
      <div className="admin-filter-bar">
        <label className="admin-filter-item">
          <span>Domain:</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="admin-select">
            <option value="">Tất cả domain</option>
            <option value="food">Food</option>
            <option value="ride">Ride</option>
            <option value="restaurant">Restaurant</option>
            <option value="healthcare">Healthcare</option>
          </select>
        </label>

        <label className="admin-filter-item">
          <span>Điểm tối thiểu:</span>
          <select value={ratingMin} onChange={(e) => setRatingMin(e.target.value)} className="admin-select">
            <option value="">Tất cả số sao</option>
            <option value="1">★ 1+ sao</option>
            <option value="2">★★ 2+ sao</option>
            <option value="3">★★★ 3+ sao</option>
            <option value="4">★★★★ 4+ sao</option>
            <option value="5">★★★★★ 5 sao</option>
          </select>
        </label>

        <button className="button button-secondary" type="button" onClick={loadFeedback}>
          <Filter size={15} /> Lọc
        </button>
      </div>

      {stats && (
        <div className="admin-metric-grid">
          <article className="admin-metric">
            <span className="admin-metric-icon"><Star size={17} /></span>
            <span>Điểm trung bình chung</span>
            <strong>{stats.average_rating ? stats.average_rating.toFixed(1) : "—"} / 5.0</strong>
          </article>
          {Object.entries(stats.by_domain ?? {}).map(([dom, val]) => (
            <article className="admin-metric" key={dom}>
              <span className="admin-metric-icon"><MessageSquare size={17} /></span>
              <span>{dom.toUpperCase()}</span>
              <strong>{val.average_rating.toFixed(1)} ★ <small>({val.count} đánh giá)</small></strong>
            </article>
          ))}
        </div>
      )}

      <div className="admin-card" style={{ marginTop: "1rem" }}>
        <div className="admin-card-title">
          <h3>Danh sách phản hồi & đánh giá</h3>
          <span>Tổng số: {feedbackState.data?.total ?? 0}</span>
        </div>

        {feedbackState.loading ? (
          <div className="admin-loading"><span className="loading-mark" />Đang tải danh sách đánh giá…</div>
        ) : feedbackState.error ? (
          <div className="admin-error"><span>{feedbackState.error}</span></div>
        ) : feedbackState.data?.items.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Actor / User ID</th>
                  <th>Domain</th>
                  <th>Resource ID</th>
                  <th>Điểm</th>
                  <th>Nhận xét</th>
                  <th>Thời điểm</th>
                </tr>
              </thead>
              <tbody>
                {feedbackState.data.items.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.actor_id}</code></td>
                    <td><span className="admin-badge">{item.domain}</span></td>
                    <td><code>{item.resource_id}</code></td>
                    <td>{"★".repeat(Math.max(0, Math.min(5, item.rating)))}{"☆".repeat(Math.max(0, 5 - item.rating))} ({item.rating}/5)</td>
                    <td>{item.comment || "—"}</td>
                    <td>{new Date(item.created_at).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty">Không có đánh giá nào phù hợp với bộ lọc.</div>
        )}
      </div>
    </div>
  );
}
