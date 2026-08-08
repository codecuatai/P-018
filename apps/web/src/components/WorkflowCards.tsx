import type { ReactNode } from "react";
import { CheckCircle2, Clock3, CreditCard, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { asArray, asRecord, numberValue, stringValue } from "../api";
import type { Domain, DomainSession, WorkflowAction } from "../types";

interface WorkflowCardsProps {
  domain: Domain;
  payload?: Record<string, unknown>;
  session: DomainSession;
  onAction: (action: WorkflowAction) => void;
}

type CardProps = {
  payload: Record<string, unknown>;
  session: DomainSession;
  onAction: (action: WorkflowAction) => void;
};

export function WorkflowCards({ domain, payload, session, onAction }: WorkflowCardsProps) {
  if (!payload) return null;
  if (domain === "ride") return <RideCard payload={payload} session={session} onAction={onAction} />;
  if (domain === "food") return <FoodCard payload={payload} session={session} onAction={onAction} />;
  if (domain === "restaurant") return <RestaurantCard payload={payload} session={session} onAction={onAction} />;
  return <HealthcareCard payload={payload} session={session} onAction={onAction} />;
}

function RideCard({ payload, session, onAction }: CardProps) {
  const quote = asRecord(payload.quote);
  const booking = asRecord(payload.booking);
  const driver = asRecord(booking?.driver);
  const stage = stringValue(payload.stage);
  const vehicle = vehicleLabel(stringValue(quote?.vehicle_type));
  const isCompleted = stage === "COMPLETED" && stringValue(booking?.status) === "DRIVER_ASSIGNED";
  const isLatest = session.lastPayload === payload;

  return (
    <article className="workflow-card workflow-card-ride">
      <CardHeader icon={<Sparkles size={17} />} eyebrow="RIDE · DỮ LIỆU GATEWAY" title={isCompleted ? "Chuyến xe đã hoàn tất" : "Báo giá chuyến xe"} />
      {quote ? (
        <div className="detail-grid">
          <Detail label="Điểm đón" value={stringValue(quote.pickup_address, "Chưa có dữ liệu")} icon={<MapPin size={15} />} />
          <Detail label="Điểm đến" value={stringValue(quote.dropoff_address, "Chưa có dữ liệu")} icon={<MapPin size={15} />} />
          <Detail label="Loại xe" value={vehicle} />
          <Detail label="Thời gian dự kiến" value={`${numberValue(quote.duration_minutes) ?? "—"} phút`} />
          <Detail label="Khoảng cách" value={`${numberValue(quote.distance_km) ?? "—"} km`} />
          <Detail label="Giá Gateway" value={money(quote.amount, stringValue(quote.currency, "VND"))} emphasized />
        </div>
      ) : null}
      {booking ? (
        <div className="result-strip">
          <div><span>Mã booking</span><strong>{stringValue(booking.id, "Chưa có")}</strong></div>
          <div><span>Trạng thái</span><strong>{rideStatus(stringValue(booking.status))}</strong></div>
          {driver ? <div><span>Tài xế</span><strong>{driverName(driver)}</strong></div> : null}
        </div>
      ) : null}
      {isCompleted && driver ? (
        <div className="success-note"><CheckCircle2 size={16} /> Tài xế đã được Gateway gán cho booking này.</div>
      ) : null}
      {isLatest && stage === "SERVICE_CONFIRMATION" && quote ? (
        <ActionRow
          label="Xác nhận chuyến"
          hint="Bước này chỉ xác nhận hành trình và báo giá; thanh toán là bước riêng."
          onClick={() => onAction({ type: "ride-confirm", domain: "ride" })}
          disabled={session.isSending}
        />
      ) : null}
      {isLatest && stage === "PAYMENT_CONFIRMATION" && booking ? (
        <ActionRow
          label="Xác nhận thanh toán demo"
          hint="Gateway sẽ thực hiện bước thanh toán sandbox và hoàn tất booking."
          onClick={() => onAction({ type: "ride-payment", domain: "ride" })}
          disabled={session.isSending}
          icon={<CreditCard size={16} />}
        />
      ) : null}
    </article>
  );
}

function FoodCard({ payload, session, onAction }: CardProps) {
  const state = asRecord(payload.state_updates) ?? {};
  const candidates = records(state.restaurant_candidates ?? payload.restaurant_candidates);
  const menuItems = records(state.menu_items ?? state.menu ?? payload.menu_items);
  const cart = asRecord(state.cart ?? payload.cart);
  const cartItems = records(cart?.items ?? state.cart_items ?? payload.cart_items);
  const preview = asRecord(state.order_preview ?? payload.order_preview);
  const order = asRecord(payload.order);
  const payment = asRecord(payload.payment);
  const pending = asRecord(payload.pending_confirmation);
  const isLatest = session.lastPayload === payload;

  return (
    <article className="workflow-card workflow-card-food">
      <CardHeader icon={<Sparkles size={17} />} eyebrow="FOOD · PHIÊN HỘI THOẠI" title={foodTitle(payload, order)} />
      {candidates.length > 0 ? (
        <div className="structured-list">
          <span className="card-label">Quán được tìm thấy</span>
          {candidates.slice(0, 5).map((candidate, index) => (
            <div className="structured-row" key={`${stringValue(candidate.id, "candidate")}-${index}`}>
              <div><strong>{stringValue(candidate.name, stringValue(candidate.restaurant_name, "Quán ăn"))}</strong><span>{stringValue(candidate.address, stringValue(candidate.location, "Địa chỉ do Gateway cung cấp"))}</span></div>
              <span className="row-value">{formatMaybeMoney(candidate.price ?? candidate.min_price)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {menuItems.length > 0 ? (
        <div className="structured-list">
          <span className="card-label">Món / lựa chọn</span>
          {menuItems.slice(0, 6).map((item, index) => (
            <div className="structured-row" key={`${stringValue(item.id, "item")}-${index}`}>
              <div><strong>{stringValue(item.name, stringValue(item.title, "Món ăn"))}</strong><span>{stringValue(item.description, "")}</span></div>
              <span className="row-value">{formatMaybeMoney(item.price)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {cart || cartItems.length > 0 ? (
        <div className="summary-box">
          <div className="summary-box-heading"><span>Giỏ hàng</span><strong>{stringValue(cart?.restaurant_name, "Đơn nháp từ Food")}</strong></div>
          {cartItems.slice(0, 5).map((item, index) => (
            <div className="summary-line" key={`${stringValue(item.id, "cart-item")}-${index}`}>
              <span>{stringValue(item.name, stringValue(item.title, "Món ăn"))} × {numberValue(item.quantity) ?? 1}</span>
              <strong>{formatMaybeMoney(item.total ?? item.amount ?? item.price)}</strong>
            </div>
          ))}
          <div className="summary-total"><span>Tổng từ Gateway</span><strong>{formatMaybeMoney(cart?.total ?? cart?.grand_total ?? preview?.total)}</strong></div>
        </div>
      ) : null}
      {preview ? (
        <div className="summary-box accent-box">
          <div className="summary-box-heading"><span>Đơn hàng cần xác nhận</span><strong>{stringValue(preview.restaurant_name, stringValue(preview.restaurant, "Food"))}</strong></div>
          <div className="summary-line"><span>Địa chỉ giao</span><strong>{stringValue(preview.address, stringValue(preview.delivery_address, "Theo lựa chọn của bạn"))}</strong></div>
          <div className="summary-total"><span>Tổng tiền</span><strong>{formatMaybeMoney(preview.total ?? preview.amount)}</strong></div>
        </div>
      ) : null}
      {isLatest && pending && stringValue(pending.action) === "PLACE_FOOD_ORDER" && session.pendingConfirmationId === stringValue(pending.id) ? (
        <ActionRow
          label="Xác nhận đặt món"
          hint="Thanh toán card demo và tạo order bằng đúng confirmation của Gateway."
          onClick={() => onAction({ type: "food-confirm", domain: "food" })}
          disabled={session.isSending}
          icon={<ShieldCheck size={16} />}
        />
      ) : null}
      {order ? <OrderResult order={order} payment={payment} /> : null}
    </article>
  );
}

function RestaurantCard({ payload, session, onAction }: CardProps) {
  const result = asRecord(payload.tool_result);
  const items = result ? records(result.items) : records(payload.tool_result);
  const request = asRecord(payload.tool_request);
  const args = asRecord(request?.arguments);
  const pending = asRecord(payload.pending_confirmation);
  const status = stringValue(payload.status);
  const confirmedReservation = result && stringValue(result.status) === "CONFIRMED";
  const isLatest = session.lastPayload === payload;

  return (
    <article className="workflow-card workflow-card-restaurant">
      <CardHeader icon={<Clock3 size={17} />} eyebrow="RESTAURANT · ĐẶT BÀN" title={confirmedReservation ? "Đặt bàn thành công" : "Tiến trình đặt bàn"} />
      {items.length > 0 ? (
        <div className="structured-list">
          <span className="card-label">Nhà hàng phù hợp</span>
          {items.slice(0, 5).map((item, index) => (
            <div className="structured-row" key={`${stringValue(item.id, "restaurant")}-${index}`}>
              <div><strong>{stringValue(item.name, stringValue(item.restaurant_name, "Nhà hàng"))}</strong><span>{stringValue(item.address, stringValue(item.location, "Thông tin do Gateway cung cấp"))}</span></div>
              <span className="row-value">{stringValue(item.cuisine_type, "")}</span>
            </div>
          ))}
        </div>
      ) : null}
      {result ? (
        <div className="result-strip">
          <div><span>Trạng thái</span><strong>{restaurantStatus(stringValue(result.status, status))}</strong></div>
          {result.available !== undefined ? <div><span>Khả dụng</span><strong>{result.available === true ? "Có bàn" : "Chưa có"}</strong></div> : null}
          {result.hold_id ? <div><span>Mã giữ bàn</span><strong>{stringValue(result.hold_id)}</strong></div> : null}
          {confirmedReservation ? <div><span>Mã đặt chỗ</span><strong>{stringValue(result.id, stringValue(result.code, "Đã lưu"))}</strong></div> : null}
        </div>
      ) : null}
      {isLatest && pending && status === "CONFIRMATION_REQUIRED" ? (
        <div className="summary-box accent-box">
          <div className="summary-box-heading"><span>Xác nhận cuối</span><strong>Đặt bàn sau khi giữ chỗ</strong></div>
          <div className="summary-line"><span>Số khách</span><strong>{stringValue(args?.party_size, "Theo yêu cầu")}</strong></div>
          <div className="summary-line"><span>Thời gian</span><strong>{formatDateTime(args?.start_at)}</strong></div>
          <div className="summary-line"><span>Confirmation</span><strong>{stringValue(pending.id, "Đã tạo")}</strong></div>
        </div>
      ) : null}
      {isLatest && pending && status === "CONFIRMATION_REQUIRED" && session.pendingConfirmationId === stringValue(pending.id) ? (
        <ActionRow
          label="Xác nhận đặt bàn"
          hint="Chỉ thao tác này mới tạo reservation trong Restaurant Service."
          onClick={() => onAction({ type: "restaurant-confirm", domain: "restaurant" })}
          disabled={session.isSending}
          icon={<ShieldCheck size={16} />}
        />
      ) : null}
      {confirmedReservation ? <div className="success-note"><CheckCircle2 size={16} /> Reservation đã được backend xác nhận.</div> : null}
    </article>
  );
}

function HealthcareCard({ payload, session, onAction }: CardProps) {
  const toolResult = asRecord(payload.tool_result);
  const appointment = asRecord(payload.appointment) ?? asRecord(toolResult?.appointment) ?? (toolResult?.status ? toolResult : undefined);
  const pending = asRecord(payload.pending_confirmation);
  const departments = records(payload.departments);
  const candidates = records(payload.candidates ?? payload.doctors);
  const payment = asRecord(payload.payment);
  const isPaymentRequired = payload.payment_required === true || stringValue(payload.status) === "PAYMENT_REQUIRED";
  const isPaid = stringValue(payment?.status) === "SUCCEEDED" || appointment?.is_paid === true;
  const isConfirmed = stringValue(appointment?.status) === "CONFIRMED";
  const appointmentId = numberValue(appointment?.appointment_id ?? appointment?.id);
  const isLatest = session.lastPayload === payload;

  return (
    <article className="workflow-card workflow-card-healthcare">
      <CardHeader icon={<ShieldCheck size={17} />} eyebrow="HEALTHCARE · LỊCH KHÁM" title={isConfirmed ? "Lịch khám đã xác nhận" : "Tiến trình lịch khám"} />
      {departments.length > 0 ? (
        <div className="structured-list">
          <span className="card-label">Chọn khoa</span>
          {departments.slice(0, 6).map((department, index) => {
            const name = stringValue(department.name, stringValue(department.department, "Khoa khám"));
            return (
              <button className="select-row" key={`${name}-${index}`} onClick={() => onAction({ type: "message", domain: "healthcare", text: `Chọn khoa ${name}`, context: healthcareContext(payload, { department: name }) })} type="button" disabled={session.isSending || !isLatest}>
                <span><strong>{name}</strong><small>{stringValue(department.description, "Xem bác sĩ và khung giờ khả dụng")}</small></span>
                <span aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {candidates.length > 0 ? (
        <div className="structured-list">
          <span className="card-label">Bác sĩ và khung giờ</span>
          {candidates.slice(0, 8).map((candidate, index) => {
            const slot = asRecord(candidate.slot) ?? candidate;
            const doctorName = stringValue(candidate.doctor_name, stringValue(candidate.name, "Bác sĩ"));
            const department = stringValue(candidate.department, stringValue(asRecord(candidate.doctor)?.department, stringValue(asRecord(payload.slots)?.department, "Khoa khám")));
            const slotId = numberValue(slot.id);
            const price = candidate.price ?? asRecord(candidate.doctor)?.price;
            return (
              <div className="candidate-row" key={`${slotId ?? index}-${doctorName}`}>
                <div><strong>{doctorName}</strong><span>{department} · {formatDateTime(slot.start_at ?? slot.starts_at ?? slot.datetime)}</span></div>
                <div className="candidate-action"><strong>{formatMaybeMoney(price)}</strong>{slotId ? <button className="button button-small" type="button" disabled={session.isSending || !isLatest} onClick={() => onAction({ type: "message", domain: "healthcare", text: `Tôi muốn đặt lịch với bác sĩ ${doctorName}, xác nhận giữ slot id ${slotId}`, context: healthcareContext(payload, { department, slot_id: slotId }) })}>Giữ giờ này</button> : null}</div>
              </div>
            );
          })}
        </div>
      ) : null}
      {appointment ? (
        <div className="summary-box">
          <div className="summary-box-heading"><span>Lịch hẹn</span><strong>#{stringValue(appointment.appointment_id, stringValue(appointment.id, "—"))}</strong></div>
          <div className="summary-line"><span>Bác sĩ</span><strong>{stringValue(asRecord(appointment.doctor)?.name, stringValue(appointment.doctor_name, "Theo lựa chọn"))}</strong></div>
          <div className="summary-line"><span>Trạng thái</span><strong>{stringValue(appointment.status, "DRAFT")}</strong></div>
          <div className="summary-line"><span>Chi phí</span><strong>{formatMaybeMoney(appointment.price)}</strong></div>
          {appointment.slot ? <div className="summary-line"><span>Khung giờ</span><strong>{formatDateTime(asRecord(appointment.slot)?.start_at ?? asRecord(appointment.slot)?.starts_at)}</strong></div> : null}
        </div>
      ) : null}
      {isLatest && isPaymentRequired && appointmentId ? (
        <ActionRow
          label="Thanh toán demo"
          hint="Đây là payment acknowledgement sandbox của Healthcare, chưa phải cổng thanh toán bệnh viện."
          onClick={() => onAction({ type: "healthcare-payment", domain: "healthcare" })}
          disabled={session.isSending}
          icon={<CreditCard size={16} />}
        />
      ) : null}
      {isLatest && isPaid && !pending && !isConfirmed && appointmentId ? (
        <ActionRow
          label="Tiếp tục xác nhận lịch"
          hint="Lấy confirmation cuối từ Gateway trước khi tạo appointment chính thức."
          onClick={() => onAction({ type: "message", domain: "healthcare", text: `Xác nhận lịch hẹn appointment id ${appointmentId}`, context: healthcareContext(payload, { appointment_id: appointmentId }) })}
          disabled={session.isSending}
        />
      ) : null}
      {isLatest && pending && session.pendingConfirmationId === stringValue(pending.id) ? (
        <ActionRow
          label="Xác nhận đặt lịch"
          hint="Chỉ backend success với trạng thái CONFIRMED mới hoàn tất lịch khám."
          onClick={() => onAction({ type: "healthcare-confirm", domain: "healthcare" })}
          disabled={session.isSending}
          icon={<ShieldCheck size={16} />}
        />
      ) : null}
      {isConfirmed ? <div className="success-note"><CheckCircle2 size={16} /> Appointment đã được Healthcare Service xác nhận.</div> : null}
    </article>
  );
}

function OrderResult({ order, payment }: { order: Record<string, unknown>; payment?: Record<string, unknown> }) {
  return (
    <div className="result-strip result-strip-success">
      <div><span>Mã order</span><strong>{stringValue(order.id, "Chưa có")}</strong></div>
      <div><span>Order</span><strong>{stringValue(order.status, "Đã nhận")}</strong></div>
      <div><span>Payment</span><strong>{stringValue(payment?.status, "Đã ghi nhận")}</strong></div>
      <div><span>Số tiền</span><strong>{formatMaybeMoney(order.amount ?? order.total)}</strong></div>
    </div>
  );
}

function CardHeader({ icon, eyebrow, title }: { icon: ReactNode; eyebrow: string; title: string }) {
  return <div className="workflow-card-header"><div className="workflow-card-icon">{icon}</div><div><span className="card-eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>;
}

function Detail({ label, value, icon, emphasized }: { label: string; value: string; icon?: ReactNode; emphasized?: boolean }) {
  return <div className={`detail-item ${emphasized ? "emphasized" : ""}`}><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function ActionRow({ label, hint, onClick, disabled, icon }: { label: string; hint: string; onClick: () => void; disabled: boolean; icon?: React.ReactNode }) {
  return <div className="confirmation-row"><div><strong>{label}</strong><span>{hint}</span></div><button className="button button-primary" type="button" onClick={onClick} disabled={disabled}>{disabled ? "Đang xử lý…" : icon}{label}</button></div>;
}

function records(value: unknown): Record<string, unknown>[] {
  return asArray(value).filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
}

function money(value: unknown, currency: string): string {
  const amount = numberValue(value);
  if (amount === undefined) return "—";
  try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount); } catch { return `${amount.toLocaleString("vi-VN")} ${currency}`; }
}

function formatMaybeMoney(value: unknown): string {
  if (isMoneyObject(value)) return money(value.amount, stringValue(value.currency, "VND"));
  return money(value, "VND");
}

function isMoneyObject(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  return Boolean(record && numberValue(record.amount) !== undefined);
}

function formatDateTime(value: unknown): string {
  const text = stringValue(value);
  if (!text) return "Theo yêu cầu";
  const time = new Date(text);
  if (Number.isNaN(time.getTime())) return text;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

function vehicleLabel(value: string): string {
  if (value === "CAR_7") return "Xe 7 chỗ";
  if (value === "BIKE") return "Xe máy";
  if (value === "CAR_4") return "Xe 4 chỗ";
  return value || "Theo lựa chọn";
}

function rideStatus(value: string): string {
  if (value === "AWAITING_PAYMENT_CONFIRMATION") return "Chờ thanh toán demo";
  if (value === "DRIVER_ASSIGNED") return "Đã gán tài xế";
  return value || "Đang xử lý";
}

function restaurantStatus(value: string): string {
  if (value === "ACTIVE") return "Đang giữ bàn";
  if (value === "CONFIRMED") return "Đã xác nhận";
  return value || "Đang xử lý";
}

function driverName(driver: Record<string, unknown>): string {
  return stringValue(driver.name, stringValue(driver.driver_name, stringValue(driver.full_name, "Tài xế đã gán")));
}

function foodTitle(payload: Record<string, unknown>, order?: Record<string, unknown>): string {
  if (order) return "Đơn đồ ăn đã được Gateway tiếp nhận";
  const type = stringValue(payload.response_type);
  if (type === "confirmation_form") return "Đơn hàng cần xác nhận";
  if (type === "order_preview") return "Xem lại đơn hàng";
  return "Thông tin đồ ăn từ Gateway";
}

function healthcareContext(payload: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const slots = asRecord(payload.slots) ?? {};
  const appointment = asRecord(payload.appointment);
  const patientId = numberValue(payload.patient_id) ?? numberValue(slots.patient_id) ?? 1;
  return {
    slots: { ...slots, ...(extra.department ? { department: extra.department } : {}), ...(extra.slot_id ? { slot_id: extra.slot_id } : {}), ...(extra.appointment_id ? { appointment_id: extra.appointment_id } : {}), patient_id: patientId },
    patient_id: patientId,
    appointment_id: extra.appointment_id ?? appointment?.appointment_id ?? appointment?.id ?? null,
    symptoms: stringValue(payload.symptoms, "dau bung"),
    tool_name: stringValue(asRecord(payload.tool_request)?.tool_name, "healthcare.list_slots"),
    tool_result: payload.tool_result ?? null,
  };
}
