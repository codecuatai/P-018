"use client";

import { ArrowLeft, ArrowRight, Bike, Check, ChevronLeft, ChevronRight, HeartPulse, Loader2, MapPinned, Search, ShieldCheck, ShoppingBag, Utensils } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  acknowledgeHealthcarePayment,
  addFoodCartItem,
  applyFoodVoucher,
  autocompleteAddress,
  browseService,
  cancelHealthcareAppointment,
  cancelRestaurantReservation,
  checkRestaurantAvailability,
  confirmRideBooking,
  createFoodCart,
  createRestaurantHold,
  errorText,
  executeCancellation,
  executeConfirmation,
  getFoodMenu,
  getFoodRestaurant,
  getRestaurantDetail,
  holdHealthcareSlot,
  listHealthcareDoctors,
  listHealthcarePatients,
  listSavedAddresses,
  prepareFoodCancellation,
  prepareFoodOrder,
  prepareHealthcareAppointment,
  prepareRestaurantReservation,
  prepareRideBooking,
  createRideQuote,
  removeFoodCartItem,
  removeFoodVoucher,
  updateFoodCartItem,
} from "@/lib/api-client";
import type { AssistantRideItem, GeocodeCandidate, HealthcarePatient, RideQuote, SavedAddress, ServiceKey } from "@/types";

import { RideTrackingPanel } from "./ride-tracking";
import { FoodTrackingPanel } from "./food-tracking";
import { XOneMap } from "./xone-map";
import { formatDateTime, formatMoney as presentMoney, statusLabel } from "@/lib/presentation";
import { FavoriteToggle } from "./favorite-toggle";
import { ServiceDetailDialog } from "@/components/ServiceDetailDialog";

type JsonRecord = Record<string, unknown>;
type Point = { latitude: number; longitude: number };

const copy: Record<ServiceKey, { label: string; description: string; action: string }> = {
  food: { label: "Đồ ăn", description: "Chọn nhà hàng, xem thực đơn và hoàn tất đơn giao.", action: "Tìm món" },
  ride: { label: "Chuyến xe", description: "Tính lộ trình, kiểm tra báo giá và xác nhận chuyến rõ ràng.", action: "Nhận báo giá" },
  restaurant: { label: "Nhà hàng", description: "Tìm địa điểm, kiểm tra bàn trống và giữ chỗ theo thời gian thực.", action: "Tìm nhà hàng" },
  healthcare: { label: "Lịch khám", description: "Chọn chuyên khoa, bác sĩ, khung giờ và hồ sơ bệnh nhân.", action: "Tìm chuyên khoa" },
};
const icons = { food: Utensils, ride: Bike, restaurant: MapPinned, healthcare: HeartPulse };

export function ServiceBrowse({ service }: { service: ServiceKey }) {
  const Icon = icons[service];
  return (
    <section className="w-full flex flex-col gap-6" aria-labelledby="service-browse-title">
      <div className="flex items-center justify-between">
        <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors" href="/app/services">
          <ArrowLeft size={16} /> Dịch vụ
        </Link>
        <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-full" href={`/app?service=${service}&mode=assistant`}>
          Tiếp tục với X-One AI <ArrowRight size={14} />
        </Link>
      </div>
      <header className="flex items-start gap-4 p-5 md:p-6 bg-white rounded-3xl border border-slate-200/60 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-700 flex items-center justify-center shrink-0 border border-slate-100">
          <Icon size={24} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">{service.toUpperCase()}</span>
          <h1 id="service-browse-title" className="text-xl font-bold text-slate-900 tracking-tight">{copy[service].label}</h1>
          <p className="text-sm font-medium text-slate-500 leading-relaxed">{copy[service].description}</p>
        </div>
      </header>
      {service === "food" ? <FoodBrowse /> : service === "restaurant" ? <RestaurantBrowse /> : service === "healthcare" ? <HealthcareBrowseWithFavorite /> : <RideBrowse />}
    </section>
  );
}

function FoodBrowse() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [restaurant, setRestaurant] = useState<JsonRecord>();
  const [menuItems, setMenuItems] = useState<JsonRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cart, setCart] = useState<JsonRecord>();
  const [cartLoading, setCartLoading] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [voucher, setVoucher] = useState("");
  const [confirmation, setConfirmation] = useState<JsonRecord>();
  const [orderResult, setOrderResult] = useState<JsonRecord>();
  const [cancelConfirmation, setCancelConfirmation] = useState<JsonRecord>();
  const [checked, setChecked] = useState(false);
  const [cancelChecked, setCancelChecked] = useState(false);
  const [notice, setNotice] = useState("");
  const [customizingItem, setCustomizingItem] = useState<JsonRecord>();
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const [menuPage, setMenuPage] = useState(1);
  const menuPageSize = 4;

  const load = useCallback(async (query = "") => {
    setLoading(true); setError("");
    setPage(1);
    try { setItems((await browseService("food", query)).items); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); void listSavedAddresses().then((result) => { setAddresses(result.items); setAddressId(result.items.find((item) => item.is_default)?.id ?? result.items[0]?.id ?? ""); }).catch(() => undefined); }, [load]);

  async function openRestaurant(item: JsonRecord): Promise<void> {
    const id = idOf(item);
    if (!id) return;
    setSelectedId(id); setRestaurant(undefined); setMenuItems([]); setCart(undefined); setConfirmation(undefined); setOrderResult(undefined); setError(""); setDetailLoading(true); setMenuPage(1);
    try {
      const [detail, menu] = await Promise.all([getFoodRestaurant(id), getFoodMenu(id)]);
      setRestaurant(detail); setMenuItems(listFrom(menu.items));
    } catch (reason) { setError(errorText(reason)); }
    finally { setDetailLoading(false); }
  }

  async function addItem(item: JsonRecord, selectedOptions: Array<{ group_id: string; option_id: string }> = [], note?: string): Promise<void> {
    if (!selectedId || cartLoading) return;
    setCartLoading(true); setError("");
    try {
      const current = cart ?? await createFoodCart(selectedId);
      const next = await addFoodCartItem(String(current.id), { menu_item_id: idOf(item), quantity: 1, ...(selectedOptions.length ? { selected_options: selectedOptions } : {}), ...(note?.trim() ? { note: note.trim() } : {}) });
      setCart(next);
      setCustomizingItem(undefined);
      setNotice(`${display(item.name ?? item.title ?? "Món ăn")} đã được thêm vào giỏ.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function changeQuantity(item: JsonRecord, quantity: number): Promise<void> {
    if (!cart || quantity < 1) return;
    setCartLoading(true); setError("");
    try { setCart(await updateFoodCartItem(String(cart.id), String(item.id), { quantity })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function removeItem(item: JsonRecord): Promise<void> {
    if (!cart) return;
    setCartLoading(true); setError("");
    try { setCart(await removeFoodCartItem(String(cart.id), String(item.id))); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function applyVoucherCode(): Promise<void> {
    if (!cart || !voucher.trim()) return;
    setCartLoading(true); setError("");
    try { setCart(await applyFoodVoucher(String(cart.id), voucher.trim())); setVoucher(""); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function removeVoucherCode(): Promise<void> {
    if (!cart) return;
    setCartLoading(true); setError("");
    try { setCart(await removeFoodVoucher(String(cart.id))); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function prepareOrder(): Promise<void> {
    if (!cart?.id || !addressId) { setError(addresses.length ? "Chọn địa chỉ giao hàng trước khi xem preview." : "Bạn cần lưu một địa chỉ giao hàng trước."); return; }
    setCartLoading(true); setError("");
    try { setConfirmation(await prepareFoodOrder({ cart_id: String(cart.id), address_id: addressId })); setChecked(false); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function executeOrder(): Promise<void> {
    if (!confirmation?.id || !checked) return;
    setCartLoading(true); setError("");
    try { setOrderResult(await executeConfirmation(String(confirmation.id), { payment_method: "card" })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function prepareCancel(): Promise<void> {
    const order = asRecord(orderResult?.order);
    if (!order?.id) return;
    setCartLoading(true); setError("");
    try { setCancelConfirmation(await prepareFoodCancellation(String(order.id))); setCancelChecked(false); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function executeCancel(): Promise<void> {
    if (!cancelConfirmation?.id || !cancelChecked) return;
    setCartLoading(true); setError("");
    try { setOrderResult(await executeCancellation(String(cancelConfirmation.id))); setCancelConfirmation(undefined); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);
  const totalMenuPages = Math.max(1, Math.ceil(menuItems.length / menuPageSize));
  const paginatedMenuItems = menuItems.slice((menuPage - 1) * menuPageSize, menuPage * menuPageSize);

  if (selectedId) {
    return (
      <div className="flex flex-col gap-6">
        <button className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors self-start" type="button" onClick={() => { setSelectedId(""); setError(""); }}>
          <ChevronLeft size={16} /> Danh sách nhà hàng
        </button>
        {detailLoading ? (
          <LoadingNote text="Đang tải nhà hàng và thực đơn…" />
        ) : restaurant ? (
          <>
            <DetailHeading item={restaurant} service="food" />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-blue-50/50 rounded-3xl border border-blue-100">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">THỰC ĐƠN</span>
                    <h2 className="text-lg font-bold text-slate-900">Món đang phục vụ</h2>
                  </div>
                  <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors bg-white px-3 py-1.5 rounded-full border border-blue-100 shadow-sm" href="/app?service=food&mode=assistant">
                    Hỏi X-One AI <ArrowRight size={14} />
                  </Link>
                </div>
                {customizingItem ? (
                  <FoodItemCustomizer item={customizingItem} loading={cartLoading} onCancel={() => setCustomizingItem(undefined)} onAdd={(options, note) => void addItem(customizingItem, options, note)} />
                ) : null}
                {menuItems.length ? (
                  <>
                    <div className="flex flex-col gap-4">
                      {paginatedMenuItems.map((item) => (
                        <article className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-3xl border border-slate-200/60 shadow-sm hover:border-slate-300 transition-colors items-start sm:items-center" key={idOf(item)}>
                          <AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Món ăn")} />
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-900 truncate">{display(item.name ?? item.title ?? "Món ăn")}</h3>
                            <p className="text-sm font-medium text-slate-500 line-clamp-2">{display(item.description ?? "Mô tả món đang cập nhật")}</p>
                            <strong className="text-blue-600 mt-1">{formatMoney(item.price ?? item.base_price)}</strong>
                          </div>
                          <button className="w-full sm:w-auto mt-2 sm:mt-0 px-4 py-2 bg-blue-50 text-blue-600 text-sm font-bold rounded-xl hover:bg-blue-100 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2" type="button" onClick={() => listFrom(item.options ?? item.option_groups ?? item.modifier_groups).length ? setCustomizingItem(item) : void addItem(item)} disabled={cartLoading || item.available === false}>
                            <ShoppingBag size={15} /> {listFrom(item.options ?? item.option_groups ?? item.modifier_groups).length ? "Tùy chỉnh" : "Thêm"}
                          </button>
                        </article>
                      ))}
                    </div>
                    {totalMenuPages > 1 ? (
                      <div className="flex items-center justify-between py-2 border-t border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trang <span className="text-slate-700">{menuPage}</span> / {totalMenuPages} ({menuItems.length} món)</span>
                        <div className="flex items-center gap-2">
                          <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setMenuPage((c) => Math.max(1, c - 1))} disabled={menuPage <= 1} aria-label="Trang trước">
                            <ChevronLeft size={14} /> Trước
                          </button>
                          <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setMenuPage((c) => Math.min(totalMenuPages, c + 1))} disabled={menuPage >= totalMenuPages} aria-label="Trang sau">
                            Sau <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyNote title="Thực đơn chưa có món" body="Nhà hàng này chưa có món có thể đặt." />
                )}
              </div>
              <FoodCart cart={cart} addresses={addresses} addressId={addressId} setAddressId={setAddressId} voucher={voucher} setVoucher={setVoucher} loading={cartLoading} onVoucher={() => void applyVoucherCode()} onRemoveVoucher={() => void removeVoucherCode()} onQuantity={(item, quantity) => void changeQuantity(item, quantity)} onRemove={(item) => void removeItem(item)} onPreview={() => void prepareOrder()} confirmation={confirmation} checked={checked} setChecked={setChecked} onExecute={() => void executeOrder()} orderResult={orderResult} cancelConfirmation={cancelConfirmation} cancelChecked={cancelChecked} setCancelChecked={setCancelChecked} onPrepareCancel={() => void prepareCancel()} onExecuteCancel={() => void executeCancel()} />
            </div>
            {notice ? <p className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-200 text-sm font-semibold shadow-sm" role="status">{notice}</p> : null}
          </>
        ) : null}
        {error ? <ErrorNote message={error} onRetry={() => void openRestaurant({ id: selectedId })} /> : null}
      </div>
    );
  }

  return (
    <>
      <SearchForm label="Tìm nhà hàng hoặc món" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Tên món, tên nhà hàng, khu vực" />
      {loading ? (
        <LoadingNote text="Đang tải danh sách…" />
      ) : error ? (
        <ErrorNote message={error} onRetry={() => void load(keyword)} />
      ) : items.length ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            {paginatedItems.map((item) => (
              <article className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-3xl border border-slate-200/60 shadow-sm hover:border-slate-300 hover:shadow-md transition-all cursor-pointer items-start sm:items-center group" key={idOf(item)} onClick={() => void openRestaurant(item)}>
                <AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Nhà hàng")} />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h2 className="text-base font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{display(item.name ?? item.title ?? "Nhà hàng")}</h2>
                  <p className="text-sm font-medium text-slate-500 truncate">{display(item.address ?? item.location ?? "Địa chỉ đang cập nhật")}</p>
                  <small className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{listFrom(item.matching_items).length ? <span className="text-blue-600">{listFrom(item.matching_items).length} món khớp</span> : item.is_open === false ? "Đang đóng cửa" : <span className="text-emerald-600">Đang nhận đơn</span>}</small>
                </div>
                <button className="w-full sm:w-auto mt-2 sm:mt-0 px-4 py-2 bg-slate-50 text-slate-700 text-sm font-bold rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors flex items-center justify-center gap-1" type="button">
                  Thực đơn <ChevronRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trang <span className="text-slate-700">{page}</span> / {totalPages} ({items.length} nhà hàng)</span>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={page <= 1} aria-label="Trang trước">
                  <ChevronLeft size={14} /> Trước
                </button>
                <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={page >= totalPages} aria-label="Trang sau">
                  Sau <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyNote title="Chưa có nhà hàng phù hợp" body="Thử từ khóa khác hoặc chuyển sang X-One AI để mô tả món bạn muốn." />
      )}
    </>
  );
}

function FoodItemCustomizer({ item, loading, onCancel, onAdd }: { item: JsonRecord; loading: boolean; onCancel: () => void; onAdd: (options: Array<{ group_id: string; option_id: string }>, note: string) => void }) {
  const groups = listFrom(item.options ?? item.option_groups ?? item.modifier_groups);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const missing = groups.some((group) => group.required === true && !selected[idOf(group)]);
  function submit(): void { if (missing) return; onAdd(Object.entries(selected).filter(([, optionId]) => Boolean(optionId)).map(([group_id, option_id]) => ({ group_id, option_id })), note); }
  
  return (
    <div className="flex flex-col gap-4 p-5 bg-white rounded-3xl border border-slate-200/60 shadow-lg relative" aria-label={`Tùy chỉnh ${display(item.name ?? item.title ?? "món ăn")}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">TÙY CHỈNH MÓN</span>
          <h3 className="text-lg font-bold text-slate-900">{display(item.name ?? item.title ?? "Món ăn")}</h3>
        </div>
        <button className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors" type="button" onClick={onCancel}>Hủy</button>
      </div>
      <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-2">
        {groups.map((group) => { 
          const groupId = idOf(group); 
          const options = listFrom(group.options); 
          return (
            <label className="flex flex-col gap-2" key={groupId}>
              <span className="text-sm font-bold text-slate-700">
                {display(group.name ?? group.label ?? "Tùy chọn")}
                <span className={group.required === true ? "text-red-500 ml-1" : "text-slate-400 ml-1 font-medium"}>{group.required === true ? "· bắt buộc" : "· tùy chọn"}</span>
              </span>
              <select className="h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all" value={selected[groupId] ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [groupId]: event.target.value }))} required={group.required === true}>
                <option value="">{group.required === true ? "Chọn một phương án" : "Không chọn"}</option>
                {options.map((option) => (
                  <option key={idOf(option)} value={idOf(option)}>
                    {display(option.name ?? option.label ?? option.id)}{numberOf(option.price) ? ` · +${formatMoney(option.price)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ); 
        })}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-slate-700">Ghi chú cho bếp <span className="text-slate-400 font-medium">(không bắt buộc)</span></span>
          <textarea className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 resize-none" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Ví dụ: ít hành, để riêng nước dùng" />
        </label>
      </div>
      <button className="h-12 w-full mt-2 bg-blue-600 text-white text-base font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2" type="button" onClick={submit} disabled={loading || missing}>
        <ShoppingBag size={18} /> {loading ? "Đang thêm…" : "Thêm vào giỏ"}
      </button>
    </div>
  );
}

function FoodCart({ cart, addresses, addressId, setAddressId, voucher, setVoucher, loading, onVoucher, onRemoveVoucher, onQuantity, onRemove, onPreview, confirmation, checked, setChecked, onExecute, orderResult, cancelConfirmation, cancelChecked, setCancelChecked, onPrepareCancel, onExecuteCancel }: { cart?: JsonRecord; addresses: SavedAddress[]; addressId: string; setAddressId: (value: string) => void; voucher: string; setVoucher: (value: string) => void; loading: boolean; onVoucher: () => void; onRemoveVoucher: () => void; onQuantity: (item: JsonRecord, quantity: number) => void; onRemove: (item: JsonRecord) => void; onPreview: () => void; confirmation?: JsonRecord; checked: boolean; setChecked: (value: boolean) => void; onExecute: () => void; orderResult?: JsonRecord; cancelConfirmation?: JsonRecord; cancelChecked: boolean; setCancelChecked: (value: boolean) => void; onPrepareCancel: () => void; onExecuteCancel: () => void }) {
  const items = listFrom(cart?.items);
  const total = numberOf(cart?.total);
  const order = asRecord(orderResult?.order);
  
  return (
    <aside className="flex flex-col gap-5 p-5 md:p-6 bg-slate-50 rounded-3xl border border-slate-200/60 sticky top-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">GIỎ HÀNG</span>
          <h2 className="text-xl font-bold text-slate-900">{items.length ? `${items.length} món` : "Chưa có món"}</h2>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
          <ShoppingBag size={18} />
        </div>
      </div>
      
      {items.length ? (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div className="flex flex-col gap-2 p-3 bg-white rounded-2xl border border-slate-200/60 shadow-sm" key={String(item.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <strong className="text-sm font-bold text-slate-900 truncate">{display(item.name)}</strong>
                  <small className="text-xs font-medium text-slate-500">{formatMoney(item.unit_price)} · SL {numberOf(item.quantity)}</small>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 border border-slate-100">
                  <button className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-900 transition-all disabled:opacity-50" type="button" onClick={() => onQuantity(item, Math.max(1, numberOf(item.quantity) - 1))} disabled={loading}>−</button>
                  <span className="w-6 text-center text-sm font-bold">{numberOf(item.quantity)}</span>
                  <button className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm hover:text-slate-900 transition-all disabled:opacity-50" type="button" onClick={() => onQuantity(item, numberOf(item.quantity) + 1)} disabled={loading}>+</button>
                </div>
                <button className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors" type="button" onClick={() => onRemove(item)} disabled={loading}>Xóa</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 bg-white border border-slate-200/60 border-dashed rounded-2xl text-center">
          <p className="text-sm font-medium text-slate-500">Chọn món để bắt đầu giỏ hàng.</p>
        </div>
      )}
      
      {cart?.voucher ? (
        <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <span className="text-sm font-bold text-emerald-700">Mã {display(asRecord(cart.voucher)?.code)}</span>
          <button className="text-xs font-bold text-emerald-600 hover:text-emerald-800 transition-colors" type="button" onClick={onRemoveVoucher} disabled={loading}>Bỏ mã</button>
        </div>
      ) : (
        <div className="relative flex items-center">
          <input className="w-full h-10 pl-3 pr-20 bg-white border border-slate-200 rounded-xl text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all uppercase" aria-label="Mã giảm giá" placeholder="Mã giảm giá" value={voucher} onChange={(event) => setVoucher(event.target.value.toUpperCase())} />
          <button className="absolute right-1 h-8 px-3 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors" type="button" onClick={onVoucher} disabled={loading || !voucher.trim()}>Áp dụng</button>
        </div>
      )}
      
      {items.length ? (
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
            <span className="text-sm font-bold text-slate-500">Tạm tính</span>
            <strong className="text-lg font-extrabold text-slate-900">{formatMoney(total)}</strong>
          </div>
          
          {addresses.length ? (
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Địa chỉ giao hàng</span>
              <select className="h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all truncate" value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                {addresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.address_text}</option>)}
              </select>
            </label>
          ) : (
            <p className="text-xs font-medium text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
              Chưa có địa chỉ. <Link className="font-bold underline hover:text-amber-700" href="/app/addresses">Lưu một địa chỉ</Link> trước khi đặt món.
            </p>
          )}
          
          <button className="h-12 w-full mt-2 bg-slate-900 text-white text-base font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2" type="button" onClick={onPreview} disabled={loading || !addressId}>
            {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />} Xem preview xác nhận
          </button>
        </div>
      ) : null}
      
      {confirmation ? (
        <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={onExecute} loading={loading} label="Xác nhận đặt món và thanh toán" />
      ) : null}
      
      {order ? (
        <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 flex flex-col gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Check size={20} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col gap-1">
            <strong className="text-emerald-950 font-bold">Đơn đã được tiếp nhận</strong>
            <span className="text-emerald-800 text-sm font-medium">{formatMoney(order.amount, display(order.currency ?? "VND"))}</span>
          </div>
          <button className="mt-2 h-10 bg-white border border-emerald-200 text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-50 transition-colors" type="button" onClick={onPrepareCancel} disabled={loading}>
            Xem điều kiện hủy
          </button>
          {cancelConfirmation ? (
            <ConfirmationBox confirmation={cancelConfirmation} checked={cancelChecked} setChecked={setCancelChecked} onConfirm={onExecuteCancel} loading={loading} label="Xác nhận hủy đơn và xử lý hoàn tiền nếu đủ điều kiện" />
          ) : null}
        </div>
      ) : null}
      
      {order?.id ? <FoodTrackingPanel orderId={String(order.id)} /> : null}
    </aside>
  );
}

function RestaurantBrowse() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [selected, setSelected] = useState<JsonRecord>();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [startAt, setStartAt] = useState(defaultDateTimeLocal());
  const [availability, setAvailability] = useState<JsonRecord>();
  const [hold, setHold] = useState<JsonRecord>();
  const [confirmation, setConfirmation] = useState<JsonRecord>();
  const [reservation, setReservation] = useState<JsonRecord>();
  const [checked, setChecked] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 4;

  const load = useCallback(async (query = "") => {
    setLoading(true);
    setError("");
    setPage(1);
    try {
      setItems((await browseService("restaurant", query)).items);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function open(item: JsonRecord): Promise<void> {
    const id = idOf(item);
    if (!id) return;
    setDetailLoading(true);
    setError("");
    setSelected(undefined);
    try {
      setSelected(await getRestaurantDetail(id));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setDetailLoading(false);
    }
  }
  async function check(): Promise<void> {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    setError("");
    try {
      const result = await checkRestaurantAvailability({ restaurant_id: idOf(selected), party_size: partySize, start_at: new Date(startAt).toISOString(), duration_minutes: 120 });
      setAvailability(result);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }
  async function createHold(): Promise<void> {
    if (!selected || !availability?.available) return;
    setActionLoading(true);
    setError("");
    try {
      setHold(await createRestaurantHold({ restaurant_id: idOf(selected), party_size: partySize, start_at: new Date(startAt).toISOString(), duration_minutes: 120 }));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }
  async function prepare(): Promise<void> {
    if (!selected || !hold?.id) return;
    setActionLoading(true);
    setError("");
    try {
      setConfirmation(await prepareRestaurantReservation({ restaurant_id: idOf(selected), hold_id: String(hold.id), party_size: partySize, start_at: new Date(startAt).toISOString(), duration_minutes: 120 }));
      setChecked(false);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }
  async function confirm(): Promise<void> {
    if (!confirmation?.id || !checked) return;
    setActionLoading(true);
    setError("");
    try {
      const result = await executeConfirmation(String(confirmation.id), { workflow_id: String(confirmation.workflow_id), action: String(confirmation.action) });
      const tool = asRecord(result.tool_result);
      setReservation(asRecord(tool?.data ?? tool));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }
  async function cancel(): Promise<void> {
    if (!reservation?.id) return;
    setActionLoading(true);
    setError("");
    try {
      await cancelRestaurantReservation(String(reservation.id));
      setReservation({ ...reservation, status: "CANCELLED" });
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

  if (selected) {
    return (
      <div className="flex flex-col gap-6">
        <button className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors self-start" type="button" onClick={() => setSelected(undefined)}>
          <ChevronLeft size={16} /> Danh sách nhà hàng
        </button>
        <DetailHeading item={selected} service="restaurant" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          <article className="flex flex-col gap-5 p-5 md:p-6 bg-slate-50 rounded-3xl border border-slate-200/60 sticky top-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">GIỮ BÀN</span>
                <h2 className="text-xl font-bold text-slate-900">Chọn thời gian</h2>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <MapPinned size={18} />
              </div>
            </div>
            
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-slate-700">Ngày và giờ</span>
              <input className="h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all" type="datetime-local" value={startAt} onChange={(event) => { setStartAt(event.target.value); setAvailability(undefined); setHold(undefined); setConfirmation(undefined); }} />
            </label>
            
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-slate-700">Số người</span>
              <input className="h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all" type="number" min={1} max={20} value={partySize} onChange={(event) => { setPartySize(Number(event.target.value)); setAvailability(undefined); setHold(undefined); }} />
            </label>
            
            <button className="h-12 w-full mt-2 bg-slate-900 text-white text-base font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2" type="button" onClick={() => void check()} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Kiểm tra bàn trống
            </button>
            
            {availability ? (
              <div className={`p-5 rounded-2xl border ${availability.available ? "bg-emerald-50 border-emerald-100 text-emerald-950" : "bg-slate-100 border-slate-200 text-slate-800"} flex flex-col gap-3 mt-2`}>
                <div className="flex flex-col gap-1">
                  <strong className="font-bold">{availability.available ? "Có bàn phù hợp" : "Chưa có bàn phù hợp"}</strong>
                  <p className="text-sm font-medium opacity-80">{display(availability.message ?? (availability.available ? "Có thể giữ chỗ trong thời gian này." : "Thử một khung giờ khác."))}</p>
                </div>
                {availability.available && !hold ? (
                  <button className="h-10 px-4 bg-white border border-emerald-200 text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-50 active:scale-95 transition-all w-fit" type="button" onClick={() => void createHold()} disabled={actionLoading}>
                    Giữ bàn tạm thời
                  </button>
                ) : null}
              </div>
            ) : null}
            
            {hold ? (
              <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 flex flex-col gap-4 mt-2">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={16} strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <strong className="text-amber-950 font-bold">Đã giữ bàn trong thời gian ngắn</strong>
                    <p className="text-amber-800 text-sm font-medium">Hết hạn {formatDateTime(hold.expires_at)}</p>
                  </div>
                </div>
                <button className="h-10 w-full bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void prepare()} disabled={actionLoading}>
                  Xem xác nhận
                </button>
              </div>
            ) : null}
            
            {confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={() => void confirm()} loading={actionLoading} label="Xác nhận đặt bàn" /> : null}
            
            {reservation ? (
              <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 flex flex-col gap-3 mt-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check size={20} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <strong className="text-emerald-950 font-bold">Đặt bàn đã hoàn tất</strong>
                  <span className="text-emerald-800 text-sm font-medium">{statusLabel(reservation.status ?? "CONFIRMED")}</span>
                </div>
                <button className="mt-2 h-10 bg-white border border-emerald-200 text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-50 transition-colors w-fit px-4" type="button" onClick={() => void cancel()} disabled={actionLoading}>
                  Hủy đặt bàn
                </button>
              </div>
            ) : null}
            
            {error ? <ErrorNote message={error} onRetry={() => void check()} /> : null}
          </article>
          
          <aside className="flex flex-col gap-4 p-5 bg-blue-50/50 rounded-3xl border border-blue-100">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">THÔNG TIN NHÀ HÀNG</span>
            <p className="text-sm font-medium text-slate-700">Nếu địa điểm chưa có tọa độ hợp lệ, X-One giữ nguyên địa chỉ và không tự đoán khoảng cách.</p>
            <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors w-fit" href="/app?service=restaurant&mode=assistant">
              Tiếp tục với AI <ArrowRight size={14} />
            </Link>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <>
      <SearchForm label="Tìm theo tên, khu vực hoặc ẩm thực" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Ví dụ: Hoàn Kiếm, Việt Nam, sushi" />
      {loading ? (
        <LoadingNote text="Đang tải nhà hàng…" />
      ) : error ? (
        <ErrorNote message={error} onRetry={() => void load(keyword)} />
      ) : items.length ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            {paginatedItems.map((item) => (
              <article className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-3xl border border-slate-200/60 shadow-sm hover:border-slate-300 hover:shadow-md transition-all cursor-pointer items-start sm:items-center group" key={idOf(item)} onClick={() => void open(item)}>
                <AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? "Nhà hàng")} />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h2 className="text-base font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{display(item.name ?? "Nhà hàng")}</h2>
                  <p className="text-sm font-medium text-slate-500 truncate">{display(item.location ?? item.address ?? "Địa chỉ đang được xác minh")}</p>
                  <small className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider"><span className="text-slate-600">{display(item.cuisine_type ?? item.cuisine ?? "Ẩm thực chưa phân loại")}</span> · {display(item.budget_range ?? "Mức giá chưa công bố")}</small>
                </div>
                <button className="w-full sm:w-auto mt-2 sm:mt-0 px-4 py-2 bg-slate-50 text-slate-700 text-sm font-bold rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors flex items-center justify-center gap-1" type="button">
                  Xem và giữ bàn <ChevronRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trang <span className="text-slate-700">{page}</span> / {totalPages} ({items.length} nhà hàng)</span>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label="Trang trước">
                  <ChevronLeft size={14} /> Trước
                </button>
                <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} aria-label="Trang sau">
                  Sau <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyNote title="Bạn muốn đặt bàn như thế nào?" body="Nhập khu vực, số người, thời gian hoặc loại ẩm thực để mình tìm nhà hàng phù hợp." />
      )}
    </>
  );
}

function HealthcareBrowseWithFavorite() {
  const [facilityId, setFacilityId] = useState("");
  useEffect(() => {
    let active = true;
    void browseService("healthcare").then((result) => {
      const facility = asRecord(asRecord(result.items[0])?.facility);
      const id = facility?.source_id ?? facility?.id;
      if (active && (typeof id === "string" || typeof id === "number")) setFacilityId(String(id));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  
  return (
    <div className="flex flex-col gap-6">
      {facilityId ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-blue-50/50 rounded-3xl border border-blue-100">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">CƠ SỞ Y TẾ</span>
            <strong className="text-sm font-bold text-slate-900">Lưu cơ sở đang cung cấp lịch khám</strong>
          </div>
          <FavoriteToggle domain="healthcare" resourceId={facilityId} />
        </div>
      ) : null}
      <HealthcareBrowse />
    </div>
  );
}

function HealthcareBrowse() {
  const [keyword, setKeyword] = useState("");
  const [departments, setDepartments] = useState<JsonRecord[]>([]);
  const [doctors, setDoctors] = useState<JsonRecord[]>([]);
  const [patients, setPatients] = useState<HealthcarePatient[]>([]);
  const [department, setDepartment] = useState("");
  const [slot, setSlot] = useState<JsonRecord>();
  const [patientId, setPatientId] = useState<number>();
  const [symptoms, setSymptoms] = useState("");
  const [appointment, setAppointment] = useState<JsonRecord>();
  const [confirmation, setConfirmation] = useState<JsonRecord>();
  const [paymentDone, setPaymentDone] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [slotPage, setSlotPage] = useState(1);
  const slotPageSize = 3;

  const load = useCallback(async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const result = await browseService("healthcare", query);
      const next = result.items;
      setDepartments(next);
      if (!department && next[0]) setDepartment(display(next[0].name ?? next[0].label ?? next[0].id));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    void load();
    void listHealthcarePatients().then((result) => {
      setPatients(result.items);
      setPatientId(result.items.find((item) => item.is_default)?.id ?? result.items[0]?.id);
    }).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!department) return;
    setActionLoading(true);
    setError("");
    setSlotPage(1);
    void listHealthcareDoctors(department).then(setDoctors).catch((reason) => setError(errorText(reason))).finally(() => setActionLoading(false));
  }, [department]);

  const slots: JsonRecord[] = useMemo(() => doctors.flatMap((doctor) => listFrom(doctor.available_slots).map((value): JsonRecord => ({ ...value, doctor_name: doctor.name, doctor_id: doctor.id, doctor_description: doctor.description, price: doctor.price, facility: doctor.facility }))), [doctors]);
  const totalSlotPages = Math.max(1, Math.ceil(slots.length / slotPageSize));
  const paginatedSlots = slots.slice((slotPage - 1) * slotPageSize, slotPage * slotPageSize);

  async function hold(): Promise<void> {
    if (!slot || !patientId || !symptoms.trim()) {
      setError("Chọn khung giờ, hồ sơ bệnh nhân và mô tả nhu cầu khám trước.");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      setAppointment(await holdHealthcareSlot({ slot_id: numberOf(slot.id), patient_id: patientId, symptoms: symptoms.trim() }));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }

  async function pay(): Promise<void> {
    if (!appointment?.appointment_id) return;
    setActionLoading(true);
    setError("");
    try {
      await acknowledgeHealthcarePayment(numberOf(appointment.appointment_id));
      setPaymentDone(true);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }

  async function prepare(): Promise<void> {
    if (!appointment?.appointment_id || !paymentDone) return;
    setActionLoading(true);
    setError("");
    try {
      setConfirmation(await prepareHealthcareAppointment(numberOf(appointment.appointment_id)));
      setChecked(false);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!confirmation?.id || !checked) return;
    setActionLoading(true);
    setError("");
    try {
      const result = await executeConfirmation(String(confirmation.id), { workflow_id: String(confirmation.workflow_id), action: String(confirmation.action) });
      const tool = asRecord(result.tool_result);
      const confirmedAppointment = asRecord(tool?.appointment)
        ?? asRecord(tool?.data)
        ?? asRecord(tool);
      setAppointment(confirmedAppointment ?? appointment);
      setConfirmation(undefined);
      setChecked(false);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }

  async function cancel(): Promise<void> {
    if (!appointment?.appointment_id) return;
    setActionLoading(true);
    setError("");
    try {
      await cancelHealthcareAppointment(numberOf(appointment.appointment_id));
      setAppointment({ ...appointment, status: "CANCELLED" });
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <SearchForm label="Tìm chuyên khoa" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Ví dụ: nội thần kinh" />
      {loading ? (
        <LoadingNote text="Đang tải chuyên khoa…" />
      ) : error && !departments.length ? (
        <ErrorNote message={error} onRetry={() => void load(keyword)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          <article className="flex flex-col gap-6 p-5 md:p-6 bg-slate-50 rounded-3xl border border-slate-200/60 sticky top-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">CHUYÊN KHOA</span>
                <h2 className="text-xl font-bold text-slate-900">Chọn chuyên khoa khám</h2>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <HeartPulse size={18} />
              </div>
            </div>
            
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-slate-700">Chuyên khoa</span>
              <select className="h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all truncate" value={department} onChange={(event) => { setDepartment(event.target.value); setSlot(undefined); setAppointment(undefined); }} aria-label="Chọn chuyên khoa khám">
                <option value="">-- Chọn chuyên khoa --</option>
                {departments.map((item) => {
                  const name = display(item.name ?? item.label ?? item.id);
                  return (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
            
            {department ? (
              <>
                <div className="flex flex-col gap-1 mt-2">
                  <span className="text-[10px] font-extrabold text-slate-500 tracking-widest uppercase">BÁC SĨ VÀ KHUNG GIỜ</span>
                  <h2 className="text-lg font-bold text-slate-900">{department}</h2>
                </div>
                
                {actionLoading && !appointment ? (
                  <LoadingNote text="Đang tải khung giờ…" />
                ) : slots.length ? (
                  <>
                    <div className="flex flex-col gap-3">
                      {paginatedSlots.map((value) => (
                        <button className={`flex flex-col gap-1.5 p-4 rounded-2xl border text-left transition-all ${slot?.id === value.id ? "bg-blue-50 border-blue-200 shadow-sm shadow-blue-600/5 ring-1 ring-blue-600/20" : "bg-white border-slate-200/60 shadow-sm hover:border-slate-300 hover:shadow-md"}`} key={String(value.id)} type="button" onClick={() => setSlot(value)}>
                          <strong className="text-sm font-bold text-slate-900">{display(value.doctor_name)}</strong>
                          <span className="text-xs font-medium text-slate-500 leading-snug">
                            {formatDateTime(value.start_time)} · {display(asRecord(value.facility)?.name ?? asRecord(value.facility)?.address ?? "Cơ sở đang xác minh")}
                          </span>
                          {value.price !== undefined ? <small className="text-sm font-bold text-blue-600 mt-1">{formatMoney(value.price)}</small> : null}
                        </button>
                      ))}
                    </div>
                    
                    {totalSlotPages > 1 ? (
                      <div className="flex items-center justify-between py-2 border-t border-slate-200/60 mt-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trang <span className="text-slate-700">{slotPage}</span> / {totalSlotPages} ({slots.length} lịch)</span>
                        <div className="flex items-center gap-2">
                          <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setSlotPage((c) => Math.max(1, c - 1))} disabled={slotPage <= 1} aria-label="Trang trước">
                            <ChevronLeft size={14} /> Trước
                          </button>
                          <button className="h-8 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1" type="button" onClick={() => setSlotPage((c) => Math.min(totalSlotPages, c + 1))} disabled={slotPage >= totalSlotPages} aria-label="Trang sau">
                            Sau <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyNote title="Chưa có khung giờ" body="Chưa có lịch trống cho chuyên khoa này." />
                )}
              </>
            ) : null}
            
            {slot ? (
              <div className="flex flex-col gap-4 p-5 bg-white rounded-2xl border border-slate-200/60 shadow-sm mt-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-slate-700">Hồ sơ bệnh nhân</span>
                  <select className="h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all truncate" value={patientId ?? ""} onChange={(event) => setPatientId(Number(event.target.value))}>
                    <option value="">Chọn hồ sơ</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} · {patient.relationship}
                      </option>
                    ))}
                  </select>
                </label>
                
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-slate-700">Nhu cầu khám</span>
                  <textarea className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 resize-none" value={symptoms} onChange={(event) => setSymptoms(event.target.value)} placeholder="Mô tả ngắn để cơ sở chuẩn bị tiếp nhận" rows={3} />
                </label>
                
                <button className="h-12 w-full mt-2 bg-slate-900 text-white text-base font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2" type="button" onClick={() => void hold()} disabled={actionLoading || !patientId || !symptoms.trim()}>
                  {actionLoading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />} Giữ khung giờ
                </button>
              </div>
            ) : null}
            
            {appointment && !confirmation ? (
              <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 flex flex-col gap-4 mt-2">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={16} strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <strong className="text-amber-950 font-bold">Đã giữ khung giờ</strong>
                    <p className="text-amber-800 text-sm font-medium leading-relaxed">
                      {display(appointment.doctor_name)} · {formatDateTime(appointment.start_time)} · {formatMoney(appointment.price)}
                    </p>
                  </div>
                </div>
                {!paymentDone ? (
                  <button className="h-10 w-full bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void pay()} disabled={actionLoading}>
                    Xác nhận thanh toán
                  </button>
                ) : (
                  <button className="h-10 w-full bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void prepare()} disabled={actionLoading}>
                    Xem xác nhận cuối
                  </button>
                )}
              </div>
            ) : null}
            
            {confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={() => void confirm()} loading={actionLoading} label="Xác nhận hoàn tất lịch khám" /> : null}
            
            {appointment?.status === "CONFIRMED" || appointment?.status === "CANCELLED" ? (
              <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 flex flex-col gap-3 mt-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check size={20} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <strong className="text-emerald-950 font-bold">Lịch khám: {statusLabel(appointment.status)}</strong>
                  <span className="text-emerald-800 text-sm font-medium">
                    {display(appointment.doctor_name)} · {formatDateTime(appointment.start_time)}
                  </span>
                </div>
                {appointment.status === "CONFIRMED" ? (
                  <button className="mt-2 h-10 bg-white border border-emerald-200 text-emerald-700 text-sm font-bold rounded-xl hover:bg-emerald-50 transition-colors w-fit px-4" type="button" onClick={() => void cancel()} disabled={actionLoading}>
                    Hủy lịch khám
                  </button>
                ) : null}
              </div>
            ) : null}
            
            {error ? <ErrorNote message={error} onRetry={() => void hold()} /> : null}
          </article>
          
          <aside className="flex flex-col gap-4 p-5 bg-blue-50/50 rounded-3xl border border-blue-100">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">THÔNG TIN LỊCH KHÁM</span>
            <p className="text-sm font-medium text-slate-700">X-One chỉ hiển thị bác sĩ, giá và khung giờ khi thông tin đã sẵn sàng. Đây là luồng đặt lịch, không phải chẩn đoán.</p>
            <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors w-fit" href="/app?service=healthcare&mode=assistant">
              Tiếp tục với AI <ArrowRight size={14} />
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}

function RideBrowse() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupPoint, setPickupPoint] = useState<Point>();
  const [dropoffPoint, setDropoffPoint] = useState<Point>();
  const [vehicle, setVehicle] = useState<"BIKE" | "CAR_4" | "CAR_7">("CAR_4");
  const [quote, setQuote] = useState<RideQuote>();
  const [booking, setBooking] = useState<JsonRecord>();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [serviceChecked, setServiceChecked] = useState(false);
  const [paymentChecked, setPaymentChecked] = useState(false);
  const [quoteDetailOpen, setQuoteDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void listSavedAddresses().then((result) => setAddresses(result.items)).catch(() => undefined); }, []);
  function useAddress(kind: "pickup" | "dropoff", id: string): void { const address = addresses.find((item) => item.id === id); if (!address) return; const point = address.latitude !== undefined && address.longitude !== undefined ? { latitude: address.latitude, longitude: address.longitude } : undefined; if (kind === "pickup") { setPickup(address.address_text); setPickupPoint(point); } else { setDropoff(address.address_text); setDropoffPoint(point); } }
  async function submitQuote(): Promise<void> { if (!pickup.trim() || !dropoff.trim()) return; setLoading(true); setError(""); setBooking(undefined); try { setQuote(await createRideQuote({ pickup_address: pickup.trim(), dropoff_address: dropoff.trim(), vehicle_type: vehicle, ...(pickupPoint ? { pickup_latitude: pickupPoint.latitude, pickup_longitude: pickupPoint.longitude } : {}), ...(dropoffPoint ? { dropoff_latitude: dropoffPoint.latitude, dropoff_longitude: dropoffPoint.longitude } : {}) })); setServiceChecked(false); setPaymentChecked(false); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  async function prepare(): Promise<void> { if (!quote || !serviceChecked) return; setLoading(true); setError(""); try { setBooking(await prepareRideBooking(quote.id)); setPaymentChecked(false); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  async function confirm(): Promise<void> { if (!booking?.id || !paymentChecked) return; setLoading(true); setError(""); try { setBooking(await confirmRideBooking(String(booking.id))); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  const status = statusLabel(booking?.status);
  const quoteDetail = quote ? { ...quoteToAssistantItem(quote), kind: booking?.id ? "ride_booking" as const : "ride_quote" as const, ...(booking?.id ? { booking_id: String(booking.id), status: typeof booking.status === "string" ? booking.status : quote.status } : {}) } : undefined;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">
      <form className="flex flex-col gap-6 p-5 md:p-6 bg-slate-50 rounded-3xl border border-slate-200/60 sticky top-6" onSubmit={(event) => { event.preventDefault(); void submitQuote(); }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">LỘ TRÌNH</span>
            <h2 className="text-xl font-bold text-slate-900">Đặt xe trực tiếp</h2>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Bike size={18} />
          </div>
        </div>
        
        {addresses.length ? (
          <div className="flex flex-col gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-blue-900">Điểm đi từ địa chỉ đã lưu</span>
              <select className="h-10 px-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all truncate text-blue-900" defaultValue="" onChange={(event) => useAddress("pickup", event.target.value)}>
                <option value="">Chọn nhanh…</option>
                {addresses.map((address) => <option key={`p-${address.id}`} value={address.id}>{address.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 mt-1">
              <span className="text-xs font-bold text-blue-900">Điểm đến từ địa chỉ đã lưu</span>
              <select className="h-10 px-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all truncate text-blue-900" defaultValue="" onChange={(event) => useAddress("dropoff", event.target.value)}>
                <option value="">Chọn nhanh…</option>
                {addresses.map((address) => <option key={`d-${address.id}`} value={address.id}>{address.label}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        
        <div className="flex flex-col gap-4">
          <AddressAutocompleteField id="ride-pickup" label="Điểm đi" value={pickup} placeholder="Địa chỉ đón" onChange={(value) => { setPickup(value); setPickupPoint(undefined); }} onSelect={(candidate) => { setPickup(candidate.address_text); setPickupPoint(candidatePoint(candidate)); }} />
          <AddressAutocompleteField id="ride-dropoff" label="Điểm đến" value={dropoff} placeholder="Địa chỉ đến" onChange={(value) => { setDropoff(value); setDropoffPoint(undefined); }} onSelect={(candidate) => { setDropoff(candidate.address_text); setDropoffPoint(candidatePoint(candidate)); }} />
          
          <label className="flex flex-col gap-2" htmlFor="ride-vehicle">
            <span className="text-sm font-bold text-slate-700">Loại xe</span>
            <select className="h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all" id="ride-vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value as typeof vehicle)}>
              <option value="BIKE">Xe máy</option>
              <option value="CAR_4">Ô tô 4 chỗ</option>
              <option value="CAR_7">Ô tô 7 chỗ</option>
            </select>
          </label>
        </div>
        
        {error ? <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100" role="alert">{error}</p> : null}
        
        <button className="h-12 w-full mt-2 bg-slate-900 text-white text-base font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2" type="submit" disabled={loading || !pickup.trim() || !dropoff.trim()}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : <MapPinned size={18} />}
          {loading ? "Đang tính lộ trình…" : "Nhận báo giá"}
        </button>
      </form>
      
      {quote ? (
        <article className="flex flex-col gap-6 p-5 md:p-6 bg-white rounded-3xl border border-slate-200/60 shadow-sm" aria-live="polite">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200/60">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">BÁO GIÁ</span>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatMoney(quote.amount, quote.currency)}</h2>
            </div>
            <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg uppercase tracking-wider">{statusLabel(quote.status)}</span>
          </div>
          
          <dl className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lộ trình</dt>
              <dd className="font-semibold text-slate-900">{quote.distance_km} km · khoảng {quote.duration_minutes} phút</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">Loại xe</dt>
              <dd className="font-semibold text-slate-900">{vehicleLabel(quote.vehicle_type)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phiên bản giá</dt>
              <dd className="font-medium text-slate-600">{display(quote.tariff_version, "Không công bố")}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đường đi</dt>
              <dd className="font-medium text-slate-600">{quote.route_geometry?.length || quote.route_polyline ? "Đã có dữ liệu đường đi" : "Đang cập nhật"}</dd>
            </div>
          </dl>
          
          <div className="w-full h-[240px] rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm relative">
            <XOneMap origin={pointFromQuote(quote, "pickup")} destination={pointFromQuote(quote, "dropoff")} routeGeometry={quote.route_geometry ?? undefined} routePolyline={quote.route_polyline ?? undefined} routeProvider={quote.route_provider} routeDistanceMeters={quote.route_distance_meters} routeDurationSeconds={quote.route_duration_seconds} routeStatus={quote.status} label="Lộ trình báo giá" />
          </div>
          
          <button className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors underline decoration-blue-200 hover:decoration-blue-400 underline-offset-4 w-fit" type="button" onClick={() => setQuoteDetailOpen(true)}>Xem bản đồ và hành trình</button>
          
          {quoteDetail ? <ServiceDetailDialog open={quoteDetailOpen} onOpenChange={setQuoteDetailOpen} kind="ride" option={null} ride={quoteDetail} /> : null}
          
          {!booking ? (
            <ConfirmationBox confirmation={{ title: "Xác nhận thông tin chuyến", detail: `${quote.pickup_address} → ${quote.dropoff_address} · ${formatMoney(quote.amount, quote.currency)}` }} checked={serviceChecked} setChecked={setServiceChecked} onConfirm={() => void prepare()} loading={loading} label="Tôi xác nhận điểm đi, điểm đến, loại xe và báo giá" />
          ) : (
            <div className="flex flex-col gap-4 mt-2">
              <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <strong className="text-amber-950 font-bold">Thông tin chuyến đã được ghi nhận</strong>
                  <p className="text-amber-800 text-sm font-medium">{status}</p>
                </div>
              </div>
              
              {booking.status === "AWAITING_CONFIRMATION" || booking.status === "AWAITING_PAYMENT_CONFIRMATION" ? (
                <ConfirmationBox confirmation={{ title: "Xác nhận thanh toán", detail: `Thanh toán ${formatMoney(quote.amount, quote.currency)} để gửi yêu cầu tìm tài xế.` }} checked={paymentChecked} setChecked={setPaymentChecked} onConfirm={() => void confirm()} loading={loading} label="Tôi xác nhận thanh toán và muốn hoàn tất đặt xe" />
              ) : (
                <RideResult booking={booking} quote={quote} />
              )}
            </div>
          )}
        </article>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 gap-4 text-center bg-slate-50/50 border border-slate-200 border-dashed rounded-3xl h-full">
          <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400">
            <MapPinned size={28} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-slate-500 max-w-[260px]">Nhập hai điểm để xem khoảng cách, thời gian và giá hiện tại.</p>
        </div>
      )}
    </div>
  );
}

function quoteToAssistantItem(quote: RideQuote): AssistantRideItem {
  return {
    kind: "ride_quote",
    title: "Báo giá chuyến xe",
    status: quote.status,
    pickup: quote.pickup_address,
    dropoff: quote.dropoff_address,
    vehicle: quote.vehicle_type,
    distance_km: quote.distance_km,
    duration_minutes: quote.duration_minutes,
    amount: quote.amount,
    currency: quote.currency,
    route_provider: quote.route_provider,
    route_distance_meters: quote.route_distance_meters ?? undefined,
    route_duration_seconds: quote.route_duration_seconds ?? undefined,
    route_geometry: quote.route_geometry ?? undefined,
    route_polyline: quote.route_polyline ?? undefined,
    pickup_latitude: quote.pickup_latitude ?? undefined,
    pickup_longitude: quote.pickup_longitude ?? undefined,
    dropoff_latitude: quote.dropoff_latitude ?? undefined,
    dropoff_longitude: quote.dropoff_longitude ?? undefined,
  };
}

function RideResult({ booking, quote }: { booking: JsonRecord; quote: RideQuote }) { 
  const noDriver = booking.status === "NO_DRIVER"; 
  const completed = booking.status === "COMPLETED"; 
  const searching = booking.status === "SEARCHING_DRIVER"; 
  
  return (
    <div className="flex flex-col gap-4 mt-2">
      <div className={`rounded-3xl p-5 border flex flex-col gap-3 ${noDriver ? "bg-red-50 border-red-100" : completed ? "bg-emerald-50 border-emerald-100" : "bg-blue-50 border-blue-100"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${noDriver ? "bg-red-100 text-red-600" : completed ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
          <Check size={20} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col gap-1">
          <strong className={`font-bold ${noDriver ? "text-red-950" : completed ? "text-emerald-950" : "text-blue-950"}`}>
            {noDriver ? "Chưa tìm được tài xế phù hợp" : completed ? "Chuyến đã hoàn tất" : "Chuyến của bạn đã được ghi nhận"}
          </strong>
          <span className={`text-sm font-medium ${noDriver ? "text-red-800" : completed ? "text-emerald-800" : "text-blue-800"}`}>
            {noDriver ? "Bạn có thể thử lại với một điểm đón khác." : searching ? "Đang tìm tài xế gần bạn…" : `Trạng thái hiện tại: ${statusLabel(booking.status)}`}
          </span>
        </div>
      </div>
      
      <RideTrackingPanel bookingId={String(booking.id)} />
      
      <p className="text-xs font-medium text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200 border-dashed text-center">Giá và lộ trình dựa trên thông tin đã xác nhận của chuyến.</p>
    </div>
  ); 
}

function AddressAutocompleteField({ id, label, value, placeholder, onChange, onSelect }: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void; onSelect: (candidate: GeocodeCandidate) => void }) {
  const [suggestions, setSuggestions] = useState<GeocodeCandidate[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let active = true;
    const timer = globalThis.setTimeout(() => {
      void autocompleteAddress(query).then((result) => {
        if (!active) return;
        setSuggestions(result.suggestions.filter((item) => item.latitude !== null && item.longitude !== null).slice(0, 5));
        setOpen(true);
      }).catch(() => { if (active) setSuggestions([]); });
    }, 300);
    return () => { active = false; globalThis.clearTimeout(timer); };
  }, [value]);

  return (
    <div className="flex flex-col gap-2 relative">
      <label className="text-sm font-bold text-slate-700" htmlFor={id}>{label}</label>
      <input 
        className="w-full h-12 px-4 bg-white border border-slate-200/60 rounded-xl text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" 
        id={id} 
        value={value} 
        onChange={(event) => onChange(event.target.value)} 
        onFocus={() => { if (suggestions.length) setOpen(true); }} 
        onBlur={() => globalThis.setTimeout(() => setOpen(false), 150)} 
        placeholder={placeholder} 
        autoComplete="off" 
        required 
        minLength={3} 
      />
      {open && suggestions.length ? (
        <div className="absolute top-[72px] left-0 w-full z-10 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden py-1" role="listbox" aria-label={`Gợi ý ${label.toLowerCase()}`}>
          {suggestions.map((candidate, index) => (
            <button 
              className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 focus:bg-slate-50 focus:text-blue-600 outline-none transition-colors border-b border-slate-100 last:border-0" 
              key={`${candidate.address_text}-${index}`} 
              type="button" 
              role="option" 
              onMouseDown={(event) => event.preventDefault()} 
              onClick={() => { onSelect(candidate); setOpen(false); }}
            >
              {candidate.address_text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchForm({ label, keyword, setKeyword, loading, onSubmit, placeholder }: { label: string; keyword: string; setKeyword: (value: string) => void; loading: boolean; onSubmit: () => void; placeholder: string }) { 
  return (
    <form className="flex flex-col gap-2 mb-6" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="service-search-input" className="text-sm font-bold text-slate-700">{label}</label>
      <div className="relative flex items-center">
        <input className="w-full h-14 pl-12 pr-24 bg-white border border-slate-200/60 rounded-2xl text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" id="service-search-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={placeholder} />
        <div className="absolute left-4 text-slate-400">
          <Search size={20} />
        </div>
        <button className="absolute right-2 h-10 px-4 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2" type="submit" disabled={loading}>
          Tìm
        </button>
      </div>
    </form>
  ); 
}

function AuthoritativeImage({ source, alt, compact = false }: { source: unknown; alt: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (typeof source !== "string" || !source.trim()) return null;
  const sizeClass = compact ? "w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl" : "w-full h-[200px] sm:h-[280px] rounded-3xl";
  if (failed) return <div className={`${sizeClass} bg-slate-50 border border-slate-200/60 flex items-center justify-center text-xs font-bold text-slate-400 text-center p-2`} role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh không khả dụng</div>;
  return <div className={`${sizeClass} overflow-hidden border border-slate-200/60 shadow-sm bg-slate-50`}><img className="w-full h-full object-cover" src={source} alt={alt} loading="lazy" onError={() => setFailed(true)} /></div>;
}

function DetailHeading({ item, service }: { item: JsonRecord; service: ServiceKey }) { 
  const point = pointFromRecord(item); 
  const resourceId = idOf(item); 
  return (
    <div className="flex flex-col gap-6 mb-6">
      <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
        <AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Địa điểm")} />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">{service.toUpperCase()} · CHI TIẾT</span>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{display(item.name ?? item.title ?? "Địa điểm")}</h2>
          <p className="text-sm font-medium text-slate-600">{display(item.address ?? item.location ?? item.description ?? "Địa chỉ đang cập nhật")}</p>
        </div>
        {service !== "ride" ? <div className="sm:ml-auto"><FavoriteToggle domain={service} resourceId={resourceId} /></div> : null}
      </div>
      {point ? (
        <div className="w-full h-[200px] rounded-3xl overflow-hidden border border-slate-200/60 shadow-sm relative">
          <XOneMap destination={point} label="Vị trí địa điểm" />
        </div>
      ) : (
        <span className="text-xs font-medium text-slate-500 italic">Chưa có tọa độ hợp lệ; bản đồ không khả dụng.</span>
      )}
    </div>
  ); 
}

function ConfirmationBox({ confirmation, checked, setChecked, onConfirm, loading, label }: { confirmation: JsonRecord; checked: boolean; setChecked: (value: boolean) => void; onConfirm: () => void; loading: boolean; label: string }) { 
  return (
    <div className="bg-blue-50/50 rounded-3xl border border-blue-100 p-5 md:p-6 shadow-sm flex flex-col gap-5 mt-4">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">XÁC NHẬN RÕ RÀNG</span>
        <h3 className="text-lg font-bold text-blue-950">{display(confirmation.title ?? "Kiểm tra lần cuối")}</h3>
        <p className="text-sm font-medium text-blue-800/80 leading-relaxed">{display(confirmation.detail ?? "Các điều khoản hiện tại đã được kiểm tra từ nguồn đáng tin cậy.")}</p>
        {confirmation.preview ? <PreviewSummary preview={asRecord(confirmation.preview)} /> : null}
      </div>
      <label className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-blue-100 cursor-pointer hover:border-blue-300 transition-colors">
        <input className="mt-1 w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-600 cursor-pointer" type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> 
        <span className="text-sm font-bold text-slate-700 leading-snug">{label}</span>
      </label>
      <button className="h-12 w-full bg-blue-600 text-white text-base font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2" type="button" onClick={onConfirm} disabled={loading || !checked}>
        {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />} Xác nhận
      </button>
    </div>
  ); 
}

function PreviewSummary({ preview }: { preview?: JsonRecord }) { 
  if (!preview) return null; 
  const total = asRecord(preview.total); 
  return (
    <dl className="mt-4 pt-4 border-t border-blue-200/50 flex flex-col gap-2.5 text-sm">
      <div className="flex items-baseline justify-between">
        <dt className="font-bold text-blue-800/70">Tạm tính</dt>
        <dd className="font-bold text-blue-950">{formatMoney(preview.subtotal)}</dd>
      </div>
      <div className="flex items-baseline justify-between">
        <dt className="font-bold text-blue-800/70">Giao hàng</dt>
        <dd className="font-bold text-blue-950">{formatMoney(preview.delivery_fee ?? preview.delivery_amount)}</dd>
      </div>
      <div className="flex items-baseline justify-between pt-2 border-t border-blue-200/50">
        <dt className="font-extrabold text-blue-950">Tổng</dt>
        <dd className="font-extrabold text-lg text-blue-600">{formatMoney(total?.amount, display(total?.currency ?? "VND"))}</dd>
      </div>
      <div className="flex flex-col gap-1 mt-2 p-3 bg-white/60 rounded-xl border border-blue-100">
        <dt className="text-[10px] font-bold text-blue-800/70 uppercase tracking-wider">Địa chỉ giao</dt>
        <dd className="font-semibold text-blue-950">{display(asRecord(preview.address)?.address ?? asRecord(preview.address)?.address_text ?? "Đã kiểm tra")}</dd>
      </div>
    </dl>
  ); 
}

function LoadingNote({ text }: { text: string }) { 
  return <p className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-slate-500 animate-pulse" aria-live="polite"><Loader2 className="animate-spin" size={18} /> {text}</p>; 
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) { 
  return (
    <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 my-4" role="alert">
      <p className="text-sm font-semibold text-red-600">{message}</p>
      <button className="px-4 py-2 bg-white border border-red-200 text-red-700 text-xs font-bold rounded-lg hover:bg-red-50 active:scale-95 transition-all shadow-sm whitespace-nowrap" type="button" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  ); 
}

function EmptyNote({ title, body }: { title: string; body: string }) { 
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 gap-4 text-center bg-slate-50/50 border border-slate-200 border-dashed rounded-3xl my-6">
      <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400">
        <Search size={28} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1.5 max-w-[280px]">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm font-medium text-slate-500">{body}</p>
      </div>
    </div>
  ); 
}
function listFrom(value: unknown): JsonRecord[] { if (Array.isArray(value)) return value.filter(isRecord); if (isRecord(value)) { for (const key of ["items", "data", "restaurants", "doctors", "available_slots"]) if (Array.isArray(value[key])) return value[key].filter(isRecord); } return []; }
function asRecord(value: unknown): JsonRecord | undefined { return isRecord(value) ? value : undefined; }
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function idOf(value: JsonRecord): string { return display(value.id ?? value.restaurant_id ?? value.source_record_id); }
function display(value: unknown, fallback = "—"): string { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function numberOf(value: unknown): number { const valueNumber = Number(value); return Number.isFinite(valueNumber) ? valueNumber : 0; }
function formatMoney(value: unknown, currency = "VND"): string { return presentMoney(numberOf(value), currency); }
function vehicleLabel(value: string): string { return ({ BIKE: "Xe máy", CAR_4: "Ô tô 4 chỗ", CAR_7: "Ô tô 7 chỗ" } as Record<string, string>)[value] ?? value; }
function pointFromRecord(value: JsonRecord): Point | undefined { if (value.suspicious === true) return undefined; const latitude = Number(value.latitude); const longitude = Number(value.longitude); return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined; }
function candidatePoint(candidate: GeocodeCandidate): Point | undefined { return candidate.latitude !== null && candidate.longitude !== null ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined; }
function pointFromQuote(quote: RideQuote, kind: "pickup" | "dropoff"): Point | undefined { const latitude = kind === "pickup" ? quote.pickup_latitude : quote.dropoff_latitude; const longitude = kind === "pickup" ? quote.pickup_longitude : quote.dropoff_longitude; return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : undefined; }
function defaultDateTimeLocal(): string { const date = new Date(Date.now() + 60 * 60 * 1000); date.setMinutes(0, 0, 0); const pad = (value: number) => String(value).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
