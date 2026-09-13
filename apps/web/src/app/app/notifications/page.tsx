"use client";

import Link from "next/link";
import { Bell, CheckCheck, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  errorText,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/api-client";
import { emitNotificationsChanged } from "@/lib/conversation-events";
import type { NotificationItem } from "@/types";

type CategoryFilter = "ALL" | "BOOKING" | "PROMOTION" | "SYSTEM";
type StatusFilter = "ALL" | "UNREAD" | "READ";

function matchesCategory(item: NotificationItem, category: CategoryFilter): boolean {
  if (category === "ALL") return true;
  const raw = `${item.type || ""} ${item.event_key || ""} ${item.resource_type || ""} ${item.title || ""} ${item.body || ""}`.toLowerCase();
  const isBooking =
    ["food_order", "ride_booking", "restaurant_reservation", "healthcare_appointment"].includes(item.resource_type ?? "") ||
    /booking|appointment|ride|food|order|reservation|lịch hẹn|chuyến xe|đơn hàng|đặt bàn|khám|tài xế|bác sĩ/.test(raw);
  const isPromo = /promotion|voucher|discount|reward|loyalty|ưu đãi|khuyến mãi|giảm giá|điểm thưởng|quà/.test(raw);
  const isSystem = /system|auth|security|account|hệ thống|tài khoản|bảo mật|mật khẩu|phiên/.test(raw);

  if (category === "BOOKING") return isBooking;
  if (category === "PROMOTION") return isPromo;
  if (category === "SYSTEM") return isSystem || (!isBooking && !isPromo);
  return true;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    booking_updates: true,
    promotions: true,
    system: true,
    email_enabled: false,
  });
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefNote, setPrefNote] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listNotifications(statusFilter === "ALL" ? undefined : statusFilter, page);
      setItems(result.items ?? []);
      setUnread(result.unread_count ?? 0);
      setPartial(result.partial ?? false);
      setHasMore(result.has_more ?? false);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    let active = true;
    async function fetchPrefs(): Promise<void> {
      try {
        if (typeof getNotificationPreferences === "function") {
          const res = await getNotificationPreferences();
          if (active && res) {
            setPreferences(res);
          }
        }
      } catch {
        // Fallback gracefully if API not ready
      }
    }
    void fetchPrefs();
    return () => {
      active = false;
    };
  }, []);

  async function read(id: string): Promise<void> {
    try {
      await markNotificationRead(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, status: "READ", read_at: new Date().toISOString() } : item)),
      );
      setUnread((current) => Math.max(0, current - 1));
      emitNotificationsChanged();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function readAll(): Promise<void> {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, status: "READ" })));
      setUnread(0);
      emitNotificationsChanged();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function handleTogglePref(key: keyof NotificationPreferences): Promise<void> {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    setPrefLoading(true);
    setPrefNote("");
    try {
      if (typeof updateNotificationPreferences === "function") {
        await updateNotificationPreferences({ [key]: updated[key] });
        setPrefNote("Đã lưu cài đặt");
        window.setTimeout(() => setPrefNote(""), 2500);
      }
    } catch (reason) {
      setPreferences(preferences);
      setPrefNote(errorText(reason));
    } finally {
      setPrefLoading(false);
    }
  }

  const filteredItems = items.filter((item) => matchesCategory(item, categoryFilter));

  return (
    <section className="route-shell activity-page" aria-labelledby="notifications-title">
      <header className="section-heading">
        <div>
          <span className="eyebrow">TRUNG TÂM THÔNG BÁO</span>
          <h1 id="notifications-title">Thông báo của bạn</h1>
          <p>Cập nhật mới nhất về các dịch vụ của bạn, chỉ xuất hiện một lần.</p>
        </div>
        <div className="history-header-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void readAll()}
            disabled={!unread || loading}
          >
            <CheckCheck size={16} /> Đọc tất cả
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadNotifications()}
            aria-label="Tải lại thông báo"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* 4 Category Filter Tabs */}
      <div className="notification-tabs" role="tablist" aria-label="Phân loại thông báo">
        <button
          className={categoryFilter === "ALL" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={categoryFilter === "ALL"}
          onClick={() => setCategoryFilter("ALL")}
        >
          Tất cả
        </button>
        <button
          className={categoryFilter === "BOOKING" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={categoryFilter === "BOOKING"}
          onClick={() => setCategoryFilter("BOOKING")}
        >
          Lịch hẹn
        </button>
        <button
          className={categoryFilter === "PROMOTION" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={categoryFilter === "PROMOTION"}
          onClick={() => setCategoryFilter("PROMOTION")}
        >
          Ưu đãi
        </button>
        <button
          className={categoryFilter === "SYSTEM" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={categoryFilter === "SYSTEM"}
          onClick={() => setCategoryFilter("SYSTEM")}
        >
          Hệ thống
        </button>
      </div>

      {/* Status sub-filter */}
      <div className="notification-filters" role="tablist" aria-label="Lọc trạng thái">
        <button
          className={statusFilter === "ALL" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={statusFilter === "ALL"}
          onClick={() => {
            setStatusFilter("ALL");
            setPage(1);
          }}
        >
          Tất cả
        </button>
        <button
          className={statusFilter === "UNREAD" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={statusFilter === "UNREAD"}
          onClick={() => {
            setStatusFilter("UNREAD");
            setPage(1);
          }}
        >
          Chưa đọc · {unread}
        </button>
        <button
          className={statusFilter === "READ" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={statusFilter === "READ"}
          onClick={() => {
            setStatusFilter("READ");
            setPage(1);
          }}
        >
          Đã đọc
        </button>
      </div>

      {partial ? (
        <p className="partial-note" role="status">
          Một số dịch vụ đang tạm thời chưa phản hồi; thông báo đã lưu vẫn được hiển thị.
        </p>
      ) : null}

      {loading ? (
        <p className="inline-note" aria-live="polite">
          Đang tải thông báo…
        </p>
      ) : error ? (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <button className="button button-secondary" type="button" onClick={() => void loadNotifications()}>
            Thử lại
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <Bell size={24} />
          <h2>Chưa có thông báo</h2>
          <p>Khi đơn hàng, chuyến xe hoặc lịch khám thay đổi, cập nhật sẽ xuất hiện ở đây.</p>
        </div>
      ) : (
        <>
          <div className="activity-list">
            {filteredItems.map((item) => (
              <NotificationRow key={item.id} item={item} onRead={() => void read(item.id)} />
            ))}
          </div>
          <nav className="history-pagination" aria-label="Phân trang thông báo">
            <button
              className="button button-secondary"
              type="button"
              disabled={page === 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Trang trước
            </button>
            <span>Trang {page}</span>
            <button
              className="button button-secondary"
              type="button"
              disabled={!hasMore || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Trang sau
            </button>
          </nav>
        </>
      )}

      {/* Notification Preferences Section */}
      <section className="notification-pref-toggles" aria-labelledby="notification-settings-title">
        <div className="settings-card-title">
          <Settings2 size={18} />
          <div>
            <h2 id="notification-settings-title">Cài đặt thông báo</h2>
            <p>Tùy chỉnh thông báo bạn muốn nhận trên thiết bị và email.</p>
          </div>
        </div>

        {prefNote ? (
          <p className="inline-note" role="status">
            {prefNote}
          </p>
        ) : null}

        <div className="pref-toggle-row">
          <div className="pref-toggle-info">
            <strong>Cập nhật lịch hẹn &amp; đơn hàng</strong>
            <span>Thông báo tình trạng chuyến xe, giao món, đặt chỗ và lịch khám.</span>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              aria-label="Cập nhật lịch hẹn & đơn hàng"
              checked={preferences.booking_updates}
              disabled={prefLoading}
              onChange={() => void handleTogglePref("booking_updates")}
            />
            <span className="switch-slider" />
          </label>
        </div>

        <div className="pref-toggle-row">
          <div className="pref-toggle-info">
            <strong>Ưu đãi &amp; khuyến mãi</strong>
            <span>Nhận tin voucher độc quyền, nhân đôi điểm và mã giảm giá.</span>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              aria-label="Ưu đãi & khuyến mãi"
              checked={preferences.promotions}
              disabled={prefLoading}
              onChange={() => void handleTogglePref("promotions")}
            />
            <span className="switch-slider" />
          </label>
        </div>

        <div className="pref-toggle-row">
          <div className="pref-toggle-info">
            <strong>Thông báo hệ thống</strong>
            <span>Cập nhật chính sách, bảo mật tài khoản và thông tin vận hành.</span>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              aria-label="Thông báo hệ thống"
              checked={preferences.system}
              disabled={prefLoading}
              onChange={() => void handleTogglePref("system")}
            />
            <span className="switch-slider" />
          </label>
        </div>

        <div className="pref-toggle-row">
          <div className="pref-toggle-info">
            <strong>Nhận thông báo qua email</strong>
            <span>Gửi hóa đơn điện tử và xác nhận giao dịch qua hòm thư.</span>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              aria-label="Nhận thông báo qua email"
              checked={preferences.email_enabled}
              disabled={prefLoading}
              onChange={() => void handleTogglePref("email_enabled")}
            />
            <span className="switch-slider" />
          </label>
        </div>
      </section>
    </section>
  );
}

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: () => void }) {
  const href =
    item.resource_type &&
    item.resource_id &&
    ["food_order", "ride_booking", "restaurant_reservation", "healthcare_appointment"].includes(item.resource_type)
      ? `/app/history/${item.resource_type}/${encodeURIComponent(item.resource_id)}`
      : undefined;
  const content = (
    <>
      <span className="activity-icon">
        <Bell size={17} />
      </span>
      <span className="activity-copy">
        <span className="activity-row-heading">
          <strong>{item.title}</strong>
          <span>{formatDate(item.created_at)}</span>
        </span>
        <p>{item.body}</p>
        <span className="activity-meta">
          <span>{item.status === "UNREAD" ? "Chưa đọc" : "Đã đọc"}</span>
          {href ? <span>Xem chi tiết →</span> : null}
        </span>
      </span>
    </>
  );
  return (
    <article className={`activity-row ${item.status === "UNREAD" ? "notification-unread" : ""}`}>
      {href ? (
        <Link href={href} onClick={item.status === "UNREAD" ? onRead : undefined}>
          {content}
        </Link>
      ) : (
        <button
          className="activity-row-button"
          type="button"
          onClick={item.status === "UNREAD" ? onRead : undefined}
        >
          {content}
        </button>
      )}
    </article>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
