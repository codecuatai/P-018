"use client";

import { CalendarDays, CarFront, Check, CircleDollarSign, MapPin, Minus, Plus, ShieldCheck, Soup, Stethoscope, Utensils } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { parseRideDriver } from "../features/product/ride-tracking";
import { useRideTracking } from "../features/product/ride-tracking-cache";
import { RideCancelButton } from "../features/product/ride-cancel-button";
import { ServiceDetailDialog } from "./ServiceDetailDialog";
import { FoodTrackingPanel } from "../features/product/food-tracking";
import { isKnownAssistantItem, type AssistantAction, type AssistantAddressOptionsItem, type AssistantHealthcareItem, type AssistantHealthcareOptionsItem, type AssistantItem, type AssistantRestaurantConfirmationItem, type AssistantRestaurantOptionsItem, type AssistantResponse, type AssistantRideItem, type AssistantRideTimingConflictItem, type AssistantFoodItem, type AssistantOption, type AssistantTaskErrorItem } from "../types";
import { formatDateTime, formatMoney, optionalText, statusLabel } from "../lib/presentation";

type ActionHandler = (action: AssistantAction, input?: { quantity?: number }) => void;

export type FoodSelection = {
  action: AssistantAction;
  option: AssistantOption;
  quantity: number;
};

type FoodSelectionChangeHandler = (selection: FoodSelection) => void;

export function AssistantCards({ response, onAction, disabledActionId, foodSelections, onFoodSelectionChange }: { response: AssistantResponse; onAction: ActionHandler; disabledActionId?: string; foodSelections?: Record<string, FoodSelection>; onFoodSelectionChange?: FoodSelectionChangeHandler }) {
  const secondaryActions = response.actions.filter((action) => !["select_restaurant", "restaurant_confirm", "select_healthcare_slot", "healthcare_cancel", "select_food_item", "food_cart_increment", "food_cart_decrement", "food_cart_remove", "food_checkout", "food_confirm", "food_payment"].includes(action.kind));
  return <div className="assistant-cards">
    {response.items.map((item, index) => <AssistantCard key={`${item.kind}-${index}`} item={item} actions={response.actions} onAction={onAction} disabledActionId={disabledActionId} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} />)}
    {secondaryActions.length > 0 ? <div className="action-list">{secondaryActions.map((action) => <button className="card-action" key={action.id} type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}><ShieldCheck size={15} /> {action.label}</button>)}</div> : null}
  </div>;
}

function AssistantCard({ item, actions, onAction, disabledActionId, foodSelections, onFoodSelectionChange }: { item: AssistantItem; actions: AssistantAction[]; onAction: ActionHandler; disabledActionId?: string; foodSelections?: Record<string, FoodSelection>; onFoodSelectionChange?: FoodSelectionChangeHandler }) {
  if (!isKnownAssistantItem(item)) return <FallbackCard item={item} />;
  switch (item.kind) {
    case "restaurant_options":
    case "restaurant_unavailable":
      return <RestaurantCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
    case "restaurant_confirmation":
    case "reservation":
      return <RestaurantConfirmation item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
    case "ride_quote":
    case "ride_booking":
      return <RideCardWithCancel item={item} />;
    case "ride_timing_conflict":
      return <RideTimingConflictCard item={item} />;
    case "healthcare_options":
    case "healthcare_no_availability":
      return <HealthcareCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
    case "appointment":
    case "healthcare_confirmation":
    case "appointment_confirmed":
      return <HealthcareAppointment item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
    case "food_options":
    case "food_confirmation":
    case "food_order":
    case "food_empty":
    case "food_cart":
      return <FoodCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} />;
    case "progress":
    case "clarification":
      return <SimpleCard item={item} />;
    case "task_error":
      return <TaskErrorCard item={item} />;
    case "address_options":
      return <AddressOptionsCard item={item} />;
    default:
      return assertNever(item);
  }
}

function RestaurantCard({ item, actions, onAction, disabledActionId }: { item: AssistantRestaurantOptionsItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const rawSelectionActions = actions.filter((action) => action.kind === "select_restaurant");
  const selectionActions = (item.options ?? []).map((option, index) => {
    const targetIndex = option.target_index ?? index;
    return rawSelectionActions.find((action) => action.target_index === targetIndex) ?? rawSelectionActions[index];
  });
  const [detail, setDetail] = useState<AssistantOption | null>(null);
  return <><article className="assistant-card card-restaurant"><CardHeading icon={<CalendarDays size={17} />} label="Nhà hàng" title={item.title} />
    {item.options?.length ? <div className="option-list">{item.options.map((option, index) => <div className="option-row" key={`${String(option.name)}-${index}`}><OptionImage source={option.image_url} alt={optionalText(option.name, "Nhà hàng")} compact /><div><strong>{text(option.name, "Nhà hàng")}</strong><span><MapPin size={13} /> {text(option.address ?? option.location, "Địa điểm đang được cập nhật")}</span><small>{text(option.cuisine, "Ẩm thực đang cập nhật")} {option.rating !== undefined ? `· ${option.rating} ★` : ""}</small></div><div className="option-actions">{selectionActions[index] ? <button className="small-action" type="button" onClick={() => onAction(selectionActions[index])} disabled={Boolean(disabledActionId)}>Chọn quán</button> : null}<button className="small-action" type="button" onClick={() => setDetail(option)}>Xem chi tiết</button></div></div>)}</div> : <p className="card-note">Mình đang cập nhật thêm lựa chọn cho bạn.</p>}
    {item.note ? <p className="card-note">{text(item.note)}</p> : null}
  </article><ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="restaurant" option={detail} primaryAction={actionForRestaurantOption(detail, item.options ?? [], rawSelectionActions, disabledActionId, onAction, setDetail)} /></>;
}

function RestaurantConfirmation({ item, actions, onAction, disabledActionId }: { item: AssistantRestaurantConfirmationItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const action = actions.find((candidate) => candidate.kind === "restaurant_confirm");
  return <article className="assistant-card card-restaurant"><CardHeading icon={<CalendarDays size={17} />} label="Đặt bàn" title={item.title} /><div className="detail-list"><Detail label="Nhà hàng" value={text(item.restaurant?.name, "Nhà hàng đã chọn")} /><Detail label="Địa điểm" value={text(item.restaurant?.location, "Đang cập nhật")} /><Detail label="Thời gian" value={formatDateTime(item.start_at)} /><Detail label="Số khách" value={item.party_size ? `${String(item.party_size)} người` : "Theo yêu cầu"} /><Detail label="Trạng thái" value={statusLabel(item.status)} /></div>{item.note ? <p className="card-note">{text(item.note)}</p> : null}{action ? <section className="restaurant-confirmation-form" aria-label="Xác nhận đặt bàn"><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> <span>Tôi xác nhận thông tin đặt bàn ở trên.</span></label><button className="card-action" type="button" onClick={() => onAction(action)} disabled={!confirmed || Boolean(disabledActionId)}><ShieldCheck size={15} /> Xác nhận đặt bàn</button></section> : null}</article>;
}

function RideCard({ item, children }: { item: AssistantRideItem; children?: ReactNode }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const bookingId = item.booking_id ?? item.resource_id;
  const { data: tracking } = useRideTracking(bookingId);
  const distance = item.distance_km !== undefined ? `${item.distance_km} km` : item.route_distance_meters ? `${(item.route_distance_meters / 1000).toFixed(1)} km` : undefined;
  const duration = item.duration_minutes ? `${item.duration_minutes} phút` : item.route_duration_seconds ? `${Math.ceil(item.route_duration_seconds / 60)} phút` : undefined;
  const price = formatMoney(item.amount, text(item.currency, "VND"));
  const vehicle = text(item.vehicle, "Xe 4 chỗ");

  return (
    <>
      <article className="assistant-card card-ride">
        <div className="ride-ticket-header">
          <div className="ride-ticket-badge">
            <span className="ride-ticket-icon"><CarFront size={17} /></span>
            <div>
              <span className="ride-ticket-label">CHUYẾN XE</span>
              <h3 className="ride-ticket-title">{text(item.title, "Ước tính chuyến đi")}</h3>
            </div>
          </div>
          {item.amount !== undefined && (
            <div className="ride-ticket-price">
              <span className="ride-price-label">Giá dự kiến</span>
              <strong className="ride-price-value">{price}</strong>
            </div>
          )}
        </div>

        <div className="ride-ticket-route">
          <div className="route-stop pickup-stop">
            <span className="route-dot pickup-dot" />
            <div className="route-stop-copy">
              <span className="route-stop-label">Điểm đón</span>
              <strong className="route-stop-address">{text(item.pickup, "Điểm đón chưa rõ")}</strong>
            </div>
          </div>
          <div className="route-connector" />
          <div className="route-stop dropoff-stop">
            <span className="route-dot dropoff-dot" />
            <div className="route-stop-copy">
              <span className="route-stop-label">Điểm đến</span>
              <strong className="route-stop-address">{text(item.dropoff, "Điểm đến chưa rõ")}</strong>
            </div>
          </div>
        </div>

        <div className="ride-ticket-specs">
          <div className="ride-spec-item">
            <span className="spec-label">Loại xe</span>
            <strong className="spec-value">{vehicle}</strong>
          </div>
          {distance && (
            <div className="ride-spec-item">
              <span className="spec-label">Quãng đường</span>
              <strong className="spec-value">{distance}</strong>
            </div>
          )}
          {duration && (
            <div className="ride-spec-item">
              <span className="spec-label">Thời gian dự kiến</span>
              <strong className="spec-value">{duration}</strong>
            </div>
          )}
          {tracking?.status || item.status ? (
            <div className="ride-spec-item">
              <span className="spec-label">Trạng thái</span>
              <strong className="spec-value">{statusLabel(tracking?.status ?? item.status)}</strong>
            </div>
          ) : null}
        </div>

        <div className="ride-ticket-footer">
          <button className="small-action ride-detail-action" type="button" onClick={() => setDetailOpen(true)}>
            Xem bản đồ và hành trình
          </button>
          {tracking ? <RideLiveStatus tracking={tracking} /> : null}
          {item.schedule_note ? <p className="card-note">{text(item.schedule_note)}</p> : null}
          {children}
        </div>
      </article>
      <ServiceDetailDialog open={detailOpen} onOpenChange={setDetailOpen} kind="ride" option={null} ride={item} />
    </>
  );
}

function RideCardWithCancel({ item }: { item: AssistantRideItem }) {
  const bookingId = item.kind === "ride_booking" ? item.booking_id ?? item.resource_id : undefined;
  const { data: tracking } = useRideTracking(bookingId);
  return <RideCard item={item}><RideCancelButton bookingId={bookingId} status={tracking?.status ?? item.status} /></RideCard>;
}

function RideTimingConflictCard({ item }: { item: AssistantRideTimingConflictItem }) {
  return <article className="assistant-card card-ride"><CardHeading icon={<CarFront size={17} />} label="Chuyến xe" title={item.title} />{item.appointment_start_time ? <div className="detail-list"><Detail label="Lịch khám" value={formatDateTime(item.appointment_start_time)} />{item.recommended_departure ? <Detail label="Giờ nên rời đi" value={formatDateTime(item.recommended_departure)} /> : null}</div> : null}<p className="card-note">{text(item.note, "Mình chưa tạo hoặc hủy chuyến xe. Bạn hãy cập nhật lịch hoặc điểm đón để thử lại.")}</p></article>;
}

function HealthcareCard({ item, actions, onAction, disabledActionId }: { item: AssistantHealthcareOptionsItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const selectionActions = actions.filter((action) => action.kind === "select_healthcare_slot");
  const [detail, setDetail] = useState<AssistantOption | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Record<string, number>>({});
  const groups = groupHealthcareOptions(item.options ?? []);
  return <><article className="assistant-card card-healthcare"><CardHeading icon={<Stethoscope size={17} />} label="Lịch khám" title={item.title} />
    {groups.length ? <div className="healthcare-doctor-groups">{groups.map((group) => {
      const selectedIndex = selectedSlots[group.key] ?? group.options[0]?.index;
      const selected = group.options.find((candidate) => candidate.index === selectedIndex);
      const action = selectedIndex === undefined ? undefined : healthcareSelectionAction(selectionActions, selectedIndex);
      return <section className="healthcare-doctor-group" key={group.key}><div className="healthcare-doctor-heading"><div><strong>{group.doctor}</strong><span>{text(group.facility, "Cơ sở đang cập nhật")} · {text(group.department, "Khoa khám")}</span></div><small>{group.options.length} khung giờ</small></div><label className="healthcare-slot-select">Khung giờ<select aria-label={"Khung giờ của " + group.doctor} value={selectedIndex ?? ""} onChange={(event) => setSelectedSlots((current) => ({ ...current, [group.key]: Number(event.target.value) }))}>{group.options.map((candidate) => <option value={candidate.index} key={candidate.index}>{formatDateTime(candidate.option.start_time)}{candidate.option.price !== undefined ? " · " + formatMoney(candidate.option.price, "VND") : ""}</option>)}</select></label>{selected ? <div className="healthcare-slot-detail"><span>{formatDateTime(selected.option.start_time)}{selected.option.price !== undefined ? " · " + formatMoney(selected.option.price, "VND") : ""}</span><div className="option-actions">{action ? <button className="small-action" type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}>Chọn lịch</button> : null}<button className="small-action" type="button" onClick={() => setDetail(selected.option)}>Xem chi tiết</button></div></div> : null}</section>;
    })}</div> : item.departments?.length ? <div className="option-list">{item.departments.map((department, index) => <div className="option-row" key={String(department.name) + "-" + index}><div><strong>{text(department.name, "Khoa khám")}</strong><span>{text(department.description, "Hãy nhấn tên khoa để xem lịch trống.")}</span></div></div>)}</div> : <p className="card-note">Mình đang cập nhật lịch khám phù hợp.</p>}
    {item.note ? <p className="card-note">{text(item.note)}</p> : null}
  </article><ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="healthcare" option={detail} primaryAction={actionForHealthcareOption(detail, groups, selectionActions, disabledActionId, onAction, setDetail)} /></>;
}

function HealthcareAppointment({ item, actions, onAction, disabledActionId }: { item: AssistantHealthcareItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const appointment = item.appointment;
  const facility = item.facility ?? appointment?.facility;
  const alternatives = item.alternative_slots ?? [];
  const changeActions = actions.filter((action) => action.kind === "select_healthcare_slot");
  const cancelAction = actions.find((action) => action.kind === "healthcare_cancel");
  const [changing, setChanging] = useState(false);
  const [targetIndex, setTargetIndex] = useState<number | undefined>(alternatives[0]?.target_index);
  const selected = alternatives.find((option) => option.target_index === targetIndex) ?? alternatives[0];
  const action = selected ? healthcareSelectionAction(changeActions, selected.target_index ?? 0) : undefined;
  return <article className="assistant-card card-healthcare"><CardHeading icon={<Stethoscope size={17} />} label="Lịch khám" title={item.title} /><div className="detail-list"><Detail label="Bác sĩ" value={text(item.doctor ?? appointment?.doctor_name, "Theo lựa chọn")} /><Detail label="Khoa" value={text(item.department ?? appointment?.department, "Thông tin khoa chưa có")} /><Detail label="Thời gian" value={formatDateTime(item.start_time ?? appointment?.start_time)} /><Detail label="Cơ sở" value={text(facility?.name, "Cơ sở chưa có tên")} /><Detail label="Địa chỉ" value={text(facility?.address, "Địa chỉ cơ sở chưa có")} /><Detail label="Chi phí" value={formatMoney(item.price ?? appointment?.price, "VND")} /><Detail label="Trạng thái" value={statusLabel(item.status ?? appointment?.status)} /></div>{item.note || item.payment_note ? <p className="card-note">{text(item.note ?? item.payment_note)}</p> : null}{alternatives.length && action ? <div className="healthcare-change-slot"><button className="small-action" type="button" onClick={() => setChanging((value) => !value)} disabled={Boolean(disabledActionId)}>{changing ? "Đóng đổi lịch" : "Đổi khung giờ"}</button>{changing ? <div className="healthcare-change-form"><label>Khung giờ mới<select aria-label="Khung giờ mới" value={selected?.target_index ?? ""} onChange={(event) => setTargetIndex(Number(event.target.value))}>{alternatives.map((option) => <option key={option.target_index} value={option.target_index}>{text(option.doctor, "Bác sĩ")} · {formatDateTime(option.start_time)}{option.price !== undefined ? ` · ${formatMoney(option.price, "VND")}` : ""}</option>)}</select></label><button className="button button-secondary" type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}>Giữ lịch mới</button></div> : null}</div> : null}{cancelAction ? <button className="small-action healthcare-cancel-action" type="button" onClick={() => onAction(cancelAction)} disabled={Boolean(disabledActionId)}>Hủy giữ chỗ</button> : null}</article>;
}

function LegacyFoodCard({ item, actions, onAction, disabledActionId }: { item: AssistantFoodItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const order = item.order;
  const selectionActions = actions.filter((action) => action.kind === "select_food_item");
  const checkoutAction = actions.find((action) => action.kind === "food_confirm");
  const [detail, setDetail] = useState<AssistantOption | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  return <><article className="assistant-card card-food"><CardHeading icon={<Utensils size={17} />} label="Đồ ăn" title={item.title} />{item.options?.length ? <div className="food-option-list">{item.options.map((option, index) => {
    const key = String(option.name ?? option.title ?? index);
    const quantity = quantities[key] ?? 1;
    return <div className="food-option-row" key={key + "-" + index}><OptionImage source={option.image_url} alt={optionalText(option.name, "Món ăn")} compact /><div><strong>{text(option.name, "Món ăn")}</strong><span><Soup size={13} /> {restaurantName(option.restaurant) || text(option.restaurant, text(option.description, "Gợi ý giao hàng tận nơi"))}</span><small>{text(option.description, "Mô tả món đang cập nhật")}</small></div><div className="food-option-actions"><b>{formatMoney(option.price, "VND")}</b><div className="quantity-control" aria-label={"Số lượng " + text(option.name, "món ăn")}><button type="button" onClick={() => setQuantities((current) => ({ ...current, [key]: Math.max(1, quantity - 1) }))} aria-label={"Giảm " + text(option.name, "món ăn")}>−</button><span>{quantity}</span><button type="button" onClick={() => setQuantities((current) => ({ ...current, [key]: quantity + 1 }))} aria-label={"Tăng " + text(option.name, "món ăn")}>+</button></div>{selectionActions[index] ? <button className="small-action" type="button" onClick={() => onAction(selectionActions[index])} disabled={Boolean(disabledActionId)}>Thêm vào giỏ</button> : null}<button className="small-action" type="button" onClick={() => setDetail(option)}>Xem chi tiết</button></div></div>;
  })}</div> : <p className="card-note">Mình đang lấy danh sách món ăn phù hợp.</p>}{checkoutAction ? <button className="card-action food-checkout-action" type="button" onClick={() => onAction(checkoutAction)} disabled={Boolean(disabledActionId)}><CircleDollarSign size={15} /> Xem giỏ và tiếp tục</button> : null}{order ? <div className="metric-row"><Metric label="Đơn hàng" value="Đã tiếp nhận" /><Metric label="Trạng thái" value={statusLabel(order.status)} /></div> : null}{item.note || item.payment ? <p className="card-note"><CircleDollarSign size={14} /> {text(item.note, item.payment ? "Thanh toán đã được ghi nhận." : "")}</p> : null}</article><ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="food" option={detail} /></>;
}

function FoodCard({ item, actions, onAction, disabledActionId, foodSelections, onFoodSelectionChange }: { item: AssistantFoodItem; actions: AssistantAction[]; onAction: ActionHandler; disabledActionId?: string; foodSelections?: Record<string, FoodSelection>; onFoodSelectionChange?: FoodSelectionChangeHandler }) {
  const rawSelectionActions = actions.filter((action) => action.kind === "select_food_item");
  const selectionActions = rawSelectionActions.some((action) => action.target_index !== undefined)
    ? rawSelectionActions.reduce<AssistantAction[]>((indexed, action) => {
      if (action.target_index !== undefined) indexed[action.target_index] = action;
      return indexed;
    }, [])
    : rawSelectionActions;
  const confirmationAction = actions.find((action) => action.kind === "food_confirm");
  const paymentAction = actions.find((action) => action.kind === "food_payment");
  const [detail, setDetail] = useState<AssistantOption | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const updateQuantity = (key: string, action: AssistantAction | undefined, quantity: number, commit: boolean): void => {
    const next = Math.max(0, Math.min(50, Number.isFinite(quantity) ? Math.trunc(quantity) : 0));
    setQuantities((current) => ({ ...current, [key]: next }));
    const option = action ? item.options?.find((_candidate, index) => selectionActions[index]?.id === action.id) : undefined;
    if (action && option && onFoodSelectionChange) onFoodSelectionChange({ action, option, quantity: next });
    void commit;
  };
  const orderId = item.order?.id;
  return <><article className="assistant-card card-food"><CardHeading icon={<Utensils size={17} />} label="Đồ ăn" title={item.title} />{item.options?.length ? <div className="food-option-list">{item.options.map((option, index) => {
    const key = `${String(option.name ?? option.title ?? index)}-${index}`;
    const action = selectionActions[index];
    const quantity = foodSelections?.[action?.id ?? ""]?.quantity ?? quantities[key] ?? 0;
    const price = typeof option.price === "number" ? option.price : 0;
    return <div className="food-option-row" key={key}>
      <OptionImage source={option.image_url} alt={optionalText(option.name, "Món ăn")} compact />
      <div><strong>{text(option.name, "Món ăn")}</strong><span><Soup size={13} /> {restaurantName(option.restaurant) || text(option.restaurant, "Nhà hàng đang cập nhật")}</span><small>{text(option.description, "Mô tả món đang cập nhật")}</small></div>
      <div className="food-option-actions">
        <b>{formatMoney(price, "VND")}</b>
        <div className="quantity-control food-option-quantity" aria-label={`Số lượng ${text(option.name, "món ăn")} `}>
          <button type="button" onClick={() => updateQuantity(key, action, quantity - 1, true)} disabled={!action || Boolean(disabledActionId) || quantity <= 0} aria-label={`Giảm ${text(option.name, "món ăn")}`}><Minus size={13} /></button>
          <input aria-label={`Nhập số lượng ${text(option.name, "món ăn")}`} inputMode="numeric" min={0} max={50} type="number" value={quantity} onChange={(event) => updateQuantity(key, action, Number(event.target.value), false)} disabled={!action || Boolean(disabledActionId)} />
          <button type="button" onClick={() => updateQuantity(key, action, quantity + 1, true)} disabled={!action || Boolean(disabledActionId)} aria-label={`Tăng ${text(option.name, "món ăn")}`}><Plus size={13} /></button>
        </div>
        <button className="small-action" type="button" onClick={() => setDetail(option)}>Xem chi tiết</button>
      </div>
    </div>;
  })}</div> : item.kind === "food_cart" ? <p className="card-note" role="status">Giỏ hàng đã được cập nhật ở khu vực bên trên ô chat.</p> : <p className="card-note">Mình đang lấy danh sách món ăn phù hợp.</p>}{item.kind === "food_confirmation" ? <FoodConfirmation item={item} confirmationAction={confirmationAction} paymentAction={paymentAction} onAction={onAction} disabledActionId={disabledActionId} /> : null}{item.order ? <><div className="metric-row"><Metric label="Đơn hàng" value="Đã tiếp nhận" /><Metric label="Trạng thái" value={statusLabel(item.order.status)} /></div>{orderId ? <FoodTrackingPanel orderId={orderId} /> : null}</> : null}{item.note || item.payment ? <p className="card-note"><CircleDollarSign size={14} /> {text(item.note, item.payment ? "Thanh toán đã được ghi nhận." : "")}</p> : null}</article><ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="food" option={detail} /></>;
}

function FoodConfirmation({ item, confirmationAction, paymentAction, onAction, disabledActionId }: { item: AssistantFoodItem; confirmationAction?: AssistantAction; paymentAction?: AssistantAction; onAction: ActionHandler; disabledActionId?: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const preview = item.preview;
  const pickupStops = item.pickup_stops ?? [];
  const readyForPayment = item.confirmation_state === "PAYMENT_REQUIRED";
  const action = readyForPayment ? paymentAction : confirmationAction;
  const cartItems = item.cart?.items?.filter((cartItem) => text(cartItem.name).length > 0) ?? [];
  return <section className="food-confirmation-form" aria-label="Xác nhận đơn giao hàng">
    <div className="detail-list">
      <Detail label="Điểm lấy hàng" value={pickupStops.length ? pickupStops.map((stop) => text(stop.name, "Nhà hàng")).join(" → ") : "Theo món đã chọn"} />
      <Detail label="Địa chỉ giao" value={text(item.delivery_address, "Chưa có địa chỉ giao hàng")} />
      <Detail label="Phí giao" value={formatMoney(preview?.delivery?.fee?.amount, preview?.delivery?.fee?.currency ?? "VND")} />
      <Detail label="Tổng thanh toán" value={formatMoney(preview?.total?.amount ?? item.cart?.total, preview?.total?.currency ?? "VND")} />
      <Detail label="Trạng thái" value={readyForPayment ? "Chờ thanh toán" : "Chờ xác nhận thông tin"} />
    </div>
    {cartItems.length ? <ul className="food-confirmation-items" aria-label="Món đã chọn">{cartItems.map((cartItem, index) => <li key={`${text(cartItem.name, "món")}-${index}`}><span>{text(cartItem.name, "Món ăn")} × {cartItem.quantity ?? 1}</span><strong>{formatMoney((cartItem.unit_price ?? cartItem.price ?? 0) * (cartItem.quantity ?? 1), cartItem.currency ?? "VND")}</strong></li>)}</ul> : null}
    {pickupStops.length > 1 ? <p className="card-note">Một tài xế sẽ lần lượt lấy món tại {pickupStops.length} địa điểm rồi giao đến địa chỉ của bạn.</p> : null}
    {!readyForPayment ? <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> <span>Tôi xác nhận món, các điểm lấy hàng và địa chỉ giao ở trên.</span></label> : null}
    {action ? <button className="card-action food-checkout-action" type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId) || (!readyForPayment && !confirmed)}><CircleDollarSign size={15} /> {readyForPayment ? "Thanh toán đơn hàng" : "Xác nhận thông tin đơn"}</button> : null}
  </section>;
}

export function FoodCartDock({ total, onConfirm, disabled }: { total: number; onConfirm: () => void; disabled?: boolean }) {
  return <section className="food-cart-dock" aria-label="Tổng tiền đơn món ăn">
    <div className="food-cart-dock-footer">
      <span>Tạm tính</span>
      <strong>{formatMoney(total, "VND")}</strong>
      <button className="card-action" type="button" onClick={onConfirm} disabled={Boolean(disabled) || total <= 0}><CircleDollarSign size={15} /> Xác nhận</button>
    </div>
  </section>;
}

function RideLiveStatus({ tracking }: { tracking: import("../types").RideTracking }): ReactNode {
  const driver = parseRideDriver(tracking.driver);
  return <div className="ride-live-status" aria-live="polite"><strong>{statusLabel(tracking.status)}</strong>{tracking.driver ? <span>{driver.name}{driver.rating ? " · " + driver.rating + " ★" : ""}{driver.vehicle ? " · " + driver.vehicle : ""}</span> : null}</div>;
}

type HealthcareOptionGroup = { key: string; doctor: string; facility: string; department: string; options: Array<{ option: AssistantOption; index: number }> };

function groupHealthcareOptions(options: AssistantOption[]): HealthcareOptionGroup[] {
  const groups = new Map<string, HealthcareOptionGroup>();
  options.forEach((option, index) => {
    const doctor = text(option.doctor, "Bác sĩ đang cập nhật");
    const key = doctor.trim().toLocaleLowerCase();
    const current = groups.get(key) ?? { key, doctor, facility: text(option.facility?.name, "Cơ sở đang cập nhật"), department: text(option.department, "Khoa khám"), options: [] };
    current.options.push({ option, index: option.target_index ?? index });
    groups.set(key, current);
  });
  return [...groups.values()];
}

function healthcareSelectionAction(actions: AssistantAction[], targetIndex: number): AssistantAction | undefined {
  return actions.find((action) => action.target_index === targetIndex) ?? actions[targetIndex];
}

function actionForRestaurantOption(detail: AssistantOption | null, options: AssistantOption[], actions: AssistantAction[], disabledActionId: string | undefined, onAction: (action: AssistantAction) => void, close: (option: AssistantOption | null) => void): { label: string; onClick: () => void; disabled: boolean } | undefined {
  if (!detail) return undefined;
  const index = options.findIndex((option) => option === detail);
  const targetIndex = detail.target_index ?? index;
  const action = actions.find((candidate) => candidate.target_index === targetIndex) ?? actions[index];
  if (!action) return undefined;
  return {
    label: "Chọn nhà hàng này",
    disabled: Boolean(disabledActionId),
    onClick: () => { close(null); onAction(action); },
  };
}

function actionForHealthcareOption(detail: AssistantOption | null, groups: HealthcareOptionGroup[], actions: AssistantAction[], disabledActionId: string | undefined, onAction: (action: AssistantAction) => void, close: (option: AssistantOption | null) => void): { label: string; onClick: () => void; disabled: boolean } | undefined {
  if (!detail) return undefined;
  const selected = groups.flatMap((group) => group.options).find((candidate) => candidate.option === detail);
  const action = selected ? healthcareSelectionAction(actions, selected.index) : undefined;
  if (!action) return undefined;
  return {
    label: "Chọn lịch này",
    disabled: Boolean(disabledActionId),
    onClick: () => { close(null); onAction(action); },
  };
}

function SimpleCard({ item }: { item: { title: string; question?: string; note?: string } }) {
  return <article className="assistant-card card-simple"><CardHeading icon={<SparkIcon />} label="X-One" title={item.title} />{item.question || item.note ? <p>{text(item.question ?? item.note)}</p> : null}</article>;
}

function AddressOptionsCard({ item }: { item: AssistantAddressOptionsItem }) {
  const purpose = item.purpose === "PICKUP" ? "điểm đón" : item.purpose === "DROPOFF" ? "điểm đến" : "địa chỉ giao hàng";
  return <article className="assistant-card card-simple"><CardHeading icon={<MapPin size={17} />} label="Địa chỉ" title={item.title || `Chọn ${purpose}`} />
    <p>{text(item.note, `Bạn muốn dùng ${purpose} nào? Chọn một địa chỉ đã lưu hoặc nhập địa chỉ mới trong tin nhắn tiếp theo.`)}</p>
    {item.addresses.length ? <div className="option-list">{item.addresses.map((address) => <div className="option-row" key={`${address.label}-${address.address_text}`}><div><strong>{address.label}</strong><span><MapPin size={13} /> {address.address_text}</span></div>{address.is_default ? <small>Mặc định</small> : null}</div>)}</div> : null}
    {item.allow_new ? <p className="card-note">Bạn cũng có thể nhập một địa chỉ mới, cụ thể.</p> : null}
  </article>;
}

function TaskErrorCard({ item }: { item: AssistantTaskErrorItem }) {
  const requiresPatientProfile = item.error_code === "PATIENT_LINK_REQUIRED";
  const fallback = taskErrorCopy(item.error_code);
  return <article className="assistant-card card-simple"><CardHeading icon={<SparkIcon />} label="X-One" title={item.title || fallback.title} />
    <p>{text(item.note, "Mình chưa thể hoàn tất lựa chọn này. Bạn hãy kiểm tra lại thông tin rồi thử lại nhé.")}</p>
    {requiresPatientProfile ? <Link className="small-action task-error-action" href="/app/profile?section=patients">Liên kết hồ sơ người bệnh</Link> : null}
  </article>;
}

function taskErrorCopy(code?: string): { title: string; note: string } {
  switch (code) {
    case "NO_DRIVER": return { title: "Chưa tìm thấy tài xế", note: "Hiện chưa có tài xế phù hợp. Bạn có thể thử lại sau hoặc đổi thời gian/điểm đi." };
    case "SLOT_UNAVAILABLE": return { title: "Khung giờ không còn trống", note: "Khung giờ này vừa được chọn hết. Hãy chọn một khung giờ khác để tiếp tục." };
    case "ACTION_NOT_AVAILABLE": return { title: "Lựa chọn đã hết hiệu lực", note: "Lựa chọn cũ không còn dùng được. Hãy chọn phương án hiện tại trong cuộc trò chuyện." };
    default: return { title: "Dịch vụ gặp sự cố", note: "Mình chưa thể hoàn tất bước này. Bạn hãy kiểm tra thông tin hoặc thử lại." };
  }
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
function restaurantName(value: unknown): string { return typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string" ? String((value as Record<string, unknown>).name) : ""; }
function OptionImage({ source, alt, compact = false }: { source: unknown; alt: string; compact?: boolean }) { const [failed, setFailed] = useState(false); const url = typeof source === "string" && source.trim() ? source : ""; if (failed || !url) return <div className={`option-image${compact ? " compact" : ""} service-image-fallback`} role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh</div>; return <img className={`option-image${compact ? " compact" : ""}`} src={url} alt={alt} onError={() => setFailed(true)} loading="lazy" />; }
function SparkIcon() { return <Check size={17} />; }
