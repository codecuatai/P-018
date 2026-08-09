import { CalendarDays, CarFront, Check, CircleDollarSign, MapPin, ShieldCheck, Soup, Stethoscope, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { isKnownAssistantItem, type AssistantAction, type AssistantHealthcareItem, type AssistantHealthcareOptionsItem, type AssistantItem, type AssistantRestaurantConfirmationItem, type AssistantRestaurantOptionsItem, type AssistantResponse, type AssistantRideItem, type AssistantRideTimingConflictItem, type AssistantFoodItem } from "../types";

export function AssistantCards({ response, onAction, disabledActionId }: { response: AssistantResponse; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const secondaryActions = response.actions.filter((action) => action.kind !== "select_restaurant" && action.kind !== "select_healthcare_slot");
  return <div className="assistant-cards">
    {response.items.map((item, index) => <AssistantCard key={`${item.kind}-${index}`} item={item} actions={response.actions} onAction={onAction} disabledActionId={disabledActionId} />)}
    {secondaryActions.length > 0 ? <div className="action-list">{secondaryActions.map((action) => <button className="card-action" key={action.id} type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}><ShieldCheck size={15} /> {action.label}</button>)}</div> : null}
  </div>;
}

function AssistantCard({ item, actions, onAction, disabledActionId }: { item: AssistantItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  if (!isKnownAssistantItem(item)) return <FallbackCard item={item} />;
  switch (item.kind) {
    case "restaurant_options":
    case "restaurant_unavailable":
      return <RestaurantCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
    case "restaurant_confirmation":
    case "reservation":
      return <RestaurantConfirmation item={item} />;
    case "ride_quote":
    case "ride_booking":
      return <RideCard item={item} />;
    case "ride_timing_conflict":
      return <RideTimingConflictCard item={item} />;
    case "healthcare_options":
    case "healthcare_no_availability":
      return <HealthcareCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
    case "appointment":
    case "healthcare_confirmation":
    case "appointment_confirmed":
      return <HealthcareAppointment item={item} />;
    case "food_options":
    case "food_confirmation":
    case "food_order":
    case "food_empty":
      return <FoodCard item={item} />;
    case "progress":
    case "clarification":
      return <SimpleCard item={item} />;
    default:
      return assertNever(item);
  }
}

function RestaurantCard({ item, actions, onAction, disabledActionId }: { item: AssistantRestaurantOptionsItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const selectionActions = actions.filter((action) => action.kind === "select_restaurant");
  return <article className="assistant-card card-restaurant"><CardHeading icon={<CalendarDays size={17} />} label="Nhà hàng" title={item.title} />
    {item.options?.length ? <div className="option-list">{item.options.map((option, index) => <div className="option-row" key={`${String(option.name)}-${index}`}><div><strong>{text(option.name, "Nhà hàng")}</strong><span><MapPin size={13} /> {text(option.location, "Địa điểm đang được cập nhật")}</span></div>{selectionActions[index] ? <button className="small-action" type="button" onClick={() => onAction(selectionActions[index])} disabled={Boolean(disabledActionId)}>Chọn quán</button> : option.rating !== undefined ? <b>{String(option.rating)} ★</b> : null}</div>)}</div> : <p className="card-note">Mình đang cập nhật thêm lựa chọn cho bạn.</p>}
    {item.note ? <p className="card-note">{text(item.note)}</p> : null}
  </article>;
}

function RestaurantConfirmation({ item }: { item: AssistantRestaurantConfirmationItem }) {
  return <article className="assistant-card card-restaurant"><CardHeading icon={<CalendarDays size={17} />} label="Đặt bàn" title={item.title} /><div className="detail-list"><Detail label="Nhà hàng" value={text(item.restaurant?.name, "Nhà hàng đã chọn")} /><Detail label="Địa điểm" value={text(item.restaurant?.location, "Đang cập nhật")} /><Detail label="Mã đặt bàn" value={text(item.reservation_code, "Chưa có mã đặt bàn")} /><Detail label="Thời gian" value={dateText(item.start_at)} /><Detail label="Số khách" value={item.party_size ? `${String(item.party_size)} người` : "Theo yêu cầu"} /></div>{item.note ? <p className="card-note">{text(item.note)}</p> : null}</article>;
}

function RideCard({ item }: { item: AssistantRideItem }) {
  return <article className="assistant-card card-ride"><CardHeading icon={<CarFront size={17} />} label="Chuyến xe" title={item.title} /><div className="route-line"><div><span>Đón tại</span><strong>{text(item.pickup)}</strong></div><div className="route-arrow">→</div><div><span>Đến</span><strong>{text(item.dropoff)}</strong></div></div><div className="metric-row"><Metric label="Phương tiện" value={text(item.vehicle, "Theo lựa chọn")} /><Metric label="Thời gian" value={item.duration_minutes ? `${String(item.duration_minutes)} phút` : "Đang cập nhật"} /><Metric label="Chi phí" value={formatMoney(item.amount, text(item.currency, "VND"))} /></div>{item.recommended_departure ? <div className="detail-list"><Detail label="Nên rời đi lúc" value={dateText(item.recommended_departure)} /><Detail label="Lịch đón tự động" value={item.scheduled_pickup === false ? "Chưa đặt" : "Đã đặt"} /></div> : null}{item.schedule_note ? <p className="card-note">{text(item.schedule_note)}</p> : null}</article>;
}

function RideTimingConflictCard({ item }: { item: AssistantRideTimingConflictItem }) {
  return <article className="assistant-card card-ride"><CardHeading icon={<CarFront size={17} />} label="Chuyến xe" title={item.title} />{item.appointment_start_time ? <div className="detail-list"><Detail label="Lịch khám" value={dateText(item.appointment_start_time)} />{item.recommended_departure ? <Detail label="Giờ nên rời đi" value={dateText(item.recommended_departure)} /> : null}</div> : null}<p className="card-note">{text(item.note, "Mình chưa tạo hoặc hủy chuyến xe. Bạn hãy cập nhật lịch hoặc điểm đón để thử lại.")}</p></article>;
}

function HealthcareCard({ item, actions, onAction, disabledActionId }: { item: AssistantHealthcareOptionsItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const selectionActions = actions.filter((action) => action.kind === "select_healthcare_slot");
  return <article className="assistant-card card-healthcare"><CardHeading icon={<Stethoscope size={17} />} label="Lịch khám" title={item.title} />
    {item.options?.length ? <div className="option-list">{item.options.map((option, index) => <div className="option-row" key={`${String(option.doctor)}-${index}`}><div><strong>{text(option.doctor, "Bác sĩ")}</strong><span>{text(option.department, "Khoa khám")} · {dateText(option.start_time)}</span></div>{selectionActions[index] ? <button className="small-action" type="button" onClick={() => onAction(selectionActions[index])} disabled={Boolean(disabledActionId)}>Chọn lịch</button> : null}</div>)}</div> : item.departments?.length ? <div className="option-list">{item.departments.slice(0, 6).map((department, index) => <div className="option-row" key={`${String(department.name)}-${index}`}><div><strong>{text(department.name, "Khoa khám")}</strong><span>{text(department.description, "Hãy nhắn tên khoa để xem lịch trống.")}</span></div></div>)}</div> : <p className="card-note">Mình đang cập nhật lịch khám phù hợp.</p>}
    {item.note ? <p className="card-note">{text(item.note)}</p> : null}
  </article>;
}

function HealthcareAppointment({ item }: { item: AssistantHealthcareItem }) {
  const appointment = item.appointment;
  const facility = item.facility ?? appointment?.facility;
  return <article className="assistant-card card-healthcare"><CardHeading icon={<Stethoscope size={17} />} label="Lịch khám" title={item.title} /><div className="detail-list"><Detail label="Bác sĩ" value={text(item.doctor ?? appointment?.doctor_name, "Theo lựa chọn")} /><Detail label="Khoa" value={text(item.department ?? appointment?.department, "Đang cập nhật")} /><Detail label="Thời gian" value={dateText(item.start_time ?? appointment?.start_time)} /><Detail label="Cơ sở" value={text(facility?.name, "Đang cập nhật")} /><Detail label="Địa chỉ" value={text(facility?.address, "Đang cập nhật")} /><Detail label="Chi phí" value={formatMoney(item.price ?? appointment?.price, "VND")} /></div>{item.note || item.payment_note ? <p className="card-note">{text(item.note ?? item.payment_note)}</p> : null}</article>;
}

function FoodCard({ item }: { item: AssistantFoodItem }) {
  const order = item.order;
  return <article className="assistant-card card-food"><CardHeading icon={<Utensils size={17} />} label="Đồ ăn" title={item.title} />{item.options?.length ? <div className="option-list">{item.options.map((option, index) => <div className="option-row" key={`${String(option.name)}-${index}`}><div><strong>{text(option.name, "Món ăn")}</strong><span><Soup size={13} /> {text(option.restaurant, text(option.description, "Gợi ý giao hàng tận nơi"))}</span></div><b>{formatMoney(option.price, "VND")}</b></div>)}</div> : <p className="card-note">Mình đang lấy danh sách món ăn phù hợp.</p>}{order ? <div className="metric-row"><Metric label="Đơn hàng" value={text(order.id, "Đã tiếp nhận")} /><Metric label="Trạng thái" value={text(order.status, "Đã nhận")} /></div> : null}{item.note || item.payment ? <p className="card-note"><CircleDollarSign size={14} /> {text(item.note, item.payment ? "Thanh toán đã được ghi nhận từ Food Service." : "")}</p> : null}</article>;
}

function SimpleCard({ item }: { item: { title: string; question?: string; note?: string } }) {
  return <article className="assistant-card card-simple"><CardHeading icon={<SparkIcon />} label="X-One" title={item.title} />{item.question || item.note ? <p>{text(item.question ?? item.note)}</p> : null}</article>;
}

function FallbackCard({ item }: { item: { title: string; note?: string; question?: string } }) {
  return <article className="assistant-card card-simple"><CardHeading icon={<SparkIcon />} label="X-One" title={item.title} /><p>{text(item.note ?? item.question, "Mình đã nhận thông tin mới và sẽ cập nhật ở bước tiếp theo.")}</p></article>;
}

function assertNever(value: never): never {
  throw new Error(`Unknown Assistant item kind: ${String((value as { kind?: unknown }).kind)}`);
}

function CardHeading({ icon, label, title }: { icon: ReactNode; label: string; title: unknown }) {
  return <div className="card-heading"><div className="card-icon">{icon}</div><div><span>{label}</span><h3>{text(title, "Thông tin mới")}</h3></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function text(value: unknown, fallback = ""): string { return typeof value === "string" && value.trim() ? value : fallback; }
function dateText(value: unknown): string { const raw = text(value); if (!raw) return "Theo lựa chọn"; const date = new Date(raw); return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function formatMoney(value: unknown, currency = "VND"): string { const numeric = typeof value === "number" ? value : typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as Record<string, unknown>).amount === "number" ? (value as Record<string, number>).amount : undefined; if (typeof numeric !== "number" || !Number.isFinite(numeric)) return "Đang cập nhật"; try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(numeric); } catch { return `${numeric.toLocaleString("vi-VN")} ${currency}`; } }
function SparkIcon() { return <Check size={17} />; }
