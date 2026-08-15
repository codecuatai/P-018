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
  return <section className="service-browse" aria-labelledby="service-browse-title">
    <div className="service-browse-top"><Link className="text-link" href="/app/services"><ArrowLeft size={16} /> Dịch vụ</Link><Link className="text-link" href={`/app?service=${service}&mode=assistant`}>Tiếp tục với X-One AI <ArrowRight size={16} /></Link></div>
    <header className="service-browse-heading"><span className="service-browse-icon"><Icon size={22} /></span><div><span className="eyebrow">{service.toUpperCase()}</span><h1 id="service-browse-title">{copy[service].label}</h1><p>{copy[service].description}</p></div></header>
    {service === "food" ? <FoodBrowse /> : service === "restaurant" ? <RestaurantBrowse /> : service === "healthcare" ? <HealthcareBrowseWithFavorite /> : <RideBrowse />}
  </section>;
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

  const load = useCallback(async (query = "") => {
    setLoading(true); setError("");
    try { setItems((await browseService("food", query)).items); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); void listSavedAddresses().then((result) => { setAddresses(result.items); setAddressId(result.items.find((item) => item.is_default)?.id ?? result.items[0]?.id ?? ""); }).catch(() => undefined); }, [load]);

  async function openRestaurant(item: JsonRecord): Promise<void> {
    const id = idOf(item);
    if (!id) return;
    setSelectedId(id); setRestaurant(undefined); setMenuItems([]); setCart(undefined); setConfirmation(undefined); setOrderResult(undefined); setError(""); setDetailLoading(true);
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

  if (selectedId) return <div className="service-detail-flow"><button className="text-link" type="button" onClick={() => { setSelectedId(""); setError(""); }}><ChevronLeft size={16} /> Danh sách nhà hàng</button>{detailLoading ? <LoadingNote text="Đang tải nhà hàng và thực đơn…" /> : restaurant ? (<><DetailHeading item={restaurant} service="food" /><div className="food-product-grid"><div className="menu-panel"><div className="panel-heading"><div><span className="eyebrow">THỰC ĐƠN</span><h2>Món đang phục vụ</h2></div><Link className="text-link" href="/app?service=food&mode=assistant">Hỏi X-One AI <ArrowRight size={15} /></Link></div>{customizingItem ? <FoodItemCustomizer item={customizingItem} loading={cartLoading} onCancel={() => setCustomizingItem(undefined)} onAdd={(options, note) => void addItem(customizingItem, options, note)} /> : null}{menuItems.length ? <div className="menu-list">{menuItems.map((item) => <article className="menu-item" key={idOf(item)}><AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Món ăn")} /><div><h3>{display(item.name ?? item.title ?? "Món ăn")}</h3><p>{display(item.description ?? "Mô tả món đang cập nhật")}</p><strong>{formatMoney(item.price ?? item.base_price)}</strong></div><button className="button button-secondary" type="button" onClick={() => listFrom(item.options ?? item.option_groups ?? item.modifier_groups).length ? setCustomizingItem(item) : void addItem(item)} disabled={cartLoading || item.available === false}><ShoppingBag size={15} /> {listFrom(item.options ?? item.option_groups ?? item.modifier_groups).length ? "Tùy chỉnh" : "Thêm"}</button></article>)}</div> : <EmptyNote title="Thực đơn chưa có món" body="Nhà hàng này chưa có món có thể đặt." />}</div><FoodCart cart={cart} addresses={addresses} addressId={addressId} setAddressId={setAddressId} voucher={voucher} setVoucher={setVoucher} loading={cartLoading} onVoucher={() => void applyVoucherCode()} onRemoveVoucher={() => void removeVoucherCode()} onQuantity={(item, quantity) => void changeQuantity(item, quantity)} onRemove={(item) => void removeItem(item)} onPreview={() => void prepareOrder()} confirmation={confirmation} checked={checked} setChecked={setChecked} onExecute={() => void executeOrder()} orderResult={orderResult} cancelConfirmation={cancelConfirmation} cancelChecked={cancelChecked} setCancelChecked={setCancelChecked} onPrepareCancel={() => void prepareCancel()} onExecuteCancel={() => void executeCancel()} /></div>{notice ? <p className="form-success" role="status">{notice}</p> : null}</>) : null}{error ? <ErrorNote message={error} onRetry={() => void openRestaurant({ id: selectedId })} /> : null}</div>;

  return <><SearchForm label="Tìm nhà hàng hoặc món" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Tên món, tên nhà hàng, khu vực" />{loading ? <LoadingNote text="Đang tải danh sách…" /> : error ? <ErrorNote message={error} onRetry={() => void load(keyword)} /> : items.length ? <div className="browse-results">{items.map((item) => <article className="browse-result browse-result-action" key={idOf(item)}><AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Nhà hàng")} /><div><h2>{display(item.name ?? item.title ?? "Nhà hàng")}</h2><p>{display(item.address ?? item.location ?? "Địa chỉ đang cập nhật")}</p><small>{listFrom(item.matching_items).length ? `${listFrom(item.matching_items).length} món khớp` : item.is_open === false ? "Đang đóng cửa" : "Đang nhận đơn"}</small></div><button className="button button-secondary" type="button" onClick={() => void openRestaurant(item)}>Xem thực đơn <ChevronRight size={16} /></button></article>)}</div> : <EmptyNote title="Chưa có nhà hàng phù hợp" body="Thử từ khóa khác hoặc chuyển sang X-One AI để mô tả món bạn muốn." />}</>;
}

function FoodItemCustomizer({ item, loading, onCancel, onAdd }: { item: JsonRecord; loading: boolean; onCancel: () => void; onAdd: (options: Array<{ group_id: string; option_id: string }>, note: string) => void }) {
  const groups = listFrom(item.options ?? item.option_groups ?? item.modifier_groups);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const missing = groups.some((group) => group.required === true && !selected[idOf(group)]);
  function submit(): void { if (missing) return; onAdd(Object.entries(selected).filter(([, optionId]) => Boolean(optionId)).map(([group_id, option_id]) => ({ group_id, option_id })), note); }
  return <div className="food-customizer" aria-label={`Tùy chỉnh ${display(item.name ?? item.title ?? "món ăn")}`}><div className="food-customizer-heading"><div><span className="eyebrow">TÙY CHỈNH MÓN</span><h3>{display(item.name ?? item.title ?? "Món ăn")}</h3></div><button className="text-button" type="button" onClick={onCancel}>Hủy</button></div>{groups.map((group) => { const groupId = idOf(group); const options = listFrom(group.options); return <label className="food-option-group" key={groupId}><span>{display(group.name ?? group.label ?? "Tùy chọn")}{group.required === true ? " · bắt buộc" : " · tùy chọn"}</span><select value={selected[groupId] ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [groupId]: event.target.value }))} required={group.required === true}><option value="">{group.required === true ? "Chọn một phương án" : "Không chọn"}</option>{options.map((option) => <option key={idOf(option)} value={idOf(option)}>{display(option.name ?? option.label ?? option.id)}{numberOf(option.price) ? ` · +${formatMoney(option.price)}` : ""}</option>)}</select></label>; })}<label className="food-option-note"><span>Ghi chú cho bếp (không bắt buộc)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Ví dụ: ít hành, để riêng nước dùng" /></label><button className="button button-primary" type="button" onClick={submit} disabled={loading || missing}><ShoppingBag size={15} />{loading ? "Đang thêm…" : "Thêm vào giỏ"}</button></div>;
}

function FoodCart({ cart, addresses, addressId, setAddressId, voucher, setVoucher, loading, onVoucher, onRemoveVoucher, onQuantity, onRemove, onPreview, confirmation, checked, setChecked, onExecute, orderResult, cancelConfirmation, cancelChecked, setCancelChecked, onPrepareCancel, onExecuteCancel }: { cart?: JsonRecord; addresses: SavedAddress[]; addressId: string; setAddressId: (value: string) => void; voucher: string; setVoucher: (value: string) => void; loading: boolean; onVoucher: () => void; onRemoveVoucher: () => void; onQuantity: (item: JsonRecord, quantity: number) => void; onRemove: (item: JsonRecord) => void; onPreview: () => void; confirmation?: JsonRecord; checked: boolean; setChecked: (value: boolean) => void; onExecute: () => void; orderResult?: JsonRecord; cancelConfirmation?: JsonRecord; cancelChecked: boolean; setCancelChecked: (value: boolean) => void; onPrepareCancel: () => void; onExecuteCancel: () => void }) {
  const items = listFrom(cart?.items);
  const total = numberOf(cart?.total);
  const order = asRecord(orderResult?.order);
  return <aside className="transaction-panel"><div className="panel-heading"><div><span className="eyebrow">GIỎ HÀNG</span><h2>{items.length ? `${items.length} món` : "Chưa có món"}</h2></div><ShoppingBag size={19} /></div>{items.length ? <div className="cart-items">{items.map((item) => <div className="cart-item" key={String(item.id)}><div><strong>{display(item.name)}</strong><small>{formatMoney(item.unit_price)} · SL {numberOf(item.quantity)}</small></div><div className="cart-item-actions"><button type="button" onClick={() => onQuantity(item, Math.max(1, numberOf(item.quantity) - 1))} disabled={loading}>−</button><button type="button" onClick={() => onQuantity(item, numberOf(item.quantity) + 1)} disabled={loading}>+</button><button className="text-button danger-text" type="button" onClick={() => onRemove(item)} disabled={loading}>Xóa</button></div></div>)}</div> : <p className="inline-note">Chọn món để bắt đầu giỏ hàng của một nhà hàng.</p>}{cart?.voucher ? <div className="voucher-applied"><span>Mã {display(asRecord(cart.voucher)?.code)}</span><button className="text-button" type="button" onClick={onRemoveVoucher} disabled={loading}>Bỏ mã</button></div> : <div className="voucher-row"><input aria-label="Mã giảm giá" placeholder="Mã giảm giá" value={voucher} onChange={(event) => setVoucher(event.target.value)} /><button className="text-button" type="button" onClick={onVoucher} disabled={loading || !voucher.trim()}>Áp dụng</button></div>}{items.length ? <><div className="cart-total"><span>Tạm tính</span><strong>{formatMoney(total)}</strong></div>{addresses.length ? <label className="transaction-field">Địa chỉ giao hàng<select value={addressId} onChange={(event) => setAddressId(event.target.value)}>{addresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.address_text}</option>)}</select></label> : <p className="field-hint">Chưa có địa chỉ. <Link className="text-link" href="/app/addresses">Lưu một địa chỉ</Link> trước khi đặt món.</p>}<button className="button button-primary button-wide" type="button" onClick={onPreview} disabled={loading || !addressId}>{loading ? <Loader2 className="spinner" size={16} /> : <ShieldCheck size={16} />} Xem preview xác nhận</button></> : null}{confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={onExecute} loading={loading} label="Xác nhận đặt món và thanh toán" /> : null}{order ? <div className="success-card"><Check size={18} /><strong>Đơn đã được tiếp nhận</strong><span>{formatMoney(order.amount, display(order.currency ?? "VND"))}</span><button className="button button-secondary" type="button" onClick={onPrepareCancel} disabled={loading}>Xem điều kiện hủy</button>{cancelConfirmation ? <ConfirmationBox confirmation={cancelConfirmation} checked={cancelChecked} setChecked={setCancelChecked} onConfirm={onExecuteCancel} loading={loading} label="Xác nhận hủy đơn và xử lý hoàn tiền nếu đủ điều kiện" /> : null}</div> : null}{order?.id ? <FoodTrackingPanel orderId={String(order.id)} /> : null}</aside>;
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

  const load = useCallback(async (query = "") => { setLoading(true); setError(""); try { setItems((await browseService("restaurant", query)).items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, []);

  async function open(item: JsonRecord): Promise<void> { const id = idOf(item); if (!id) return; setDetailLoading(true); setError(""); setSelected(undefined); try { setSelected(await getRestaurantDetail(id)); } catch (reason) { setError(errorText(reason)); } finally { setDetailLoading(false); } }
  async function check(): Promise<void> { if (!selected || actionLoading) return; setActionLoading(true); setError(""); try { const result = await checkRestaurantAvailability({ restaurant_id: idOf(selected), party_size: partySize, start_at: new Date(startAt).toISOString(), duration_minutes: 120 }); setAvailability(result); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function createHold(): Promise<void> { if (!selected || !availability?.available) return; setActionLoading(true); setError(""); try { setHold(await createRestaurantHold({ restaurant_id: idOf(selected), party_size: partySize, start_at: new Date(startAt).toISOString(), duration_minutes: 120 })); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function prepare(): Promise<void> { if (!selected || !hold?.id) return; setActionLoading(true); setError(""); try { setConfirmation(await prepareRestaurantReservation({ restaurant_id: idOf(selected), hold_id: String(hold.id), party_size: partySize, start_at: new Date(startAt).toISOString(), duration_minutes: 120 })); setChecked(false); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function confirm(): Promise<void> { if (!confirmation?.id || !checked) return; setActionLoading(true); setError(""); try { const result = await executeConfirmation(String(confirmation.id), { workflow_id: String(confirmation.workflow_id), action: String(confirmation.action) }); const tool = asRecord(result.tool_result); setReservation(asRecord(tool?.data ?? tool)); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function cancel(): Promise<void> { if (!reservation?.id) return; setActionLoading(true); setError(""); try { await cancelRestaurantReservation(String(reservation.id)); setReservation({ ...reservation, status: "CANCELLED" }); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }

  if (selected) return <div className="service-detail-flow"><button className="text-link" type="button" onClick={() => setSelected(undefined)}><ChevronLeft size={16} /> Danh sách nhà hàng</button><DetailHeading item={selected} service="restaurant" /><div className="transaction-grid"><article className="transaction-panel"><div className="panel-heading"><div><span className="eyebrow">GIỮ BÀN</span><h2>Chọn thời gian</h2></div><MapPinned size={19} /></div><label className="transaction-field">Ngày và giờ<input type="datetime-local" value={startAt} onChange={(event) => { setStartAt(event.target.value); setAvailability(undefined); setHold(undefined); setConfirmation(undefined); }} /></label><label className="transaction-field">Số người<input type="number" min={1} max={20} value={partySize} onChange={(event) => { setPartySize(Number(event.target.value)); setAvailability(undefined); setHold(undefined); }} /></label><button className="button button-primary button-wide" type="button" onClick={() => void check()} disabled={actionLoading}>{actionLoading ? <Loader2 className="spinner" size={16} /> : <Search size={16} />} Kiểm tra bàn trống</button>{availability ? <div className={`availability-card ${availability.available ? "is-available" : "is-unavailable"}`}><strong>{availability.available ? "Có bàn phù hợp" : "Chưa có bàn phù hợp"}</strong><p>{display(availability.message ?? (availability.available ? "Có thể giữ chỗ trong thời gian này." : "Thử một khung giờ khác."))}</p>{availability.available && !hold ? <button className="button button-secondary" type="button" onClick={() => void createHold()} disabled={actionLoading}>Giữ bàn tạm thời</button> : null}</div> : null}{hold ? <div className="hold-card"><Check size={17} /><div><strong>Đã giữ bàn trong thời gian ngắn</strong><p>Hết hạn {formatDateTime(hold.expires_at)}</p></div><button className="button button-primary" type="button" onClick={() => void prepare()} disabled={actionLoading}>Xem xác nhận</button></div> : null}{confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={() => void confirm()} loading={actionLoading} label="Xác nhận đặt bàn" /> : null}{reservation ? <div className="success-card"><Check size={18} /><strong>Đặt bàn đã hoàn tất</strong><span>{statusLabel(reservation.status ?? "CONFIRMED")}</span><button className="button button-secondary" type="button" onClick={() => void cancel()} disabled={actionLoading}>Hủy đặt bàn</button></div> : null}{error ? <ErrorNote message={error} onRetry={() => void check()} /> : null}</article><aside className="service-context-panel"><span className="eyebrow">THÔNG TIN NHÀ HÀNG</span><p>Nếu địa điểm chưa có tọa độ hợp lệ, X-One giữ nguyên địa chỉ và không tự đoán khoảng cách.</p><Link className="text-link" href="/app?service=restaurant&mode=assistant">Tiếp tục với AI <ArrowRight size={15} /></Link></aside></div></div>;

  return <><SearchForm label="Tìm theo tên, khu vực hoặc ẩm thực" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Ví dụ: Hoàn Kiếm, Việt Nam, sushi" />{loading ? <LoadingNote text="Đang tải nhà hàng…" /> : error ? <ErrorNote message={error} onRetry={() => void load(keyword)} /> : items.length ? <div className="browse-results">{items.map((item) => <article className="browse-result browse-result-action" key={idOf(item)}><AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? "Nhà hàng")} /><div><h2>{display(item.name ?? "Nhà hàng")}</h2><p>{display(item.location ?? item.address ?? "Địa chỉ đang được xác minh")}</p><small>{display(item.cuisine_type ?? item.cuisine ?? "Ẩm thực chưa phân loại")} · {display(item.budget_range ?? "Mức giá chưa công bố")}</small></div><button className="button button-secondary" type="button" onClick={() => void open(item)}>Xem và giữ bàn <ChevronRight size={16} /></button></article>)}</div> : <EmptyNote title="Bạn muốn đặt bàn như thế nào?" body="Nhập khu vực, số người, thời gian hoặc loại ẩm thực để mình tìm nhà hàng phù hợp." />}</>;
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
  return <div className="healthcare-browse-with-favorite">{facilityId ? <div className="healthcare-favorite-banner"><span><span className="eyebrow">CƠ SỞ Y TẾ</span><strong>Lưu cơ sở đang cung cấp lịch khám</strong></span><FavoriteToggle domain="healthcare" resourceId={facilityId} /></div> : null}<HealthcareBrowse /></div>;
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

  const load = useCallback(async (query = "") => { setLoading(true); setError(""); try { const result = await browseService("healthcare", query); const next = result.items; setDepartments(next); if (!department && next[0]) setDepartment(display(next[0].name ?? next[0].label ?? next[0].id)); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [department]);
  useEffect(() => { void load(); void listHealthcarePatients().then((result) => { setPatients(result.items); setPatientId(result.items.find((item) => item.is_default)?.id ?? result.items[0]?.id); }).catch(() => undefined); }, [load]);
  useEffect(() => { if (!department) return; setActionLoading(true); setError(""); void listHealthcareDoctors(department).then(setDoctors).catch((reason) => setError(errorText(reason))).finally(() => setActionLoading(false)); }, [department]);

  const slots: JsonRecord[] = useMemo(() => doctors.flatMap((doctor) => listFrom(doctor.available_slots).map((value): JsonRecord => ({ ...value, doctor_name: doctor.name, doctor_id: doctor.id, doctor_description: doctor.description, price: doctor.price, facility: doctor.facility }))), [doctors]);
  async function hold(): Promise<void> { if (!slot || !patientId || !symptoms.trim()) { setError("Chọn khung giờ, hồ sơ bệnh nhân và mô tả nhu cầu khám trước."); return; } setActionLoading(true); setError(""); try { setAppointment(await holdHealthcareSlot({ slot_id: numberOf(slot.id), patient_id: patientId, symptoms: symptoms.trim() })); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function pay(): Promise<void> { if (!appointment?.appointment_id) return; setActionLoading(true); setError(""); try { await acknowledgeHealthcarePayment(numberOf(appointment.appointment_id)); setPaymentDone(true); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function prepare(): Promise<void> { if (!appointment?.appointment_id || !paymentDone) return; setActionLoading(true); setError(""); try { setConfirmation(await prepareHealthcareAppointment(numberOf(appointment.appointment_id))); setChecked(false); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }
  async function confirm(): Promise<void> {
    if (!confirmation?.id || !checked) return;
    setActionLoading(true); setError("");
    try {
      const result = await executeConfirmation(String(confirmation.id), { workflow_id: String(confirmation.workflow_id), action: String(confirmation.action) });
      const tool = asRecord(result.tool_result);
      const confirmedAppointment = asRecord(tool?.appointment)
        ?? asRecord(tool?.data)
        ?? asRecord(tool);
      setAppointment(confirmedAppointment ?? appointment);
      setConfirmation(undefined);
      setChecked(false);
    } catch (reason) { setError(errorText(reason)); }
    finally { setActionLoading(false); }
  }
  async function cancel(): Promise<void> { if (!appointment?.appointment_id) return; setActionLoading(true); setError(""); try { await cancelHealthcareAppointment(numberOf(appointment.appointment_id)); setAppointment({ ...appointment, status: "CANCELLED" }); } catch (reason) { setError(errorText(reason)); } finally { setActionLoading(false); } }

  return <><SearchForm label="Tìm chuyên khoa" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Ví dụ: nội thần kinh" />{loading ? <LoadingNote text="Đang tải chuyên khoa…" /> : error && !departments.length ? <ErrorNote message={error} onRetry={() => void load(keyword)} /> : <div className="healthcare-flow"><article className="transaction-panel"><div className="panel-heading"><div><span className="eyebrow">CHUYÊN KHOA</span><h2>Chọn điểm bắt đầu</h2></div><HeartPulse size={19} /></div><div className="chip-list">{departments.map((item) => { const name = display(item.name ?? item.label ?? item.id); return <button className={department === name ? "chip is-active" : "chip"} key={name} type="button" onClick={() => { setDepartment(name); setSlot(undefined); setAppointment(undefined); }}>{name}</button>; })}</div>{department ? <><div className="panel-heading compact"><div><span className="eyebrow">BÁC SĨ VÀ KHUNG GIỜ</span><h2>{department}</h2></div></div>{actionLoading && !appointment ? <LoadingNote text="Đang tải khung giờ…" /> : slots.length ? <div className="slot-list">{slots.map((value) => <button className={slot?.id === value.id ? "slot-option is-active" : "slot-option"} key={String(value.id)} type="button" onClick={() => setSlot(value)}><strong>{display(value.doctor_name)}</strong><span>{formatDateTime(value.start_time)} · {display(asRecord(value.facility)?.name ?? asRecord(value.facility)?.address ?? "Cơ sở đang xác minh")}</span>{value.price !== undefined ? <small>{formatMoney(value.price)}</small> : null}</button>)}</div> : <EmptyNote title="Chưa có khung giờ" body="Chưa có lịch trống cho chuyên khoa này." />}</> : null}{slot ? <div className="healthcare-form"><label className="transaction-field">Hồ sơ bệnh nhân<select value={patientId ?? ""} onChange={(event) => setPatientId(Number(event.target.value))}><option value="">Chọn hồ sơ</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.relationship}</option>)}</select></label><label className="transaction-field">Nhu cầu khám<textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} placeholder="Mô tả ngắn để cơ sở chuẩn bị tiếp nhận" rows={3} /></label><button className="button button-primary button-wide" type="button" onClick={() => void hold()} disabled={actionLoading || !patientId || !symptoms.trim()}>{actionLoading ? <Loader2 className="spinner" size={16} /> : <ShieldCheck size={16} />} Giữ khung giờ</button></div> : null}{appointment && !confirmation ? <div className="hold-card"><Check size={17} /><div><strong>Đã giữ khung giờ</strong><p>{display(appointment.doctor_name)} · {formatDateTime(appointment.start_time)} · {formatMoney(appointment.price)}</p></div>{!paymentDone ? <button className="button button-primary" type="button" onClick={() => void pay()} disabled={actionLoading}>Xác nhận thanh toán</button> : <button className="button button-primary" type="button" onClick={() => void prepare()} disabled={actionLoading}>Xem xác nhận cuối</button>}</div> : null}{confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={() => void confirm()} loading={actionLoading} label="Xác nhận hoàn tất lịch khám" /> : null}{appointment?.status === "CONFIRMED" || appointment?.status === "CANCELLED" ? <div className="success-card"><Check size={18} /><strong>Lịch khám: {statusLabel(appointment.status)}</strong><span>{display(appointment.doctor_name)} · {formatDateTime(appointment.start_time)}</span>{appointment.status === "CONFIRMED" ? <button className="button button-secondary" type="button" onClick={() => void cancel()} disabled={actionLoading}>Hủy lịch khám</button> : null}</div> : null}{error ? <ErrorNote message={error} onRetry={() => void hold()} /> : null}</article><aside className="service-context-panel"><span className="eyebrow">THÔNG TIN LỊCH KHÁM</span><p>X-One chỉ hiển thị bác sĩ, giá và khung giờ khi thông tin đã sẵn sàng. Đây là luồng đặt lịch, không phải chẩn đoán.</p><Link className="text-link" href="/app?service=healthcare&mode=assistant">Tiếp tục với AI <ArrowRight size={15} /></Link></aside></div>}</>;
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
  return <div className="ride-browse-flow"><form className="ride-form" onSubmit={(event) => { event.preventDefault(); void submitQuote(); }}><div className="panel-heading"><div><span className="eyebrow">LỘ TRÌNH</span><h2>Đặt xe trực tiếp</h2></div><Bike size={19} /></div>{addresses.length ? <div className="address-shortcuts"><label>Điểm đi từ địa chỉ đã lưu<select defaultValue="" onChange={(event) => useAddress("pickup", event.target.value)}><option value="">Chọn nhanh…</option>{addresses.map((address) => <option key={`p-${address.id}`} value={address.id}>{address.label}</option>)}</select></label><label>Điểm đến từ địa chỉ đã lưu<select defaultValue="" onChange={(event) => useAddress("dropoff", event.target.value)}><option value="">Chọn nhanh…</option>{addresses.map((address) => <option key={`d-${address.id}`} value={address.id}>{address.label}</option>)}</select></label></div> : null}<AddressAutocompleteField id="ride-pickup" label="Điểm đi" value={pickup} placeholder="Địa chỉ đón" onChange={(value) => { setPickup(value); setPickupPoint(undefined); }} onSelect={(candidate) => { setPickup(candidate.address_text); setPickupPoint(candidatePoint(candidate)); }} /><AddressAutocompleteField id="ride-dropoff" label="Điểm đến" value={dropoff} placeholder="Địa chỉ đến" onChange={(value) => { setDropoff(value); setDropoffPoint(undefined); }} onSelect={(candidate) => { setDropoff(candidate.address_text); setDropoffPoint(candidatePoint(candidate)); }} /><label htmlFor="ride-vehicle">Loại xe</label><select id="ride-vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value as typeof vehicle)}><option value="BIKE">Xe máy</option><option value="CAR_4">Ô tô 4 chỗ</option><option value="CAR_7">Ô tô 7 chỗ</option></select>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary button-wide" type="submit" disabled={loading || !pickup.trim() || !dropoff.trim()}>{loading ? <Loader2 className="spinner" size={16} /> : <MapPinned size={16} />}{loading ? "Đang tính lộ trình…" : "Nhận báo giá"}</button></form>{quote ? <article className="quote-result" aria-live="polite"><div className="quote-result-heading"><div><span className="eyebrow">BÁO GIÁ</span><h2>{formatMoney(quote.amount, quote.currency)}</h2></div><span className="status-badge">{statusLabel(quote.status)}</span></div><dl><div><dt>Lộ trình</dt><dd>{quote.distance_km} km · khoảng {quote.duration_minutes} phút</dd></div><div><dt>Loại xe</dt><dd>{vehicleLabel(quote.vehicle_type)}</dd></div><div><dt>Đường đi</dt><dd>{quote.route_geometry?.length || quote.route_polyline ? "Đã có dữ liệu đường đi" : "Đang cập nhật"}</dd></div></dl><XOneMap origin={pointFromQuote(quote, "pickup")} destination={pointFromQuote(quote, "dropoff")} routeGeometry={quote.route_geometry ?? undefined} routePolyline={quote.route_polyline ?? undefined} routeProvider={quote.route_provider} routeDistanceMeters={quote.route_distance_meters} routeDurationSeconds={quote.route_duration_seconds} routeStatus={quote.status} label="Lộ trình báo giá" /><button className="button button-secondary ride-detail-action" type="button" onClick={() => setQuoteDetailOpen(true)}>Xem bản đồ và hành trình</button>{quoteDetail ? <ServiceDetailDialog open={quoteDetailOpen} onOpenChange={setQuoteDetailOpen} kind="ride" option={null} ride={quoteDetail} /> : null}{!booking ? <ConfirmationBox confirmation={{ title: "Xác nhận thông tin chuyến", detail: `${quote.pickup_address} → ${quote.dropoff_address} · ${formatMoney(quote.amount, quote.currency)}` }} checked={serviceChecked} setChecked={setServiceChecked} onConfirm={() => void prepare()} loading={loading} label="Tôi xác nhận điểm đi, điểm đến, loại xe và báo giá" /> : <><div className="hold-card"><Check size={17} /><div><strong>Thông tin chuyến đã được ghi nhận</strong><p>{status}</p></div></div>{booking.status === "AWAITING_CONFIRMATION" || booking.status === "AWAITING_PAYMENT_CONFIRMATION" ? <ConfirmationBox confirmation={{ title: "Xác nhận thanh toán", detail: `Thanh toán ${formatMoney(quote.amount, quote.currency)} để gửi yêu cầu tìm tài xế.` }} checked={paymentChecked} setChecked={setPaymentChecked} onConfirm={() => void confirm()} loading={loading} label="Tôi xác nhận thanh toán và muốn hoàn tất đặt xe" /> : <RideResult booking={booking} quote={quote} />}</>}</article> : <div className="quote-result quote-empty"><MapPinned size={22} /><p>Nhập hai điểm để xem khoảng cách, thời gian và giá hiện tại.</p></div>}</div>;
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

function RideResult({ booking, quote }: { booking: JsonRecord; quote: RideQuote }) { const noDriver = booking.status === "NO_DRIVER"; const completed = booking.status === "COMPLETED"; const searching = booking.status === "SEARCHING_DRIVER"; return <div className="ride-result"><div className="success-card"><Check size={18} /><strong>{noDriver ? "Chưa tìm được tài xế phù hợp" : completed ? "Chuyến đã hoàn tất" : "Chuyến của bạn đã được ghi nhận"}</strong><span>{noDriver ? "Bạn có thể thử lại với một điểm đón khác." : searching ? "Đang tìm tài xế gần bạn…" : `Trạng thái hiện tại: ${statusLabel(booking.status)}`}</span></div><RideTrackingPanel bookingId={String(booking.id)} /><p className="inline-note">Giá và lộ trình dựa trên thông tin đã xác nhận của chuyến.</p></div>; }

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

  return <div className="address-autocomplete"><label htmlFor={id}>{label}</label><input id={id} value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => { if (suggestions.length) setOpen(true); }} onBlur={() => globalThis.setTimeout(() => setOpen(false), 150)} placeholder={placeholder} autoComplete="off" required minLength={3} />{open && suggestions.length ? <div className="address-suggestions" role="listbox" aria-label={`Gợi ý ${label.toLowerCase()}`}>{suggestions.map((candidate, index) => <button className="address-suggestion" key={`${candidate.address_text}-${index}`} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(candidate); setOpen(false); }}>{candidate.address_text}</button>)}</div> : null}</div>;
}

function SearchForm({ label, keyword, setKeyword, loading, onSubmit, placeholder }: { label: string; keyword: string; setKeyword: (value: string) => void; loading: boolean; onSubmit: () => void; placeholder: string }) { return <form className="service-search" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><label htmlFor="service-search-input">{label}</label><div><input id="service-search-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={placeholder} /><button className="button button-primary" type="submit" disabled={loading}><Search size={16} /> Tìm</button></div></form>; }
function AuthoritativeImage({ source, alt, compact = false }: { source: unknown; alt: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (typeof source !== "string" || !source.trim()) return null;
  const className = `authoritative-image${compact ? " compact" : ""}`;
  if (failed) return <div className={`${className} service-image-fallback`} role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh không khả dụng</div>;
  return <div className={className}><img src={source} alt={alt} loading="lazy" onError={() => setFailed(true)} /></div>;
}
function DetailHeading({ item, service }: { item: JsonRecord; service: ServiceKey }) { const point = pointFromRecord(item); const resourceId = idOf(item); return <div className="service-detail-heading"><div><AuthoritativeImage source={item.image_url} alt={display(item.name ?? item.title ?? "Địa điểm")} /><span className="eyebrow">{service.toUpperCase()} · CHI TIẾT</span><h2>{display(item.name ?? item.title ?? "Địa điểm")}</h2><p>{display(item.address ?? item.location ?? item.description ?? "Địa chỉ đang cập nhật")}</p>{service !== "ride" ? <FavoriteToggle domain={service} resourceId={resourceId} /> : null}</div>{point ? <XOneMap destination={point} label="Vị trí địa điểm" /> : <span className="field-hint">Chưa có tọa độ hợp lệ; bản đồ không khả dụng.</span>}</div>; }
function ConfirmationBox({ confirmation, checked, setChecked, onConfirm, loading, label }: { confirmation: JsonRecord; checked: boolean; setChecked: (value: boolean) => void; onConfirm: () => void; loading: boolean; label: string }) { return <div className="confirmation-box"><div><span className="eyebrow">XÁC NHẬN RÕ RÀNG</span><h3>{display(confirmation.title ?? "Kiểm tra lần cuối")}</h3><p>{display(confirmation.detail ?? "Các điều khoản hiện tại đã được kiểm tra từ nguồn đáng tin cậy.")}</p>{confirmation.preview ? <PreviewSummary preview={asRecord(confirmation.preview)} /> : null}</div><label className="confirmation-check"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> <span>{label}</span></label><button className="button button-primary" type="button" onClick={onConfirm} disabled={loading || !checked}>{loading ? <Loader2 className="spinner" size={16} /> : <ShieldCheck size={16} />} Xác nhận</button></div>; }
function PreviewSummary({ preview }: { preview?: JsonRecord }) { if (!preview) return null; const total = asRecord(preview.total); return <dl className="preview-summary"><div><dt>Tạm tính</dt><dd>{formatMoney(preview.subtotal)}</dd></div><div><dt>Giao hàng</dt><dd>{formatMoney(preview.delivery_fee ?? preview.delivery_amount)}</dd></div><div><dt>Tổng</dt><dd>{formatMoney(total?.amount, display(total?.currency ?? "VND"))}</dd></div><div><dt>Địa chỉ giao</dt><dd>{display(asRecord(preview.address)?.address ?? asRecord(preview.address)?.address_text ?? "Đã kiểm tra")}</dd></div></dl>; }
function LoadingNote({ text }: { text: string }) { return <p className="inline-note service-loading-note" aria-live="polite"><Loader2 className="spinner" size={17} /> {text}</p>; }
function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="error-panel" role="alert"><p>{message}</p><button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button></div>; }
function EmptyNote({ title, body }: { title: string; body: string }) { return <div className="empty-state"><Search size={24} /><h2>{title}</h2><p>{body}</p></div>; }
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
