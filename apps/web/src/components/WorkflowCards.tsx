import { CalendarDays, CarFront, Check, CircleDollarSign, MapPin, ShieldCheck, Soup, Stethoscope, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import type { AssistantAction, AssistantItem, AssistantResponse } from "../types";

export function AssistantCards({ response, onAction, disabledActionId }: { response: AssistantResponse; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const secondaryActions = response.actions.filter((action) => action.kind !== "select_restaurant" && action.kind !== "select_healthcare_slot");
  return <div className="assistant-cards">
    {response.items.map((item, index) => <AssistantCard key={`${item.kind}-${index}`} item={item} actions={response.actions} onAction={onAction} disabledActionId={disabledActionId} />)}
    {secondaryActions.length > 0 ? <div className="action-list">{secondaryActions.map((action) => <button className="card-action" key={action.id} type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}><ShieldCheck size={15} /> {action.label}</button>)}</div> : null}
  </div>;
}

function AssistantCard({ item, actions, onAction, disabledActionId }: { item: AssistantItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const kind = item.kind;
  if (kind === "restaurant_options" || kind === "restaurant_unavailable") return <RestaurantCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
  if (kind === "restaurant_confirmation" || kind === "reservation") return <RestaurantConfirmation item={item} />;
  if (kind === "ride_quote" || kind === "ride_booking") return <RideCard item={item} />;
  if (kind === "healthcare_options" || kind === "healthcare_no_availability") return <HealthcareCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
  if (kind === "appointment" || kind === "healthcare_confirmation" || kind === "appointment_confirmed") return <HealthcareAppointment item={item} />;
  if (kind === "food_options" || kind === "food_confirmation" || kind === "food_order" || kind === "food_empty") return <FoodCard item={item} />;
  return <SimpleCard item={item} />;
}

function RestaurantCard({ item, actions, onAction, disabledActionId }: { item: AssistantItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const options = records(item.options);
  const selectionActions = actions.filter((action) => action.kind === "select_restaurant");
  return <article className="assistant-card card-restaurant"><CardHeading icon={<CalendarDays size={17} />} label="Nhà hàng" title={item.title} />
    {options.length ? <div className="option-list">{options.map((option, index) => <div className="option-row" key={`${String(option.name)}-${index}`}><div><strong>{text(option.name, "Nhà hàng")}</strong><span><MapPin size={13} /> {text(option.location, "Địa điểm đang được cập nhật")}</span></div>{selectionActions[index] ? <button className="small-action" type="button" onClick={() => onAction(selectionActions[index])} disabled={Boolean(disabledActionId)}>Chọn quán</button> : option.rating !== undefined ? <b>{String(option.rating)} ★</b> : null}</div>)}</div> : <p className="card-note">Mình đang cập nhật thêm lựa chọn cho bạn.</p>}
    {item.note ? <p className="card-note">{text(item.note)}</p> : null}
  </article>;
}

function RestaurantConfirmation({ item }: { item: AssistantItem }) {
  const restaurant = asRecord(item.restaurant);
  return <article className="assistant-card card-restaurant"><CardHeading icon={<CalendarDays size={17} />} label="Đặt bàn" title={item.title} /><div className="detail-list"><Detail label="Nhà hàng" value={text(restaurant?.name, "Nhà hàng đã chọn")} /><Detail label="Địa điểm" value={text(restaurant?.location, "Đang cập nhật")} /><Detail label="Mã đặt bàn" value={text(item.reservation_code, "Chưa có mã đặt bàn")} /><Detail label="Thời gian" value={dateText(item.start_at)} /><Detail label="Số khách" value={item.party_size ? `${String(item.party_size)} người` : "Theo yêu cầu"} /></div>{item.note ? <p className="card-note">{text(item.note)}</p> : null}</article>;
}

function RideCard({ item }: { item: AssistantItem }) {
  return <article className="assistant-card card-ride"><CardHeading icon={<CarFront size={17} />} label="Chuyến xe" title={item.title} /><div className="route-line"><div><span>Đón tại</span><strong>{text(item.pickup)}</strong></div><div className="route-arrow">→</div><div><span>Đến</span><strong>{text(item.dropoff)}</strong></div></div><div className="metric-row"><Metric label="Phương tiện" value={text(item.vehicle, "Theo lựa chọn")} /><Metric label="Thời gian" value={item.duration_minutes ? `${String(item.duration_minutes)} phút` : "Đang cập nhật"} /><Metric label="Chi phí" value={formatMoney(item.amount, text(item.currency, "VND"))} /></div></article>;
}

function HealthcareCard({ item, actions, onAction, disabledActionId }: { item: AssistantItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const options = records(item.options);
  const departments = records(item.departments);
  const selectionActions = actions.filter((action) => action.kind === "select_healthcare_slot");
  return <article className="assistant-card card-healthcare"><CardHeading icon={<Stethoscope size={17} />} label="Lịch khám" title={item.title} />
    {options.length ? <div className="option-list">{options.map((option, index) => <div className="option-row" key={`${String(option.doctor)}-${index}`}><div><strong>{text(option.doctor, "Bác sĩ")}</strong><span>{text(option.department, "Khoa khám")} · {dateText(option.start_time)}</span></div>{selectionActions[index] ? <button className="small-action" type="button" onClick={() => onAction(selectionActions[index])} disabled={Boolean(disabledActionId)}>Chọn lịch</button> : null}</div>)}</div> : departments.length ? <div className="option-list">{departments.slice(0, 6).map((department, index) => <div className="option-row" key={`${String(department.name)}-${index}`}><div><strong>{text(department.name, "Khoa khám")}</strong><span>{text(department.description, "Hãy nhắn tên khoa để xem lịch trống.")}</span></div></div>)}</div> : <p className="card-note">Mình đang cập nhật lịch khám phù hợp.</p>}
  </article>;
}

function HealthcareAppointment({ item }: { item: AssistantItem }) {
  const appointment = asRecord(item.appointment);
  return <article className="assistant-card card-healthcare"><CardHeading icon={<Stethoscope size={17} />} label="Lịch khám" title={item.title} /><div className="detail-list"><Detail label="Bác sĩ" value={text(item.doctor, text(appointment?.doctor_name, "Theo lựa chọn"))} /><Detail label="Khoa" value={text(item.department, "Đang cập nhật")} /><Detail label="Thời gian" value={dateText(item.start_time ?? appointment?.start_time)} /><Detail label="Chi phí" value={formatMoney(item.price ?? appointment?.price, "VND")} /></div>{item.note || item.payment_note ? <p className="card-note">{text(item.note ?? item.payment_note)}</p> : null}</article>;
}

function FoodCard({ item }: { item: AssistantItem }) {
  const options = records(item.options);
  const order = asRecord(item.order);
  return <article className="assistant-card card-food"><CardHeading icon={<Utensils size={17} />} label="Đồ ăn" title={item.title} />{options.length ? <div className="option-list">{options.map((option, index) => <div className="option-row" key={`${String(option.name)}-${index}`}><div><strong>{text(option.name, "Món ăn")}</strong><span><Soup size={13} /> {text(option.restaurant, text(option.description, "Gợi ý giao hàng tận nơi"))}</span></div><b>{formatMoney(option.price, "VND")}</b></div>)}</div> : <p className="card-note">Mình đang lấy danh sách món ăn phù hợp.</p>}{order ? <div className="metric-row"><Metric label="Đơn hàng" value={text(order.id, "Đã tiếp nhận")} /><Metric label="Trạng thái" value="Đã nhận" /></div> : null}{item.note || item.payment_note ? <p className="card-note"><CircleDollarSign size={14} /> {text(item.note ?? item.payment_note)}</p> : null}</article>;
}

function SimpleCard({ item }: { item: AssistantItem }) {
  return <article className="assistant-card card-simple"><CardHeading icon={<SparkIcon />} label="X-One" title={item.title} />{item.question ? <p>{text(item.question)}</p> : null}</article>;
}

function CardHeading({ icon, label, title }: { icon: ReactNode; label: string; title: unknown }) {
  return <div className="card-heading"><div className="card-icon">{icon}</div><div><span>{label}</span><h3>{text(title, "Thông tin mới")}</h3></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(asRecord) : []; }
function asRecord(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function text(value: unknown, fallback = ""): string { return typeof value === "string" && value.trim() ? value : fallback; }
function dateText(value: unknown): string { const raw = text(value); if (!raw) return "Theo lựa chọn"; const date = new Date(raw); return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function formatMoney(value: unknown, currency = "VND"): string { const numeric = typeof value === "number" ? value : asRecord(value)?.amount; if (typeof numeric !== "number" || !Number.isFinite(numeric)) return "Đang cập nhật"; try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(numeric); } catch { return `${numeric.toLocaleString("vi-VN")} ${currency}`; } }
function SparkIcon() { return <Check size={17} />; }
