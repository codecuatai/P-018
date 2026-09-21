"use client";

import React from "react";
import { Activity, RefreshCw } from "lucide-react";

interface KpiRibbonProps {
  todayRevenue: number;
  todayNewOrders: number;
  todayNeedsAction: number;
  todayCompletedCount: number;
  ctaLabel: string;
  onCtaClick: () => void;
  loadingOperations: boolean;
  onRefresh: () => void;
}

export function KpiRibbon({
  todayRevenue,
  todayNewOrders,
  todayNeedsAction,
  todayCompletedCount,
  ctaLabel,
  onCtaClick,
  loadingOperations,
  onRefresh,
}: KpiRibbonProps) {
  return (
    <div className="provider-today-strip" style={{ marginBottom: "18px" }}>
      <div className="provider-today-metrics">
        {/* Metric 1: Revenue */}
        <div className="provider-today-metric">
          <span className="provider-today-label">Doanh thu hôm nay</span>
          <strong className="provider-today-number provider-today-number--revenue">
            {todayRevenue > 0 ? `${todayRevenue.toLocaleString("vi-VN")} đ` : "—"}
          </strong>
        </div>

        {/* Metric 2: New orders */}
        <div className="provider-today-metric">
          <span className="provider-today-label">Đơn mới</span>
          <strong className="provider-today-number provider-today-number--new">
            {todayNewOrders}
          </strong>
        </div>

        {/* Metric 3: Needs action */}
        <div className="provider-today-metric">
          <span className="provider-today-label">Cần xử lý</span>
          <strong
            className={`provider-today-number${
              todayNeedsAction > 0 ? " provider-today-number--urgent" : ""
            }`}
          >
            {todayNeedsAction}
          </strong>
        </div>

        {/* Metric 4: Completed today */}
        <div className="provider-today-metric">
          <span className="provider-today-label">Đã hoàn tất</span>
          <strong className="provider-today-number" style={{ color: "#059669" }}>
            {todayCompletedCount}
          </strong>
        </div>
      </div>

      <div className="provider-today-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* 3s Auto-polling pulse badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "20px",
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            fontSize: "11px",
            fontWeight: 600,
            color: "#065F46",
          }}
          title="Hệ thống tự động đồng bộ mỗi 3 giây (tạm ngắt khi ẩn tab để tối ưu)"
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#10B981",
              boxShadow: "0 0 6px rgba(16, 185, 129, 0.8)",
            }}
          />
          <span>Đồng bộ trực tiếp · Cập nhật 3s</span>
        </div>

        {/* Dynamic CTA button */}
        <button
          type="button"
          className="button button-primary provider-cta-btn"
          onClick={onCtaClick}
        >
          {ctaLabel}
        </button>

        {/* Refresh button */}
        <button
          type="button"
          disabled={loadingOperations}
          onClick={onRefresh}
          className="button button-secondary"
          style={{ height: "36px", padding: "0 12px", fontSize: "12px", borderRadius: "8px" }}
          title="Đồng bộ dữ liệu thời gian thực"
        >
          <RefreshCw size={14} className={loadingOperations ? "spin" : ""} />
        </button>
      </div>
    </div>
  );
}
