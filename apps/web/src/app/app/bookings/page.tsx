"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  CarFront,
  Clock,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Stethoscope,
  Utensils,
  X,
} from "lucide-react";

import {
  cancelFoodOrder,
  cancelHealthcareAppointment,
  cancelRestaurantReservation,
  cancelRideBooking,
  errorText,
  listHistory,
  prepareFoodReorder,
  prepareHealthcareRebook,
  prepareRestaurantRebook,
  prepareRideRebook,
} from "@/lib/api-client";
import { formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
import { ReviewPrompt } from "@/features/product/review-prompt";
import type { FeedbackResourceType, HistoryItem, HistoryType, ProductOpsDomain } from "@/types";

type BookingTab = "upcoming" | "past" | "cancelled";

const TAB_STATUS_MAP: Record<BookingTab, string> = {
  upcoming: "CONFIRMED",
  past: "COMPLETED",
  cancelled: "CANCELLED",
};

const SERVICE_OPTIONS: Array<{ value: HistoryType | ""; label: string; icon: typeof CarFront }> = [
  { value: "", label: "Tất cả dịch vụ", icon: CalendarDays },
  { value: "ride_booking", label: "Chuyến xe", icon: CarFront },
  { value: "food_order", label: "Đồ ăn", icon: Utensils },
  { value: "restaurant_reservation", label: "Đặt bàn", icon: Calendar },
  { value: "healthcare_appointment", label: "Lịch khám", icon: Stethoscope },
];

export default function BookingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BookingTab>("upcoming");
  const [selectedService, setSelectedService] = useState<HistoryType | "">("");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Cancellation modal state
  const [cancellingItem, setCancellingItem] = useState<HistoryItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  // Review modal state
  const [reviewItem, setReviewItem] = useState<{
    id: string;
    domain: ProductOpsDomain;
    resourceType: FeedbackResourceType;
    name: string;
  } | null>(null);

  // Reorder state
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statusFilter = TAB_STATUS_MAP[activeTab];
      const result = await listHistory({
        status: statusFilter,
        service: selectedService || undefined,
        page,
        page_size: 15,
      });
      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.has_more);
    } catch (err) {
      setError(errorText(err));
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, selectedService]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTabChange = (tab: BookingTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleServiceChange = (service: HistoryType | "") => {
    setSelectedService(service);
    setPage(1);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingItem) return;
    setIsCancelling(true);
    setCancelError("");
    try {
      if (cancellingItem.type === "ride_booking") {
        await cancelRideBooking(cancellingItem.id);
      } else if (cancellingItem.type === "food_order") {
        await cancelFoodOrder(cancellingItem.id);
      } else if (cancellingItem.type === "restaurant_reservation") {
        await cancelRestaurantReservation(cancellingItem.id);
      } else if (cancellingItem.type === "healthcare_appointment") {
        await cancelHealthcareAppointment(Number(cancellingItem.id));
      }
      setCancellingItem(null);
      setCancelReason("");
      await load();
    } catch (err) {
      setCancelError(errorText(err));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReorder = async (item: HistoryItem) => {
    setReorderingId(item.id);
    try {
      if (item.type === "ride_booking") {
        await prepareRideRebook(item.id);
      } else if (item.type === "food_order") {
        await prepareFoodReorder(item.id);
      } else if (item.type === "restaurant_reservation") {
        await prepareRestaurantRebook(item.id);
      } else if (item.type === "healthcare_appointment") {
        await prepareHealthcareRebook(item.id);
      }
      router.push("/app");
    } catch (err) {
      alert(errorText(err));
    } finally {
      setReorderingId(null);
    }
  };

  const domainFromType = (type: HistoryType): "food" | "ride" | "restaurant" | "healthcare" => {
    if (type === "ride_booking") return "ride";
    if (type === "food_order") return "food";
    if (type === "restaurant_reservation") return "restaurant";
    return "healthcare";
  };

  return (
    <div className="route-shell bookings-page">
      <header className="section-heading">
        <div>
          <span className="eyebrow">QUẢN LÝ TẬP TRUNG</span>
          <h1>Lịch hẹn & Đơn hàng</h1>
          <p>Theo dõi các chuyến xe, đơn đồ ăn, bàn tiệc và lịch khám bệnh của bạn tại một nơi.</p>
        </div>
        <div className="bookings-header-actions">
          <Link className="button button-primary" href="/app">
            <Plus size={16} /> Đặt dịch vụ mới
          </Link>
          <button className="icon-button" type="button" onClick={() => void load()} aria-label="Làm mới">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* Main Tabs: Sắp tới, Lịch sử, Đã hủy */}
      <div className="booking-tabs-bar">
        <div className="booking-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "upcoming"}
            className={`booking-tab${activeTab === "upcoming" ? " active" : ""}`}
            onClick={() => handleTabChange("upcoming")}
          >
            <Clock size={16} />
            <span>Sắp tới</span>
            {activeTab === "upcoming" && total > 0 && <span className="tab-badge">{total}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "past"}
            className={`booking-tab${activeTab === "past" ? " active" : ""}`}
            onClick={() => handleTabChange("past")}
          >
            <RotateCcw size={16} />
            <span>Lịch sử</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "cancelled"}
            className={`booking-tab${activeTab === "cancelled" ? " active" : ""}`}
            onClick={() => handleTabChange("cancelled")}
          >
            <X size={16} />
            <span>Đã hủy</span>
          </button>
        </div>

        {/* Filter by domain */}
        <div className="booking-service-filters" aria-label="Lọc theo dịch vụ">
          {SERVICE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedService === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`booking-filter-chip${isSelected ? " is-selected" : ""}`}
                onClick={() => handleServiceChange(opt.value)}
              >
                <Icon size={14} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="bookings-loading">
          <div className="booking-skeleton" />
          <div className="booking-skeleton" />
          <div className="booking-skeleton" />
        </div>
      ) : error ? (
        <div className="error-panel" role="alert">
          <AlertCircle size={20} />
          <p>{error}</p>
          <button className="button button-secondary" type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={32} />
          <h2>
            {activeTab === "upcoming"
              ? "Chưa có lịch hẹn nào sắp tới"
              : activeTab === "past"
              ? "Chưa có lịch sử hoàn tất"
              : "Không có lịch hẹn đã hủy"}
          </h2>
          <p>
            {activeTab === "upcoming"
              ? "Đặt ngay chuyến xe, bữa ăn hoặc lịch khám sức khỏe cùng trợ lý X-One."
              : "Các dịch vụ sau khi thực hiện xong sẽ được lưu lại đây để bạn dễ dàng đặt lại hoặc đánh giá."}
          </p>
          <Link className="button button-primary" href="/app">
            <Sparkles size={16} /> Bắt đầu với Trợ lý AI
          </Link>
        </div>
      ) : (
        <div className="bookings-grid">
          {items.map((item) => (
            <BookingCard
              key={`${item.type}-${item.id}`}
              item={item}
              isUpcoming={activeTab === "upcoming"}
              onCancel={() => {
                setCancellingItem(item);
                setCancelError("");
                setCancelReason("");
              }}
              onReorder={() => void handleReorder(item)}
              isReordering={reorderingId === item.id}
              onReview={() => {
                const summary = bookingSummary(item);
                setReviewItem({
                  id: item.id,
                  domain: domainFromType(item.type),
                  resourceType: item.type as FeedbackResourceType,
                  name: summary.title,
                });
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 15 && (
        <div className="history-pagination">
          <button
            className="button button-secondary"
            type="button"
            disabled={page === 1 || loading}
            onClick={() => setPage((c) => c - 1)}
          >
            Trang trước
          </button>
          <span>Trang {page}</span>
          <button
            className="button button-secondary"
            type="button"
            disabled={!hasMore || loading}
            onClick={() => setPage((c) => c + 1)}
          >
            Trang sau
          </button>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      {cancellingItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="cancel-title">Xác nhận hủy lịch hẹn</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCancellingItem(null)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Bạn có chắc chắn muốn hủy dịch vụ <strong>{bookingSummary(cancellingItem).title}</strong>?
              </p>
              <p className="inline-note">
                Chính sách: Miễn phí hủy trước 2 giờ khởi hành hoặc lịch hẹn.
              </p>
              <label className="field-label">
                <span>Lý do hủy (tùy chọn):</span>
                <textarea
                  className="field-textarea"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="VD: Thay đổi kế hoạch cá nhân, bận việc đột xuất..."
                />
              </label>
              {cancelError && <p className="error-text">{cancelError}</p>}
            </div>
            <div className="modal-footer">
              <button
                className="button button-secondary"
                type="button"
                disabled={isCancelling}
                onClick={() => setCancellingItem(null)}
              >
                Giữ lại lịch
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={isCancelling}
                onClick={() => void handleConfirmCancel()}
              >
                {isCancelling ? "Đang hủy..." : "Xác nhận hủy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Dialog from Phase 4 */}
      {reviewItem && (
        <ReviewPrompt
          open={true}
          bookingId={reviewItem.id}
          serviceType={reviewItem.domain}
          serviceName={reviewItem.name}
          resourceType={reviewItem.resourceType}
          onClose={() => setReviewItem(null)}
        />
      )}
    </div>
  );
}

function BookingCard({
  item,
  isUpcoming,
  onCancel,
  onReorder,
  isReordering,
  onReview,
}: {
  item: HistoryItem;
  isUpcoming: boolean;
  onCancel: () => void;
  onReorder: () => void;
  isReordering: boolean;
  onReview: () => void;
}) {
  const summary = bookingSummary(item);
  const serviceKey = item.type.split("_")[0];
  const Icon = item.type === "ride_booking" ? CarFront : item.type === "food_order" ? Utensils : item.type === "restaurant_reservation" ? CalendarDays : Stethoscope;

  return (
    <article className={`booking-card booking-service-${serviceKey}`}>
      <div className="booking-card-header">
        <div className="booking-card-service">
          <span className={`booking-service-badge badge-${serviceKey}`}>
            <Icon size={14} />
            <span>{serviceLabel(item.type)}</span>
          </span>
          <span className={`status-pill status-${item.status.toLowerCase()}`}>
            {statusLabel(item.status)}
          </span>
        </div>
        {isUpcoming && <CountdownTimer targetTime={item.timestamp} />}
      </div>

      <div className="booking-card-content">
        <h3 className="booking-card-title">{summary.title}</h3>
        <p className="booking-card-detail">{summary.detail}</p>
        <div className="booking-card-meta">
          <span className="booking-meta-item">
            <Clock size={13} />
            <span>{formatDateTime(item.timestamp)}</span>
          </span>
          {summary.location && (
            <span className="booking-meta-item">
              <MapPin size={13} />
              <span className="meta-truncate">{summary.location}</span>
            </span>
          )}
        </div>
      </div>

      <div className="booking-card-actions">
        {isUpcoming ? (
          <>
            <button className="button button-danger-ghost button-sm" type="button" onClick={onCancel}>
              Hủy lịch
            </button>
            <Link
              className="button button-secondary button-sm"
              href={`/app/history/${item.type}/${encodeURIComponent(item.id)}`}
            >
              Chi tiết <ExternalLink size={13} />
            </Link>
          </>
        ) : (
          <>
            <button
              className="button button-secondary button-sm"
              type="button"
              disabled={isReordering}
              onClick={onReorder}
            >
              <RotateCcw size={13} /> {isReordering ? "Đang xử lý..." : "Đặt lại"}
            </button>
            {item.status === "COMPLETED" && (
              <button className="button button-primary button-sm" type="button" onClick={onReview}>
                <Star size={13} /> Đánh giá
              </button>
            )}
            <Link
              className="button button-ghost button-sm"
              href={`/app/history/${item.type}/${encodeURIComponent(item.id)}`}
            >
              Chi tiết <ExternalLink size={13} />
            </Link>
          </>
        )}
      </div>
    </article>
  );
}

function CountdownTimer({ targetTime }: { targetTime: string }) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; passed: boolean }>({
    hours: 0,
    minutes: 0,
    passed: false,
  });

  useEffect(() => {
    const calculate = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, passed: true });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft({ hours, minutes, passed: false });
    };

    calculate();
    const interval = setInterval(calculate, 60_000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (timeLeft.passed) {
    return <span className="countdown-pill is-due">Đang diễn ra</span>;
  }

  const isUrgent = timeLeft.hours === 0 && timeLeft.minutes < 60;

  return (
    <span className={`countdown-pill${isUrgent ? " is-urgent" : ""}`}>
      <Clock size={12} />
      <span>
        Còn {timeLeft.hours > 0 ? `${timeLeft.hours}g ` : ""}
        {timeLeft.minutes}p
      </span>
    </span>
  );
}

function serviceLabel(type: HistoryType): string {
  switch (type) {
    case "ride_booking":
      return "Chuyến xe";
    case "food_order":
      return "Đơn đồ ăn";
    case "restaurant_reservation":
      return "Đặt bàn";
    case "healthcare_appointment":
      return "Lịch khám";
    default:
      return "Dịch vụ";
  }
}

function bookingSummary(item: HistoryItem): { title: string; detail: string; location?: string } {
  const resource = item.resource;
  if (item.type === "ride_booking") {
    const snap = (typeof resource.quote === "object" && resource.quote !== null
      ? resource.quote
      : typeof resource.snapshot === "object" && resource.snapshot !== null
      ? resource.snapshot
      : resource) as Record<string, unknown>;
    const pickup = optionalText(snap.pickup_address ?? snap.pickup ?? resource.pickup_address ?? resource.pickup, "Điểm đón");
    const dropoff = optionalText(snap.dropoff_address ?? snap.dropoff ?? resource.dropoff_address ?? resource.dropoff, "Điểm đến");
    const fare = formatMoney(snap.amount ?? snap.fare ?? resource.amount ?? resource.fare, String(snap.currency ?? resource.currency ?? "VND"));
    const vehicle = optionalText(snap.vehicle_type ?? snap.vehicle ?? resource.vehicle_type ?? resource.vehicle, "Xe");
    return {
      title: `${pickup} → ${dropoff}`,
      detail: `${fare} · ${vehicle}`,
      location: pickup,
    };
  }
  if (item.type === "food_order") {
    const name = nestedName(resource.restaurant) || optionalText(resource.restaurant_name, "Đơn đồ ăn");
    const total = formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"));
    const count = Array.isArray(resource.items) ? `${resource.items.length} món` : "Nhiều món";
    return {
      title: name,
      detail: `${count} · ${total}`,
      location: optionalText(resource.delivery_address, undefined),
    };
  }
  if (item.type === "restaurant_reservation") {
    const name = nestedName(resource.restaurant) || optionalText(resource.name, "Đặt bàn nhà hàng");
    const party = resource.party_size ? `${String(resource.party_size)} người` : "Bàn";
    return {
      title: name,
      detail: `Tiệc ${party}`,
      location: optionalText(resource.address, undefined),
    };
  }
  const facility = nestedName(resource.facility) || optionalText(resource.facility_name, "Lịch khám");
  const doctor = optionalText(resource.doctor_name ?? resource.doctor, "Bác sĩ phụ trách");
  const dept = optionalText(resource.department, "Chuyên khoa");
  return {
    title: `${dept} - ${facility}`,
    detail: doctor,
    location: optionalText(resource.address, facility),
  };
}

function nestedName(value: unknown): string {
  return isRecord(value) ? optionalText(value.name ?? value.title, "") : typeof value === "string" ? value : "";
}
