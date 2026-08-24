// filepath: apps/web/src/components/WorkflowCards.tsx
"use client";

import { CalendarDays, CarFront, Check, ChevronLeft, ChevronRight, CircleDollarSign, MapPin, Minus, Plus, ShieldCheck, Soup, Stethoscope, Utensils } from "lucide-react";
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
  const secondaryActions = response.actions.filter((action) => !["ride_service", "ride_payment", "select_restaurant", "restaurant_confirm", "select_healthcare_slot", "healthcare_cancel", "select_food_item", "food_cart_increment", "food_cart_decrement", "food_cart_remove", "food_checkout", "food_confirm", "food_payment"].includes(action.kind));
  return (
    <div className="flex flex-col gap-3">
      {response.items.map((item, index) => <AssistantCard key={`${item.kind}-${index}`} item={item} actions={response.actions} onAction={onAction} disabledActionId={disabledActionId} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} />)}
      {secondaryActions.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-2 mt-1 mb-2">
          {secondaryActions.map((action) => (
            <button
              key={action.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm disabled:opacity-50"
              type="button"
              onClick={() => onAction(action)}
              disabled={Boolean(disabledActionId)}
            >
              <ShieldCheck size={14} className="text-blue-600" /> {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
      return <RideCardWithCancel item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId} />;
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
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const allOptions = item.options ?? [];
  const totalPages = Math.max(1, Math.ceil(allOptions.length / pageSize));
  const paginatedOptions = allOptions
    .map((option, originalIndex) => ({ option, originalIndex }))
    .slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
        <CardHeading icon={<CalendarDays size={20} strokeWidth={2.5} />} label="Nhà hàng" title={item.title} />
        {allOptions.length ? (
          <>
            <div className="grid gap-3">
              {paginatedOptions.map(({ option, originalIndex }) => (
                <div className="flex gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors" key={`${String(option.name)}-${originalIndex}`}>
                  <OptionImage source={option.image_url} alt={optionalText(option.name, "Nhà hàng")} compact />
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <strong className="text-sm font-bold text-slate-900 truncate">{text(option.name, "Nhà hàng")}</strong>
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 truncate mt-0.5"><MapPin size={12} className="shrink-0 text-slate-400" /> {text(option.address ?? option.location, "Địa điểm đang được cập nhật")}</span>
                    <small className="text-[11px] font-semibold text-slate-500 mt-1">{text(option.cuisine, "Ẩm thực đang cập nhật")} {option.rating !== undefined ? `· ${option.rating} ★` : ""}</small>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0 justify-center ml-2">
                    {selectionActions[originalIndex] ? <button className="w-[84px] py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50" type="button" onClick={() => onAction(selectionActions[originalIndex]!)} disabled={Boolean(disabledActionId)}>Chọn quán</button> : null}
                    <button className="w-[84px] py-1.5 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm" type="button" onClick={() => setDetail(option)}>Chi tiết</button>
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Trang <strong className="text-slate-900">{page}</strong> / {totalPages} <span className="lowercase text-slate-400 font-medium">({allOptions.length} quán)</span>
                </span>
                <div className="flex gap-2">
                  <button className="inline-flex items-center justify-center gap-1 h-8 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" type="button" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={page <= 1}>
                    <ChevronLeft size={14} strokeWidth={2.5} /> Trước
                  </button>
                  <button className="inline-flex items-center justify-center gap-1 h-8 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" type="button" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={page >= totalPages}>
                    Sau <ChevronRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : <p className="text-sm text-slate-500 italic px-2">{text(item.note, "Mình đang cập nhật thêm lựa chọn cho bạn.")}</p>}
        {item.note && allOptions.length > 0 ? <p className="text-xs font-medium text-slate-500 bg-slate-50 rounded-lg p-3 mt-4 border border-slate-100">{text(item.note)}</p> : null}
      </article>
      <ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="restaurant" option={detail} primaryAction={actionForRestaurantOption(detail, allOptions, rawSelectionActions, disabledActionId, onAction, setDetail)} />
    </>
  );
}

function RestaurantConfirmation({ item, actions, onAction, disabledActionId }: { item: AssistantRestaurantConfirmationItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const action = actions.find((candidate) => candidate.kind === "restaurant_confirm");
  const isCanceled = item.status === "FAILED" || item.status === "DISCARDED" || item.status === "CANCELLED";
  return (
    <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
      <CardHeading icon={<CalendarDays size={20} strokeWidth={2.5} />} label="Đặt bàn" title={item.title} />
      <div className="flex flex-col gap-1 mb-4">
        <Detail label="Nhà hàng" value={text(item.restaurant?.name, "Nhà hàng đã chọn")} />
        <Detail label="Địa điểm" value={text(item.restaurant?.location, "Đang cập nhật")} />
        <Detail label="Thời gian" value={formatDateTime(item.start_at)} />
        <Detail label="Số khách" value={item.party_size ? `${String(item.party_size)} người` : "Theo yêu cầu"} />
        <Detail label="Trạng thái" value={statusLabel(item.status)} />
      </div>
      {item.note ? <p className="text-xs font-medium text-slate-500 bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100">{text(item.note)}</p> : null}
      {action && !isCanceled ? (
        <section className="pt-4 border-t border-slate-100" aria-label="Xác nhận đặt bàn">
          <label className="flex items-center gap-3 cursor-pointer group mb-4">
            <input className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Tôi xác nhận thông tin đặt bàn ở trên.</span>
          </label>
          <button className="flex items-center justify-center w-full gap-2 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed" type="button" onClick={() => onAction(action)} disabled={!confirmed || Boolean(disabledActionId)}>
            <ShieldCheck size={18} strokeWidth={2.5} /> Xác nhận đặt bàn
          </button>
        </section>
      ) : null}
    </article>
  );
}

function RideCard({ item, children, actions, onAction, disabledActionId }: { item: AssistantRideItem; children?: ReactNode; actions?: AssistantAction[]; onAction?: ActionHandler; disabledActionId?: string }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const bookingId = item.booking_id ?? item.resource_id;
  const { data: tracking } = useRideTracking(bookingId);
  const distance = item.distance_km !== undefined ? `${item.distance_km} km` : item.route_distance_meters ? `${(item.route_distance_meters / 1000).toFixed(1)} km` : undefined;
  const duration = item.duration_minutes ? `${item.duration_minutes} phút` : item.route_duration_seconds ? `${Math.ceil(item.route_duration_seconds / 60)} phút` : undefined;
  const price = formatMoney(item.amount, text(item.currency, "VND"));
  const vehicle = text(item.vehicle, "Xe 4 chỗ");
  const confirmAction = actions?.find((a) => a.kind === "ride_service" || a.kind === "ride_payment" || a.label?.includes("Xác nhận"));

  return (
    <>
      <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden relative">
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/60 shadow-sm shadow-blue-600/10">
              <CarFront size={22} strokeWidth={2} />
            </div>
            <div className="grid gap-0.5 mt-0.5">
              <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest">CHUYẾN XE</span>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">{text(item.title, "Ước tính chuyến đi")}</h3>
            </div>
          </div>
          {item.amount !== undefined && (
            <div className="text-right">
              <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Giá dự kiến</span>
              <strong className="text-xl font-extrabold text-slate-900">{price}</strong>
            </div>
          )}
        </div>

        <div className="relative pl-3.5 space-y-5 mb-6 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 before:rounded-full">
          <div className="relative flex gap-4">
            <span className="relative z-10 w-2.5 h-2.5 mt-1.5 rounded-full bg-slate-300 ring-4 ring-white shrink-0 shadow-sm" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase">ĐIỂM ĐÓN</span>
              <strong className="text-sm font-semibold text-slate-900 leading-tight">{text(item.pickup, "Điểm đón chưa rõ")}</strong>
            </div>
          </div>
          <div className="relative flex gap-4">
            <span className="relative z-10 w-2.5 h-2.5 mt-1.5 rounded-full bg-blue-600 ring-4 ring-white shrink-0 shadow-sm" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase">ĐIỂM ĐẾN</span>
              <strong className="text-sm font-semibold text-slate-900 leading-tight">{text(item.dropoff, "Điểm đến chưa rõ")}</strong>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Loại xe</span>
            <strong className="text-sm font-semibold text-slate-900">{vehicle}</strong>
          </div>
          {distance && (
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Quãng đường</span>
              <strong className="text-sm font-semibold text-slate-900">{distance}</strong>
            </div>
          )}
          {duration && (
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Thời gian</span>
              <strong className="text-sm font-semibold text-slate-900">{duration}</strong>
            </div>
          )}
          {tracking?.status || item.status ? (
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Trạng thái</span>
              <strong className="text-sm font-semibold text-slate-900">{statusLabel(tracking?.status ?? item.status)}</strong>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          {confirmAction && onAction ? (
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed" type="button" onClick={() => onAction(confirmAction)} disabled={Boolean(disabledActionId)}>
              <Check size={18} strokeWidth={2.5} /> {confirmAction.label || "Xác nhận chuyến xe"}
            </button>
          ) : (
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-blue-600/20 opacity-50 cursor-not-allowed" type="button" disabled>
              <Check size={18} strokeWidth={2.5} /> Xác nhận chuyến xe
            </button>
          )}
          <button className="flex-1 py-2.5 bg-white text-slate-700 text-sm font-bold rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all shadow-sm" type="button" onClick={() => setDetailOpen(true)}>
            Xem bản đồ hành trình
          </button>
        </div>

        {tracking ? <div className="mt-5 pt-5 border-t border-slate-100"><RideLiveStatus tracking={tracking} /></div> : null}
        {item.schedule_note ? <p className="text-xs font-medium text-slate-500 bg-slate-50 rounded-lg p-3 mt-5 border border-slate-100">{text(item.schedule_note)}</p> : null}
        {children && <div className="mt-4">{children}</div>}
      </article>
      <ServiceDetailDialog open={detailOpen} onOpenChange={setDetailOpen} kind="ride" option={null} ride={item} />
    </>
  );
}

function RideCardWithCancel({ item, actions, onAction, disabledActionId }: { item: AssistantRideItem; actions?: AssistantAction[]; onAction?: ActionHandler; disabledActionId?: string }) {
  const bookingId = item.kind === "ride_booking" ? item.booking_id ?? item.resource_id : undefined;
  const { data: tracking } = useRideTracking(bookingId);
  return <RideCard item={item} actions={actions} onAction={onAction} disabledActionId={disabledActionId}>{item.kind === "ride_booking" ? <div className="pt-4 border-t border-slate-100 flex justify-end"><RideCancelButton bookingId={bookingId} status={tracking?.status ?? item.status} className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors" /></div> : null}</RideCard>;
}

function RideTimingConflictCard({ item }: { item: AssistantRideTimingConflictItem }) {
  return (
    <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
      <CardHeading icon={<CarFront size={20} strokeWidth={2.5} />} label="Chuyến xe" title={item.title} />
      {item.appointment_start_time ? (
        <div className="flex flex-col gap-1 mb-4">
          <Detail label="Lịch khám" value={formatDateTime(item.appointment_start_time)} />
          {item.recommended_departure ? <Detail label="Giờ nên rời đi" value={formatDateTime(item.recommended_departure)} /> : null}
        </div>
      ) : null}
      <p className="text-xs font-medium text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-100">{text(item.note, "Mình chưa tạo hoặc hủy chuyến xe. Bạn hãy cập nhật lịch hoặc điểm đón để thử lại.")}</p>
    </article>
  );
}

function HealthcareCard({ item, actions, onAction, disabledActionId }: { item: AssistantHealthcareOptionsItem; actions: AssistantAction[]; onAction: (action: AssistantAction) => void; disabledActionId?: string }) {
  const selectionActions = actions.filter((action) => action.kind === "select_healthcare_slot");
  const [detail, setDetail] = useState<AssistantOption | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Record<string, number>>({});
  const groups = groupHealthcareOptions(item.options ?? []);
  return (
    <>
      <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
        <CardHeading icon={<Stethoscope size={20} strokeWidth={2.5} />} label="Lịch khám" title={item.title} />
        {groups.length ? (
          <div className="grid gap-4 mt-2">
            {groups.map((group) => {
              const selectedIndex = selectedSlots[group.key] ?? group.options[0]?.index;
              const selected = group.options.find((candidate) => candidate.index === selectedIndex);
              const action = selectedIndex === undefined ? undefined : healthcareSelectionAction(selectionActions, selectedIndex);
              return (
                <section className="p-4 bg-slate-50/80 border border-slate-100 rounded-2xl" key={group.key}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="grid gap-0.5">
                      <strong className="text-[15px] font-bold text-slate-900">{group.doctor}</strong>
                      <span className="text-xs font-medium text-slate-500">{text(group.facility, "Cơ sở đang cập nhật")} · <span className="font-semibold text-slate-600">{text(group.department, "Khoa khám")}</span></span>
                    </div>
                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-extrabold text-blue-600 uppercase tracking-widest">{group.options.length} khung giờ</span>
                  </div>
                  <div className="mb-4">
                    <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Chọn khung giờ</label>
                    <select className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm cursor-pointer" aria-label={"Khung giờ của " + group.doctor} value={selectedIndex ?? ""} onChange={(event) => setSelectedSlots((current) => ({ ...current, [group.key]: Number(event.target.value) }))}>
                      {group.options.map((candidate) => <option value={candidate.index} key={candidate.index}>{formatDateTime(candidate.option.start_time)}{candidate.option.price !== undefined ? " · " + formatMoney(candidate.option.price, "VND") : ""}</option>)}
                    </select>
                  </div>
                  {selected ? (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-blue-600">{formatDateTime(selected.option.start_time)}</span>
                        {selected.option.price !== undefined && <span className="text-xs font-bold text-slate-500">{formatMoney(selected.option.price, "VND")}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button className="px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all shadow-sm" type="button" onClick={() => setDetail(selected.option)}>Chi tiết</button>
                        {action ? <button className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 active:scale-95 transition-all" type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}>Chọn lịch</button> : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : item.departments?.length ? (
          <div className="grid gap-2">
            {item.departments.map((department, index) => (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl" key={String(department.name) + "-" + index}>
                <strong className="text-sm font-bold text-slate-900 block mb-0.5">{text(department.name, "Khoa khám")}</strong>
                <span className="text-xs font-medium text-slate-500">{text(department.description, "Hãy nhấn tên khoa để xem lịch trống.")}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500 italic px-2">{text(item.note, "Mình đang cập nhật lịch khám phù hợp.")}</p>}
        {item.note && groups.length > 0 ? <p className="text-xs font-medium text-slate-500 bg-slate-50 rounded-lg p-3 mt-4 border border-slate-100">{text(item.note)}</p> : null}
      </article>
      <ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="healthcare" option={detail} primaryAction={actionForHealthcareOption(detail, groups, selectionActions, disabledActionId, onAction, setDetail)} />
    </>
  );
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

  return (
    <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
      <CardHeading icon={<Stethoscope size={20} strokeWidth={2.5} />} label="Lịch khám" title={item.title} />
      <div className="flex flex-col gap-1 mb-4">
        <Detail label="Bác sĩ" value={text(item.doctor ?? appointment?.doctor_name, "Theo lựa chọn")} />
        <Detail label="Khoa" value={text(item.department ?? appointment?.department, "Thông tin khoa chưa có")} />
        <Detail label="Thời gian" value={formatDateTime(item.start_time ?? appointment?.start_time)} />
        <Detail label="Cơ sở" value={text(facility?.name, "Cơ sở chưa có tên")} />
        <Detail label="Địa chỉ" value={text(facility?.address, "Địa chỉ cơ sở chưa có")} />
        <Detail label="Chi phí" value={formatMoney(item.price ?? appointment?.price, "VND")} />
        <Detail label="Trạng thái" value={statusLabel(item.status ?? appointment?.status)} />
      </div>
      {item.note || item.payment_note ? <p className="text-xs font-medium text-slate-500 bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100">{text(item.note ?? item.payment_note)}</p> : null}

      {(alternatives.length && action) || cancelAction ? (
        <div className="pt-4 border-t border-slate-100 mt-2 flex flex-col gap-3">
          {alternatives.length && action ? (
            <div className="flex flex-col gap-3">
              <button className="self-start text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors" type="button" onClick={() => setChanging((value) => !value)} disabled={Boolean(disabledActionId)}>
                {changing ? "Đóng tùy chọn đổi lịch" : "Đổi khung giờ khác"}
              </button>
              {changing ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mt-1">
                  <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest block mb-2">Khung giờ mới</label>
                  <select className="w-full h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm cursor-pointer mb-3" aria-label="Khung giờ mới" value={selected?.target_index ?? ""} onChange={(event) => setTargetIndex(Number(event.target.value))}>
                    {alternatives.map((option) => <option key={option.target_index} value={option.target_index}>{text(option.doctor, "Bác sĩ")} · {formatDateTime(option.start_time)}{option.price !== undefined ? ` · ${formatMoney(option.price, "VND")}` : ""}</option>)}
                  </select>
                  <button className="w-full py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 active:scale-95 transition-all shadow-sm" type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId)}>
                    Giữ lịch mới này
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {cancelAction && !changing ? (
            <button className="self-start text-xs font-bold text-red-500 hover:text-red-700 transition-colors" type="button" onClick={() => onAction(cancelAction)} disabled={Boolean(disabledActionId)}>
              Hủy giữ chỗ khám
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
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
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const allOptions = item.options ?? [];
  const totalPages = Math.max(1, Math.ceil(allOptions.length / pageSize));
  const paginatedOptions = allOptions
    .map((option, originalIndex) => ({ option, originalIndex }))
    .slice((page - 1) * pageSize, page * pageSize);

  const updateQuantity = (key: string, action: AssistantAction | undefined, quantity: number, commit: boolean): void => {
    const next = Math.max(0, Math.min(50, Number.isFinite(quantity) ? Math.trunc(quantity) : 0));
    setQuantities((current) => ({ ...current, [key]: next }));
    const option = action ? item.options?.find((_candidate, index) => selectionActions[index]?.id === action.id) : undefined;
    if (action && option && onFoodSelectionChange) onFoodSelectionChange({ action, option, quantity: next });
    void commit;
  };
  const orderId = item.order?.id;

  return (
    <>
      <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
        <CardHeading icon={<Utensils size={20} strokeWidth={2.5} />} label="Đồ ăn" title={item.title} />
        {allOptions.length ? (
          <>
            <div className="grid gap-3">
              {paginatedOptions.map(({ option, originalIndex }) => {
                const key = `${String(option.name ?? option.title ?? originalIndex)}-${originalIndex}`;
                const action = selectionActions[originalIndex];
                const quantity = foodSelections?.[action?.id ?? ""]?.quantity ?? quantities[key] ?? 0;
                const price = typeof option.price === "number" ? option.price : 0;
                return (
                  <div className="flex gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all" key={key}>
                    <OptionImage source={option.image_url} alt={optionalText(option.name, "Món ăn")} compact />
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <strong className="text-sm font-bold text-slate-900 truncate">{text(option.name, "Món ăn")}</strong>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 truncate mt-0.5"><Soup size={12} className="shrink-0 text-slate-400" /> {restaurantName(option.restaurant) || text(option.restaurant, "Nhà hàng đang cập nhật")}</span>
                      <small className="text-[11px] text-slate-500 mt-1 line-clamp-1">{text(option.description, "Mô tả món đang cập nhật")}</small>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0 justify-center">
                      <b className="text-sm font-extrabold text-blue-600">{formatMoney(price, "VND")}</b>
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg h-8 shadow-sm overflow-hidden" aria-label={`Số lượng ${text(option.name, "món ăn")} `}>
                        <button className="flex items-center justify-center w-8 h-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-50" type="button" onClick={() => updateQuantity(key, action, quantity - 1, true)} disabled={!action || Boolean(disabledActionId) || quantity <= 0}><Minus size={14} /></button>
                        <input className="w-8 h-full text-center text-xs font-bold border-x border-slate-200 bg-slate-50 focus:outline-none" inputMode="numeric" min={0} max={50} type="number" value={quantity} onChange={(event) => updateQuantity(key, action, Number(event.target.value), false)} disabled={!action || Boolean(disabledActionId)} />
                        <button className="flex items-center justify-center w-8 h-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-50" type="button" onClick={() => updateQuantity(key, action, quantity + 1, true)} disabled={!action || Boolean(disabledActionId)}><Plus size={14} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Trang <strong className="text-slate-900">{page}</strong> / {totalPages} <span className="lowercase text-slate-400 font-medium">({allOptions.length} món)</span>
                </span>
                <div className="flex gap-2">
                  <button className="inline-flex items-center justify-center gap-1 h-8 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" type="button" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={page <= 1}>
                    <ChevronLeft size={14} strokeWidth={2.5} /> Trước
                  </button>
                  <button className="inline-flex items-center justify-center gap-1 h-8 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" type="button" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={page >= totalPages}>
                    Sau <ChevronRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : item.kind === "food_cart" ? (
          <p className="text-sm font-medium text-slate-600 px-2 py-1" role="status">Giỏ hàng đã được cập nhật ở khu vực bên dưới.</p>
        ) : (
          <p className="text-sm text-slate-500 italic px-2">Mình đang lấy danh sách món ăn phù hợp.</p>
        )}

        {item.kind === "food_confirmation" ? <FoodConfirmation item={item} confirmationAction={confirmationAction} paymentAction={paymentAction} onAction={onAction} disabledActionId={disabledActionId} /> : null}

        {item.order ? (
          <div className="mt-4 pt-4 border-t border-slate-100 grid gap-4">
            <div className="flex gap-4">
              <div className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Đơn hàng</span>
                <strong className="text-sm font-semibold text-slate-900">Đã tiếp nhận</strong>
              </div>
              <div className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Trạng thái</span>
                <strong className="text-sm font-semibold text-slate-900">{statusLabel(item.order.status)}</strong>
              </div>
            </div>
            {orderId ? <FoodTrackingPanel orderId={orderId} /> : null}
          </div>
        ) : null}

        {item.note || item.payment ? (
          <div className="flex items-start gap-2 p-3 mt-4 bg-green-50 text-green-700 border border-green-100 rounded-xl">
            <CircleDollarSign size={16} className="mt-0.5 shrink-0" />
            <p className="text-sm font-medium leading-relaxed">{text(item.note, item.payment ? "Thanh toán đã được ghi nhận." : "")}</p>
          </div>
        ) : null}
      </article>
      <ServiceDetailDialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} kind="food" option={detail} />
    </>
  );
}

function FoodConfirmation({ item, confirmationAction, paymentAction, onAction, disabledActionId }: { item: AssistantFoodItem; confirmationAction?: AssistantAction; paymentAction?: AssistantAction; onAction: ActionHandler; disabledActionId?: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const preview = item.preview;
  const pickupStops = item.pickup_stops ?? [];
  const readyForPayment = item.confirmation_state === "PAYMENT_REQUIRED";
  const action = readyForPayment ? paymentAction : confirmationAction;
  const isCanceled = (item as any).status === "FAILED" || (item as any).status === "DISCARDED" || (item as any).status === "CANCELLED";
  const cartItems = item.cart?.items?.filter((cartItem) => text(cartItem.name).length > 0) ?? [];

  return (
    <section className="pt-4 mt-4 border-t border-slate-100" aria-label="Xác nhận đơn giao hàng">
      <div className="flex flex-col gap-1 mb-5">
        <Detail label="Điểm lấy hàng" value={pickupStops.length ? pickupStops.map((stop) => text(stop.name, "Nhà hàng")).join(" → ") : "Theo món đã chọn"} />
        <Detail label="Địa chỉ giao" value={text(item.delivery_address, "Chưa có địa chỉ giao hàng")} />
        <Detail label="Phí giao" value={formatMoney(preview?.delivery?.fee?.amount, preview?.delivery?.fee?.currency ?? "VND")} />
        <Detail label="Tổng thanh toán" value={formatMoney(preview?.total?.amount ?? item.cart?.total, preview?.total?.currency ?? "VND")} />
        <Detail label="Trạng thái" value={readyForPayment ? "Chờ thanh toán" : "Chờ xác nhận thông tin"} />
      </div>

      {cartItems.length ? (
        <div className="mb-5 bg-slate-50/50 border border-slate-100 rounded-xl p-4">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-3">Món đã chọn</span>
          <ul className="grid gap-2.5" aria-label="Món đã chọn">
            {cartItems.map((cartItem, index) => (
              <li className="flex justify-between items-start gap-4 text-sm" key={`${text(cartItem.name, "món")}-${index}`}>
                <span className="text-slate-700 font-medium">{text(cartItem.name, "Món ăn")} <span className="text-slate-400 font-normal ml-1">× {cartItem.quantity ?? 1}</span></span>
                <strong className="font-bold text-slate-900">{formatMoney((cartItem.unit_price ?? cartItem.price ?? 0) * (cartItem.quantity ?? 1), cartItem.currency ?? "VND")}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pickupStops.length > 1 ? <p className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3 mb-5">Một tài xế sẽ lần lượt lấy món tại {pickupStops.length} địa điểm rồi giao đến địa chỉ của bạn.</p> : null}

      {!readyForPayment && !isCanceled ? (
        <label className="flex items-start gap-3 cursor-pointer group mb-5">
          <input className="mt-0.5 w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Tôi xác nhận các món, điểm lấy hàng và địa chỉ giao ở trên là đúng.</span>
        </label>
      ) : null}

      {action && !isCanceled ? (
        <button className="flex items-center justify-center w-full gap-2 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed" type="button" onClick={() => onAction(action)} disabled={Boolean(disabledActionId) || (!readyForPayment && !confirmed)}>
          <CircleDollarSign size={18} strokeWidth={2.5} /> {readyForPayment ? "Thanh toán đơn hàng" : "Xác nhận thông tin đơn"}
        </button>
      ) : null}
    </section>
  );
}

export function FoodCartDock({ total, onConfirm, disabled }: { total: number; onConfirm: () => void; disabled?: boolean }) {
  return (
    <section className="shrink-0 px-4 md:px-6 pt-2 pb-0 bg-transparent mb-2 z-10" aria-label="Tổng tiền đơn món ăn">
      <div className="max-w-4xl mx-auto flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-800">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giỏ hàng tạm tính</span>
          <strong className="text-xl font-extrabold">{formatMoney(total, "VND")}</strong>
        </div>
        <button className="flex items-center gap-2 px-5 md:px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md" type="button" onClick={onConfirm} disabled={Boolean(disabled) || total <= 0}>
          <CircleDollarSign size={18} strokeWidth={2.5} /> Xác nhận đặt
        </button>
      </div>
    </section>
  );
}

function RideLiveStatus({ tracking }: { tracking: import("../types").RideTracking }): ReactNode {
  const driver = parseRideDriver(tracking.driver);
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <strong className="text-sm font-bold text-slate-900">{statusLabel(tracking.status)}</strong>
      {tracking.driver ? <span className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg w-fit">{driver.name}{driver.rating ? " · " + driver.rating + " ★" : ""}{driver.vehicle ? " · " + driver.vehicle : ""}</span> : null}
    </div>
  );
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
  return (
    <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
      <CardHeading icon={<Check size={20} strokeWidth={2.5} />} label="X-One" title={item.title} />
      {item.question || item.note ? <p className="text-sm font-medium text-slate-700 mt-2 leading-relaxed">{text(item.question ?? item.note)}</p> : null}
    </article>
  );
}

function AddressOptionsCard({ item }: { item: AssistantAddressOptionsItem }) {
  const purpose = item.purpose === "PICKUP" ? "điểm đón" : item.purpose === "DROPOFF" ? "điểm đến" : "địa chỉ giao hàng";
  return (
    <article className="flex flex-col p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
      <CardHeading icon={<MapPin size={20} strokeWidth={2.5} />} label="Địa chỉ" title={item.title || `Chọn ${purpose}`} />
      <p className="text-sm font-medium text-slate-700 mb-4">{text(item.note, `Bạn muốn dùng ${purpose} nào? Chọn một địa chỉ đã lưu hoặc nhập địa chỉ mới trong tin nhắn tiếp theo.`)}</p>

      {item.addresses.length ? (
        <div className="grid gap-2 mb-4">
          {item.addresses.map((address) => (
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl" key={`${address.label}-${address.address_text}`}>
              <div className="flex flex-col">
                <strong className="text-sm font-bold text-slate-900">{address.label}</strong>
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mt-0.5"><MapPin size={11} className="shrink-0 text-slate-400" /> {address.address_text}</span>
              </div>
              {address.is_default ? <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-lg shrink-0">Mặc định</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {item.allow_new ? <p className="text-xs font-medium text-slate-500 bg-slate-50/80 rounded-lg p-3 border border-slate-100">Bạn cũng có thể nhập một địa chỉ mới, cụ thể.</p> : null}
    </article>
  );
}

function TaskErrorCard({ item }: { item: AssistantTaskErrorItem }) {
  const requiresPatientProfile = item.error_code === "PATIENT_LINK_REQUIRED";
  const fallback = taskErrorCopy(item.error_code);
  return (
    <article className="flex flex-col p-5 bg-red-50 border border-red-100 rounded-2xl shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <div className="grid place-items-center w-10 h-10 rounded-xl bg-red-100 border border-red-200 text-red-600 shrink-0">
          <ShieldCheck size={20} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col mt-0.5">
          <span className="text-[10px] font-extrabold text-red-500 uppercase tracking-widest">LỖI XỬ LÝ</span>
          <h3 className="text-base font-bold text-red-900">{item.title || fallback.title}</h3>
        </div>
      </div>
      <p className="text-sm font-medium text-red-700 leading-relaxed">{text(item.note, "Mình chưa thể hoàn tất lựa chọn này. Bạn hãy kiểm tra lại thông tin rồi thử lại nhé.")}</p>
      {requiresPatientProfile ? (
        <div className="mt-4 pt-4 border-t border-red-200/50">
          <Link className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 active:scale-95 transition-all shadow-sm" href="/app/profile?section=patients">
            Liên kết hồ sơ người bệnh
          </Link>
        </div>
      ) : null}
    </article>
  );
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
  return (
    <article className="flex flex-col p-5 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm">
      <CardHeading icon={<Check size={20} strokeWidth={2.5} />} label="Hệ thống" title={item.title} />
      <p className="text-sm font-medium text-slate-700 mt-2">{text(item.note ?? item.question, "Mình đã nhận thông tin mới và sẽ cập nhật ở bước tiếp theo.")}</p>
    </article>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unknown Assistant item kind: ${String((value as { kind?: unknown }).kind)}`);
}

function CardHeading({ icon, label, title }: { icon: ReactNode; label: string; title: unknown }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="grid place-items-center w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 shrink-0">
        {icon}
      </div>
      <div className="flex flex-col mt-0.5">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{label}</span>
        <h3 className="text-[15px] font-bold text-slate-900">{text(title, "Thông tin mới")}</h3>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <strong className="text-sm font-bold text-slate-900 text-right">{value}</strong>
    </div>
  );
}

function text(value: unknown, fallback = ""): string { return typeof value === "string" && value.trim() ? value : fallback; }
function restaurantName(value: unknown): string { return typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string" ? String((value as Record<string, unknown>).name) : ""; }

function OptionImage({ source, alt, compact = false }: { source: unknown; alt: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = typeof source === "string" && source.trim() ? source : "";
  const sizeClass = compact ? "w-16 h-16 rounded-xl" : "w-full h-40 rounded-t-2xl md:h-48";

  if (failed || !url) return <div className={`grid place-items-center bg-slate-100 text-slate-400 border border-slate-200 shrink-0 ${sizeClass}`} role="img" aria-label={`${alt}: ảnh không khả dụng`}><Utensils size={compact ? 20 : 32} strokeWidth={2} /></div>;

  return <img className={`object-cover bg-slate-100 border border-slate-200 shrink-0 ${sizeClass}`} src={url} alt={alt} onError={() => setFailed(true)} loading="lazy" />;
}
