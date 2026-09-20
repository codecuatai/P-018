"use client";

import { ArrowLeft, ArrowRight, Award, Bike, Calendar, Car, Check, ChevronLeft, ChevronRight, Clock, Compass, HeartPulse, Info, Loader2, MapPin, MapPinned, MessageSquare, Phone, Plus, QrCode, Search, ShieldCheck, ShoppingBag, Sparkles, Star, Users, Utensils, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  createSavedAddress,
  createFoodCart,
  createHealthcarePatient,
  createRestaurantHold,
  errorText,
  executeCancellation,
  executeConfirmation,
  getFoodMenu,
  getFoodRestaurant,
  getHistoryDetail,
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
import type { AssistantRideItem, GeocodeCandidate, HealthcarePatient, RideQuote, RideStopover, SavedAddress, ServiceKey } from "@/types";

import { RideTrackingPanel } from "./ride-tracking";
import { useRideTracking } from "./ride-tracking-cache";
import { FoodTrackingPanel } from "./food-tracking";
import { XOneMap } from "./xone-map";
import { formatAddress, formatDateTime, formatMoney as presentMoney, serviceLabel, statusLabel } from "@/lib/presentation";
import { FavoriteToggle } from "./favorite-toggle";
import { ServiceDetailDialog } from "@/components/ServiceDetailDialog";
import { DigitalPassCard } from "@/components/DigitalPassCard";

type JsonRecord = Record<string, unknown>;
type Point = { latitude: number; longitude: number };

const copy: Record<ServiceKey, { label: string; description: string; action: string }> = {
  food: { label: "Đồ ăn", description: "Chọn nhà hàng, xem thực đơn và hoàn tất đơn giao.", action: "Tìm món" },
  ride: { label: "Chuyến xe", description: "Tính lộ trình, kiểm tra báo giá và xác nhận chuyến rõ ràng.", action: "Nhận báo giá" },
  restaurant: { label: "Nhà hàng", description: "Tìm địa điểm, kiểm tra bàn trống và giữ chỗ theo thời gian thực.", action: "Tìm nhà hàng" },
  healthcare: { label: "Lịch khám", description: "Chọn chuyên khoa, bác sĩ, khung giờ và hồ sơ bệnh nhân.", action: "Tìm chuyên khoa" },
};
const icons = { food: Utensils, ride: Bike, restaurant: MapPinned, healthcare: HeartPulse };

export function ServiceBrowse({ service, resumeAppointmentId }: { service: ServiceKey; resumeAppointmentId?: string }) {
  const Icon = icons[service];
  return <section className="service-browse" aria-labelledby="service-browse-title">
    <div className="service-browse-top"><Link className="text-link" href="/app/services"><ArrowLeft size={16} /> Dịch vụ</Link><Link className="text-link" href={`/app?service=${service}&mode=assistant`}>Tiếp tục với X-One AI <ArrowRight size={16} /></Link></div>
    <header className="service-browse-heading"><span className="service-browse-icon"><Icon size={22} /></span><div><span className="eyebrow">{serviceLabel(service).toUpperCase()}</span><h1 id="service-browse-title">{copy[service].label}</h1><p>{copy[service].description}</p></div></header>
    {service === "food" ? <FoodBrowse /> : service === "restaurant" ? <RestaurantBrowse /> : service === "healthcare" ? <HealthcareBrowseWithFavorite resumeAppointmentId={resumeAppointmentId} /> : <RideBrowse />}
  </section>;
}

function FoodBrowse() {
  const itemsPerPage = 5;
  const menuItemsPerPage = 6;
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [activeKeyword, setActiveKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [restaurant, setRestaurant] = useState<JsonRecord>();
  const [menuItems, setMenuItems] = useState<JsonRecord[]>([]);
  const [menuPage, setMenuPage] = useState(1);
  const [menuPageCount, setMenuPageCount] = useState(1);
  const [menuTotal, setMenuTotal] = useState(0);
  const [menuLoading, setMenuLoading] = useState(false);
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
  // Chống race: mỗi lần gọi tăng số thứ tự, phản hồi về muộn hơn lần gọi mới nhất
  // sẽ bị bỏ qua. Cần thiết vì ô tìm kiếm bị khoá theo `loading` còn thanh phân
  // trang khoá theo `paging`, nên người dùng vẫn có thể tìm khi đang đổi trang.
  const browseRequestRef = useRef(0);
  const menuRequestRef = useRef(0);

  // `keepList` = true khi chỉ đổi trang: giữ nguyên danh sách đang hiển thị và chỉ
  // khoá thanh phân trang, tránh việc cả danh sách lẫn nút chuyển trang bị thay
  // bằng spinner rồi nhảy layout ở mỗi lần bấm Trước/Sau.
  const load = useCallback(async (query = "", targetPage = 1, keepList = false) => {
    const requestId = browseRequestRef.current + 1;
    browseRequestRef.current = requestId;
    if (keepList) setPaging(true); else setLoading(true);
    setError("");
    try {
      const result = await browseService("food", query, { page: targetPage, limit: itemsPerPage });
      if (browseRequestRef.current !== requestId) return;
      const total = typeof result.total === "number" ? result.total : result.items.length;
      setItems(result.items);
      setActiveKeyword(query);
      setPage(typeof result.page === "number" && result.page > 0 ? result.page : targetPage);
      setTotalItems(total);
      setPageCount(typeof result.total_pages === "number" && result.total_pages > 0 ? result.total_pages : Math.max(1, Math.ceil(total / itemsPerPage)));
    }
    catch (reason) { if (browseRequestRef.current === requestId) setError(errorText(reason)); }
    finally { if (browseRequestRef.current === requestId) { if (keepList) setPaging(false); else setLoading(false); } }
  }, []);
  const searchParams = useSearchParams();
  const initialResourceId = searchParams.get("resource");
  useEffect(() => { void load(); void listSavedAddresses().then((result) => { setAddresses(result.items); setAddressId(result.items.find((item) => item.is_default)?.id ?? result.items[0]?.id ?? ""); }).catch(() => undefined); }, [load]);
  useEffect(() => {
    if (!initialResourceId || selectedId || detailLoading) return;
    const match = items.find((item) => idOf(item) === initialResourceId);
    if (match) {
      void openRestaurant(match);
    } else if (items.length > 0) {
      void openRestaurant({ id: initialResourceId });
    }
  }, [initialResourceId, items, selectedId, detailLoading]);

  const loadMenu = useCallback(async (id: string, targetPage: number): Promise<void> => {
    const requestId = menuRequestRef.current + 1;
    menuRequestRef.current = requestId;
    setMenuLoading(true);
    try {
      const menu = await getFoodMenu(id, { limit: menuItemsPerPage, offset: (targetPage - 1) * menuItemsPerPage });
      // Bỏ qua nếu người dùng đã mở nhà hàng khác hoặc đổi trang trong lúc chờ,
      // tránh thực đơn của nhà hàng cũ ghi đè lên nhà hàng đang xem.
      if (menuRequestRef.current !== requestId) return;
      const fetched = listFrom(menu.items);
      const total = typeof menu.total === "number" ? menu.total : fetched.length;
      setMenuItems(fetched);
      setMenuPage(targetPage);
      setMenuTotal(total);
      setMenuPageCount(Math.max(1, Math.ceil(total / menuItemsPerPage)));
    }
    catch (reason) { if (menuRequestRef.current === requestId) setError(errorText(reason)); }
    finally { if (menuRequestRef.current === requestId) setMenuLoading(false); }
  }, []);

  async function openRestaurant(item: JsonRecord): Promise<void> {
    const id = idOf(item);
    if (!id) return;
    setSelectedId(id); setRestaurant(undefined); setMenuItems([]); setCart(undefined); setConfirmation(undefined); setOrderResult(undefined); setError(""); setDetailLoading(true); setMenuPage(1); setMenuPageCount(1); setMenuTotal(0);
    try {
      const [detail] = await Promise.all([getFoodRestaurant(id), loadMenu(id, 1)]);
      setRestaurant(detail);
    } catch (reason) { setError(errorText(reason)); }
    finally { setDetailLoading(false); }
  }

  async function addItem(item: JsonRecord, selectedOptions: Array<{ group_id: string; option_id: string }> = [], note?: string, quantity = 1): Promise<void> {
    if (!selectedId || cartLoading) return;
    setCartLoading(true); setError("");
    try {
      const current = cart ?? await createFoodCart(selectedId);
      const next = await addFoodCartItem(String(current.id), { menu_item_id: idOf(item), quantity: Math.max(1, quantity), ...(selectedOptions.length ? { selected_options: selectedOptions } : {}), ...(note?.trim() ? { note: note.trim() } : {}) });
      setCart(next);
      setConfirmation(undefined); setChecked(false);
      setCustomizingItem(undefined);
      const itemName = display(item.name ?? item.title ?? "Món ăn");
      setNotice(`${itemName}${Math.max(1, quantity) > 1 ? ` (x${Math.max(1, quantity)})` : ""} đã được thêm vào giỏ.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function changeQuantity(item: JsonRecord, quantity: number): Promise<void> {
    if (!cart || quantity < 1) return;
    setCartLoading(true); setError("");
    try { setCart(await updateFoodCartItem(String(cart.id), String(item.id), { quantity })); setConfirmation(undefined); setChecked(false); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function removeItem(item: JsonRecord): Promise<void> {
    if (!cart) return;
    setCartLoading(true); setError("");
    try { setCart(await removeFoodCartItem(String(cart.id), String(item.id))); setConfirmation(undefined); setChecked(false); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function applyVoucherCode(): Promise<void> {
    if (!cart || !voucher.trim()) return;
    setCartLoading(true); setError("");
    try { setCart(await applyFoodVoucher(String(cart.id), voucher.trim())); setVoucher(""); setConfirmation(undefined); setChecked(false); }
    catch (reason) { setError(errorText(reason)); }
    finally { setCartLoading(false); }
  }

  async function removeVoucherCode(): Promise<void> {
    if (!cart) return;
    setCartLoading(true); setError("");
    try { setCart(await removeFoodVoucher(String(cart.id))); setConfirmation(undefined); setChecked(false); }
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

  // Danh sách và thực đơn đều được phân trang ở server, nên `items`/`menuItems`
  // đã đúng là nội dung của trang hiện tại — không slice lại ở client nữa.
  const visibleItems = items;
  const visibleMenuItems = menuItems;

  if (selectedId) return <div className="service-detail-flow"><button className="text-link" type="button" onClick={() => { setSelectedId(""); setError(""); }}><ChevronLeft size={16} /> Danh sách nhà hàng</button>{detailLoading ? <LoadingNote text="Đang tải nhà hàng và thực đơn…" /> : restaurant ? (<><DetailHeading item={restaurant} service="food" /><div className="food-product-grid"><div className="menu-panel"><div className="panel-heading"><div><span className="eyebrow">THỰC ĐƠN</span><h2>Món đang phục vụ</h2></div><Link className="text-link" href="/app?service=food&mode=assistant">Hỏi X-One AI <ArrowRight size={15} /></Link></div>{customizingItem ? <FoodItemCustomizer item={customizingItem} loading={cartLoading} onCancel={() => setCustomizingItem(undefined)} onAdd={(options, note, quantity) => void addItem(customizingItem, options, note, quantity)} /> : null}{menuTotal > 0 ? <><div className="menu-list">{visibleMenuItems.map((item) => <article className="menu-item" key={idOf(item)}><AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Món ăn")} /><div className="menu-item-copy"><h3>{display(item.name ?? item.title ?? "Món ăn")}</h3><p>{display(item.description ?? "Mô tả món đang cập nhật")}</p><strong>{formatMoney(item.price ?? item.base_price)}</strong></div><button className="button button-secondary" type="button" onClick={() => setCustomizingItem(item)} disabled={cartLoading || item.available === false}><ShoppingBag size={15} /> Tùy chỉnh & Thêm</button></article>)}</div>{menuPageCount > 1 ? <nav className="menu-pagination" aria-label="Phân trang thực đơn"><button className="button button-secondary" type="button" onClick={() => void loadMenu(selectedId, Math.max(1, menuPage - 1))} disabled={menuPage === 1 || menuLoading}><ChevronLeft size={16} /> Trước</button><span aria-live="polite">Trang {menuPage} / {menuPageCount} · {menuTotal} món</span><button className="button button-secondary" type="button" onClick={() => void loadMenu(selectedId, Math.min(menuPageCount, menuPage + 1))} disabled={menuPage === menuPageCount || menuLoading}>Sau <ChevronRight size={16} /></button></nav> : null}</> : <EmptyNote title="Thực đơn chưa có món" body="Nhà hàng này chưa có món có thể đặt." />}</div><FoodCart cart={cart} addresses={addresses} addressId={addressId} setAddressId={(value) => { setAddressId(value); setConfirmation(undefined); setChecked(false); }} onAddressAdded={(address) => { setAddresses((current) => [address, ...current.filter((item) => item.id !== address.id)]); setAddressId(address.id); setConfirmation(undefined); setChecked(false); }} voucher={voucher} setVoucher={setVoucher} loading={cartLoading} onVoucher={() => void applyVoucherCode()} onRemoveVoucher={() => void removeVoucherCode()} onQuantity={(item, quantity) => void changeQuantity(item, quantity)} onRemove={(item) => void removeItem(item)} onPreview={() => void prepareOrder()} confirmation={confirmation} checked={checked} setChecked={setChecked} onExecute={() => void executeOrder()} orderResult={orderResult} cancelConfirmation={cancelConfirmation} cancelChecked={cancelChecked} setCancelChecked={setCancelChecked} onPrepareCancel={() => void prepareCancel()} onExecuteCancel={() => void executeCancel()} /></div>{notice ? <p className="form-success" role="status">{notice}</p> : null}</>) : null}{error ? <ErrorNote message={error} onRetry={() => void openRestaurant({ id: selectedId })} /> : null}</div>;

  return <><SearchForm label="Tìm nhà hàng hoặc món" keyword={keyword} setKeyword={setKeyword} loading={loading} onSubmit={() => void load(keyword)} placeholder="Tên món, tên nhà hàng, khu vực" />{loading ? <LoadingNote text="Đang tải danh sách…" /> : error ? <ErrorNote message={error} onRetry={() => void load(keyword)} /> : items.length ? <><div className="browse-results">{visibleItems.map((item) => <article className="browse-result browse-result-action" key={idOf(item)}><AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? item.title ?? "Nhà hàng")} /><div className="browse-result-copy"><h2>{display(item.name ?? item.title ?? "Nhà hàng")}</h2><p>{display(item.address ?? item.location ?? "Địa chỉ đang cập nhật")}</p><small>{listFrom(item.matching_items).length ? `${listFrom(item.matching_items).length} món khớp` : item.is_open === false ? "Đang đóng cửa" : "Đang nhận đơn"}</small></div><button className="button button-secondary" type="button" onClick={() => void openRestaurant(item)}>Xem thực đơn <ChevronRight size={16} /></button></article>)}</div>{pageCount > 1 ? <nav className="browse-pagination" aria-label="Phân trang danh sách nhà hàng"><button className="button button-secondary" type="button" onClick={() => void load(activeKeyword, Math.max(1, page - 1), true)} disabled={page === 1 || paging}><ChevronLeft size={16} /> Trước</button><span aria-live="polite">Trang {page} / {pageCount} · {totalItems} nhà hàng</span><button className="button button-secondary" type="button" onClick={() => void load(activeKeyword, Math.min(pageCount, page + 1), true)} disabled={page === pageCount || paging}>Sau <ChevronRight size={16} /></button></nav> : null}</> : <EmptyNote title="Chưa có nhà hàng phù hợp" body="Thử từ khóa khác hoặc chuyển sang X-One AI để mô tả món bạn muốn." />}</>;
}

function FoodItemCustomizer({ item, loading, onCancel, onAdd }: { item: JsonRecord; loading: boolean; onCancel: () => void; onAdd: (options: Array<{ group_id: string; option_id: string }>, note: string, quantity: number) => void }) {
  const backendGroups = listFrom(item.options ?? item.option_groups ?? item.modifier_groups);
  const basePrice = moneyAmount(item.price ?? item.base_price) || 35000;

  const defaultGroups = useMemo(() => [
    {
      id: "size",
      name: "Chọn kích cỡ (Size)",
      required: true,
      options: [
        { id: "size_m", name: "Size Vừa (M) · Tiêu chuẩn", price: 0 },
        { id: "size_l", name: "Size Lớn (L) · Thêm 30%", price: 10000 },
      ],
    },
    {
      id: "toppings",
      name: "Topping & Món ăn kèm (Tùy chọn)",
      required: false,
      multiple: true,
      options: [
        { id: "top_egg", name: "Trứng ốp la / Trân châu hoàng kim", price: 8000 },
        { id: "top_cheese", name: "Phô mai tươi / Chả lụa thêm", price: 12000 },
        { id: "top_soup", name: "Canh súp rong biển / Thạch thảo mộc", price: 6000 },
        { id: "top_sauce", name: "Sốt đặc biệt X-One Chef", price: 5000 },
      ],
    },
    {
      id: "flavor",
      name: "Khẩu vị & Độ ngọt / cay",
      required: false,
      options: [
        { id: "fl_100", name: "100% (Tiêu chuẩn quán)", price: 0 },
        { id: "fl_70", name: "70% (Ít cay / Ít ngọt)", price: 0 },
        { id: "fl_50", name: "50% (Vừa phải)", price: 0 },
        { id: "fl_0", name: "0% (Không cay / Không đường)", price: 0 },
      ],
    },
  ], []);

  const groups = backendGroups.length ? backendGroups : defaultGroups;
  const [selectedSingle, setSelectedSingle] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const g of groups) {
      const gId = idOf(g);
      const gRec = g as Record<string, unknown>;
      const isMulti = gRec.multiple === true || (Array.isArray(g.options) && Number(gRec.max_select ?? 0) > 1);
      if (!isMulti) {
        const opts = listFrom(g.options);
        if (opts.length > 0) initial[gId] = idOf(opts[0]);
      }
    }
    return initial;
  });

  const [selectedMulti, setSelectedMulti] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const quickNotes = ["Không hành", "Ít cay", "Để riêng sốt/nước dùng", "Nhiều rau thơm", "Giao thật nóng"];

  function toggleQuickNote(qn: string) {
    if (note.includes(qn)) {
      setNote((current) => current.replace(qn, "").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "").trim());
    } else {
      setNote((current) => (current.trim() ? `${current.trim()}, ${qn}` : qn));
    }
  }

  const liveAddonPrice = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      const gId = idOf(g);
      const opts = listFrom(g.options);
      const singleChoice = selectedSingle[gId];
      if (singleChoice) {
        const match = opts.find((o) => idOf(o) === singleChoice);
        if (match) sum += numberOf(match.price);
      }
      const multiChoices = selectedMulti[gId];
      if (multiChoices) {
        for (const mId of multiChoices) {
          const match = opts.find((o) => idOf(o) === mId);
          if (match) sum += numberOf(match.price);
        }
      }
    }
    return sum;
  }, [groups, selectedSingle, selectedMulti]);

  const liveTotal = (basePrice + liveAddonPrice) * quantity;

  const missing = groups.some((group) => {
    if (group.required !== true) return false;
    const gId = idOf(group);
    return !selectedSingle[gId];
  });

  function submit(): void {
    if (missing) return;
    const resultOptions: Array<{ group_id: string; option_id: string }> = [];
    for (const [gId, oId] of Object.entries(selectedSingle)) {
      if (oId) resultOptions.push({ group_id: gId, option_id: oId });
    }
    for (const [gId, oSet] of Object.entries(selectedMulti)) {
      for (const oId of oSet) {
        resultOptions.push({ group_id: gId, option_id: oId });
      }
    }
    onAdd(resultOptions, note, quantity);
  }

  return (
    <div className="food-customizer food-customizer-dialog" style={{ background: "#FFFFFF", borderRadius: "16px", border: "1.5px solid #EA580C", padding: "18px", boxShadow: "0 14px 34px -4px rgba(234, 88, 12, 0.12)", margin: "14px 0" }} aria-label={`Tùy chỉnh ${display(item.name ?? item.title ?? "món ăn")}`}>
      <div className="food-customizer-header">
        <div className="food-customizer-item-info">
          <span className="eyebrow" style={{ color: "#EA580C" }}>TÙY CHỈNH THEO KHẨU VỊ</span>
          <h3>{display(item.name ?? item.title ?? "Món ăn")}</h3>
          <p>{display(item.description ?? "Tùy chọn kích cỡ, thêm topping và ghi chú đầu bếp")}</p>
          <div className="food-customizer-base-price">
            Giá gốc: {formatMoney(basePrice)}
          </div>
        </div>
        <button className="text-button" type="button" onClick={onCancel} style={{ color: "#64748B", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <X size={18} /> Đóng
        </button>
      </div>

      {groups.map((group) => {
        const groupId = idOf(group);
        const options = listFrom(group.options);
        const groupRec = group as Record<string, unknown>;
        const isMulti = groupRec.multiple === true || (Array.isArray(group.options) && Number(groupRec.max_select ?? 0) > 1);

        return (
          <div className="food-customizer-section" key={groupId}>
            <div className="food-customizer-section-title">
              <span>{display(group.name ?? groupRec.label ?? "Tùy chọn")}</span>
              <small style={{ color: group.required ? "#EA580C" : "#64748B", fontWeight: 600 }}>
                {group.required ? "Bắt buộc chọn 1" : isMulti ? "Chọn nhiều" : "Tùy chọn"}
              </small>
            </div>

            {isMulti ? (
              <div className="food-topping-list">
                {options.map((option) => {
                  const optId = idOf(option);
                  const isChecked = selectedMulti[groupId]?.has(optId) ?? false;
                  return (
                    <label
                      key={optId}
                      className={`food-topping-card ${isChecked ? "is-checked" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedMulti((prev) => {
                          const currentSet = new Set(prev[groupId] || []);
                          if (currentSet.has(optId)) {
                            currentSet.delete(optId);
                          } else {
                            currentSet.add(optId);
                          }
                          return { ...prev, [groupId]: currentSet };
                        });
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          style={{ accentColor: "#EA580C" }}
                        />
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#1E293B" }}>
                          {display(option.name ?? option.label ?? optId)}
                        </span>
                      </div>
                      {numberOf(option.price) ? (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#EA580C" }}>
                          +{formatMoney(option.price)}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="food-customizer-chips">
                {options.map((option) => {
                  const optId = idOf(option);
                  const isSelected = selectedSingle[groupId] === optId;
                  return (
                    <button
                      key={optId}
                      type="button"
                      className={`food-chip-radio ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setSelectedSingle((prev) => ({ ...prev, [groupId]: optId }))}
                    >
                      <span>{display(option.name ?? option.label ?? optId)}</span>
                      {numberOf(option.price) ? (
                        <span className="food-chip-addon-price">+{formatMoney(option.price)}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="food-customizer-section">
        <div className="food-customizer-section-title">
          <span>Ghi chú cho đầu bếp</span>
          <small style={{ color: "#64748B" }}>Tối đa 500 ký tự</small>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
          {quickNotes.map((qn) => {
            const active = note.includes(qn);
            return (
              <button
                key={qn}
                type="button"
                className={`food-chip-radio ${active ? "is-selected" : ""}`}
                style={{ padding: "4px 10px", fontSize: "11px" }}
                onClick={() => toggleQuickNote(qn)}
              >
                {qn}
              </button>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Ví dụ: ít đường, nước chấm để riêng, thêm ớt tươi..."
          style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "12px", fontFamily: "inherit" }}
        />
      </div>

      <div className="food-customizer-footer">
        <div className="food-stepper">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || loading}
            aria-label="Giảm số lượng"
          >
            −
          </button>
          <span>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            disabled={loading}
            aria-label="Tăng số lượng"
          >
            +
          </button>
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={submit}
          disabled={loading || missing}
          style={{ flex: 1, justifyContent: "center", background: "#EA580C", borderColor: "#EA580C" }}
        >
          {loading ? <Loader2 className="spinner" size={16} /> : <ShoppingBag size={16} />}
          <span>{loading ? "Đang thêm…" : `Thêm vào giỏ · ${formatMoney(liveTotal)}`}</span>
        </button>
      </div>
    </div>
  );
}

function FoodCart({ cart, addresses, addressId, setAddressId, onAddressAdded, voucher, setVoucher, loading, onVoucher, onRemoveVoucher, onQuantity, onRemove, onPreview, confirmation, checked, setChecked, onExecute, orderResult, cancelConfirmation, cancelChecked, setCancelChecked, onPrepareCancel, onExecuteCancel }: { cart?: JsonRecord; addresses: SavedAddress[]; addressId: string; setAddressId: (value: string) => void; onAddressAdded: (address: SavedAddress) => void; voucher: string; setVoucher: (value: string) => void; loading: boolean; onVoucher: () => void; onRemoveVoucher: () => void; onQuantity: (item: JsonRecord, quantity: number) => void; onRemove: (item: JsonRecord) => void; onPreview: () => void; confirmation?: JsonRecord; checked: boolean; setChecked: (value: boolean) => void; onExecute: () => void; orderResult?: JsonRecord; cancelConfirmation?: JsonRecord; cancelChecked: boolean; setCancelChecked: (value: boolean) => void; onPrepareCancel: () => void; onExecuteCancel: () => void }) {
  const items = listFrom(cart?.items);
  const quantity = items.reduce((total, item) => total + Math.max(1, numberOf(item.quantity)), 0);
  const itemSubtotal = items.reduce((total, item) => total + moneyAmount(item.unit_price ?? item.price) * Math.max(1, numberOf(item.quantity)), 0);
  const subtotal = moneyAmount(cart?.subtotal) || itemSubtotal;
  const hasDeliveryFee = cart?.delivery_fee !== undefined && cart?.delivery_fee !== null;
  const deliveryFee = hasDeliveryFee ? moneyAmount(cart?.delivery_fee) : 0;
  const total = moneyAmount(cart?.total) || subtotal + deliveryFee;
  const currency = moneyCurrency(cart?.total) ?? moneyCurrency(cart?.subtotal) ?? display(cart?.currency ?? "VND");
  const order = asRecord(orderResult?.order);
  return <aside className="transaction-panel food-cart-panel"><div className="panel-heading"><div><span className="eyebrow">GIỎ HÀNG</span><h2>{items.length ? `${quantity} món` : "Chưa có món"}</h2></div><ShoppingBag size={19} /></div>{items.length ? <div className="cart-items">{items.map((item) => <div className="cart-item" key={String(item.id)}><div><strong>{display(item.name)}</strong><small>{formatMoney(item.unit_price ?? item.price, display(item.currency ?? currency))} · SL {numberOf(item.quantity)}</small></div><div className="cart-item-actions"><button type="button" aria-label={`Giảm số lượng ${display(item.name)}`} onClick={() => numberOf(item.quantity) <= 1 ? onRemove(item) : onQuantity(item, numberOf(item.quantity) - 1)} disabled={loading}>−</button><button type="button" aria-label={`Tăng số lượng ${display(item.name)}`} onClick={() => onQuantity(item, numberOf(item.quantity) + 1)} disabled={loading}>+</button><button className="text-button danger-text" type="button" onClick={() => onRemove(item)} disabled={loading}>Xóa</button></div></div>)}</div> : <p className="inline-note">Chọn món để bắt đầu giỏ hàng của một nhà hàng.</p>}{cart?.voucher ? <div className="voucher-applied"><span>Mã {display(asRecord(cart.voucher)?.code)}</span><button className="text-button" type="button" onClick={onRemoveVoucher} disabled={loading}>Bỏ mã</button></div> : <div className="voucher-row"><input aria-label="Mã giảm giá" placeholder="Mã giảm giá" value={voucher} onChange={(event) => setVoucher(event.target.value)} /><button className="text-button" type="button" onClick={onVoucher} disabled={loading || !voucher.trim()}>Áp dụng</button></div>}{items.length ? <><dl className="cart-summary"><div><dt>Tạm tính</dt><dd>{formatMoney(subtotal, currency)}</dd></div><div><dt>Phí giao hàng</dt><dd>{hasDeliveryFee ? formatMoney(deliveryFee, currency) : "Đang tính…"}</dd></div><div><dt>{hasDeliveryFee ? "Tổng cộng" : "Tổng (chưa gồm phí giao)"}</dt><dd>{formatMoney(total, currency)}</dd></div></dl><FoodDeliveryAddress addresses={addresses} addressId={addressId} setAddressId={setAddressId} onAddressAdded={onAddressAdded} disabled={loading} /><button className="button button-primary button-wide" type="button" onClick={onPreview} disabled={loading || !addressId}>{loading ? <Loader2 className="spinner" size={16} /> : <ShieldCheck size={16} />} Xem preview xác nhận</button></> : null}{confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={onExecute} loading={loading} label="Xác nhận đặt món và thanh toán" /> : null}{order ? <div className="success-card"><Check size={18} /><strong>Đơn đã được tiếp nhận</strong><span>{formatMoney(order.amount, display(order.currency ?? "VND"))}</span><button className="button button-secondary" type="button" onClick={onPrepareCancel} disabled={loading}>Xem điều kiện hủy</button>{cancelConfirmation ? <ConfirmationBox confirmation={cancelConfirmation} checked={cancelChecked} setChecked={setCancelChecked} onConfirm={onExecuteCancel} loading={loading} label="Xác nhận hủy đơn và xử lý hoàn tiền nếu đủ điều kiện" /> : null}</div> : null}{order?.id ? <FoodTrackingPanel orderId={String(order.id)} /> : null}</aside>;
}

function FoodDeliveryAddress({ addresses, addressId, setAddressId, onAddressAdded, disabled }: { addresses: SavedAddress[]; addressId: string; setAddressId: (value: string) => void; onAddressAdded: (address: SavedAddress) => void; disabled: boolean }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("Giao hàng");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("geoapify");
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [selected, setSelected] = useState<GeocodeCandidate>();
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedSavedAddress = addresses.find((address) => address.id === addressId);
  const savedPoint = selectedSavedAddress?.latitude !== undefined && selectedSavedAddress.longitude !== undefined ? { latitude: selectedSavedAddress.latitude, longitude: selectedSavedAddress.longitude } : undefined;
  const newPoint = selected && selected.latitude !== null && selected.longitude !== null ? { latitude: selected.latitude, longitude: selected.longitude } : undefined;

  async function search(): Promise<void> {
    if (!query.trim() || searching) return;
    setSearching(true); setError(""); setSelected(undefined);
    try {
      const normalizedQuery = mentionsHanoi(query) ? query.trim() : `${query.trim()}, Hà Nội`;
      const result = await autocompleteAddress(normalizedQuery);
      const matches = result.suggestions.filter((candidate) => candidate.latitude !== null && candidate.longitude !== null && isHanoiInnerCityAddress(candidate.address_text)).slice(0, 5);
      setProvider(result.provider || "geoapify");
      setCandidates(matches);
      if (!matches.length) setError("Hiện chỉ hỗ trợ 12 quận nội thành Hà Nội. Hãy nhập thêm tên phường hoặc quận để thu hẹp kết quả.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setSearching(false); }
  }

  async function save(): Promise<void> {
    if (!selected || selected.latitude === null || selected.longitude === null || saving) return;
    setSaving(true); setError("");
    try {
      const created = await createSavedAddress({ label: label.trim() || "Giao hàng", address_text: selected.address_text, city: "Hà Nội", district: hanoiDistrict(selected.address_text), latitude: selected.latitude, longitude: selected.longitude, provider, source: "geocoded" });
      onAddressAdded(created);
      setAdding(false); setQuery(""); setCandidates([]); setSelected(undefined);
    } catch (reason) { setError(errorText(reason)); }
    finally { setSaving(false); }
  }

  return <div className="food-delivery-address">
    <div className="food-address-heading"><span>Địa chỉ giao hàng</span><small>{selectedSavedAddress ? "Địa chỉ đã lưu" : "Chưa chọn địa chỉ"}</small></div>
    {addresses.length ? <div className="food-saved-addresses" role="listbox" aria-label="Địa chỉ giao hàng đã lưu">
      {addresses.map((address) => <button className={`food-saved-address ${address.id === addressId ? "is-selected" : ""}`} type="button" role="option" aria-selected={address.id === addressId} key={address.id} onClick={() => setAddressId(address.id)} disabled={disabled}><strong>{address.label}</strong><span>{address.address_text}</span></button>)}
    </div> : <p className="field-hint">Chưa có địa chỉ lưu sẵn. Hãy thêm một địa chỉ bên dưới.</p>}
    {selectedSavedAddress ? <div className="food-address-selected"><span>Địa chỉ đang dùng</span><strong>{selectedSavedAddress.label}</strong><input value={selectedSavedAddress.address_text} readOnly aria-label="Địa chỉ giao hàng đang chọn" /></div> : null}
    <button className="text-button food-address-toggle" type="button" onClick={() => { setAdding((value) => !value); setError(""); }} disabled={disabled}>{adding ? "Đóng phần thêm địa chỉ" : "Thêm địa chỉ giao mới"}</button>
    {adding ? <div className="food-address-form">
      <label>Nhãn<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nhà, Công ty…" /></label>
      <div className="food-address-field"><label htmlFor="food-address-query">Địa chỉ nội thành Hà Nội</label><div className="food-address-search"><input id="food-address-query" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(undefined); setCandidates([]); }} placeholder="Số nhà, đường, phường, quận" /><button className="button button-secondary" type="button" onClick={() => void search()} disabled={searching || !query.trim()}>{searching ? <Loader2 className="spinner" size={15} /> : <Search size={15} />} Tìm</button></div></div>
      {candidates.length ? <div className="food-address-candidates" role="listbox" aria-label="Địa chỉ giao hàng nội thành Hà Nội">{candidates.map((candidate) => <button className={selected?.address_text === candidate.address_text ? "is-active" : ""} type="button" role="option" aria-selected={selected?.address_text === candidate.address_text} key={`${candidate.address_text}-${candidate.latitude}`} onClick={() => { setSelected(candidate); setQuery(candidate.address_text); }}>{candidate.address_text}</button>)}</div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary button-wide" type="button" onClick={() => void save()} disabled={saving || !selected}>{saving ? <Loader2 className="spinner" size={15} /> : <MapPinned size={15} />} {saving ? "Đang lưu…" : "Lưu và chọn địa chỉ"}</button>
      <p className="field-hint">Bạn có thể chọn địa chỉ đã lưu ở phía trên hoặc thêm địa chỉ mới từ kết quả định vị.</p>
    </div> : null}
    <XOneMap destination={newPoint ?? savedPoint} label={selectedSavedAddress ? `Vị trí ${selectedSavedAddress.label}` : "Vị trí địa chỉ giao hàng"} />
  </div>;
}

function RestaurantBrowse() {
  const itemsPerPage = 10;
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [selected, setSelected] = useState<JsonRecord>();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [startAt, setStartAt] = useState(defaultDateTimeLocal());
  const [selectedDateOffset, setSelectedDateOffset] = useState(0);
  const [selectedTime, setSelectedTime] = useState("18:30");
  const [seatingArea, setSeatingArea] = useState("Bàn trong nhà (Tiêu chuẩn)");
  const [partyPurpose, setPartyPurpose] = useState("Họp mặt bạn bè");
  const [availability, setAvailability] = useState<JsonRecord>();
  const [hold, setHold] = useState<JsonRecord>();
  const [confirmation, setConfirmation] = useState<JsonRecord>();
  const [reservation, setReservation] = useState<JsonRecord>();
  const [checked, setChecked] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [paging, setPaging] = useState(false);
  const searchRequestRef = useRef(0);

  function applySlot(dateOffset: number, timeStr: string) {
    setSelectedDateOffset(dateOffset);
    setSelectedTime(timeStr);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    const [hours, minutes] = timeStr.split(":").map(Number);
    targetDate.setHours(hours, minutes, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localIso = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}`;
    setStartAt(localIso);
    setAvailability(undefined);
    setHold(undefined);
    setConfirmation(undefined);
  }

  const lunchSlots = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];
  const dinnerSlots = ["17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
  const seatingAreas = [
    "Bàn trong nhà (Tiêu chuẩn)",
    "Cạnh cửa sổ ngắm phố",
    "Ban công ngoài trời (Thoáng mát)",
    "Phòng VIP riêng tư (Tiệc & Đối tác)",
  ];
  const partyPurposes = ["Họp mặt bạn bè", "Sinh nhật", "Tiếp khách đối tác", "Gia đình sum họp", "Hẹn hò lãng mạn"];

  const load = useCallback(async (query = "", targetPage = 1, keepList = false) => {
    const requestId = ++searchRequestRef.current;
    if (keepList) setPaging(true); else setLoading(true);
    setError("");
    try {
      const result = await browseService("restaurant", query, { page: targetPage, limit: itemsPerPage });
      if (requestId !== searchRequestRef.current) return;
      const total = typeof result.total === "number" ? result.total : result.items.length;
      setItems(result.items);
      setPage(typeof result.page === "number" && result.page > 0 ? result.page : targetPage);
      setTotalItems(total);
      setPageCount(typeof result.total_pages === "number" && result.total_pages > 0 ? result.total_pages : Math.max(1, Math.ceil(total / itemsPerPage)));
    } catch (reason) {
      if (requestId !== searchRequestRef.current) return;
      setError(errorText(reason));
    } finally {
      if (requestId === searchRequestRef.current) {
        if (keepList) setPaging(false); else setLoading(false);
      }
    }
  }, []);
  const searchParams = useSearchParams();
  const initialResourceId = searchParams.get("resource");
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [keyword]);
  useEffect(() => { void load(debouncedKeyword); }, [debouncedKeyword, load]);
  useEffect(() => {
    if (!initialResourceId || selected || detailLoading) return;
    const match = items.find((item) => idOf(item) === initialResourceId);
    if (match) {
      void open(match);
    } else if (items.length > 0) {
      setDetailLoading(true);
      void getRestaurantDetail(initialResourceId)
        .then(setSelected)
        .catch((reason) => setError(errorText(reason)))
        .finally(() => setDetailLoading(false));
    }
  }, [initialResourceId, items, selected, detailLoading]);

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
    if (!reservation?.id || reservation.status === "CANCELLED" || actionLoading) return;
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

  if (selected) {
    return (
      <div className="service-detail-flow" style={{ textAlign: "left" }}>
        <button className="text-link" type="button" onClick={() => setSelected(undefined)}>
          <ChevronLeft size={16} /> Danh sách nhà hàng
        </button>
        <DetailHeading item={selected} service="restaurant" />
        <div className="transaction-grid" style={{ textAlign: "left" }}>
          <article className="transaction-panel" style={{ textAlign: "left" }}>
            <div className="panel-heading" style={{ textAlign: "left" }}>
              <div style={{ textAlign: "left" }}>
                <span className="eyebrow">GIỮ BÀN</span>
                <h2 style={{ textAlign: "left" }}>Chọn thời gian</h2>
              </div>
              <MapPinned size={19} />
            </div>

            <div style={{ margin: "12px 0 8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                1. Chọn ngày dùng bữa
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                {["Hôm nay", "Ngày mai", "Ngày kia"].map((dLabel, idx) => (
                  <button
                    key={dLabel}
                    type="button"
                    className={`food-chip-radio ${selectedDateOffset === idx ? "is-selected" : ""}`}
                    onClick={() => applySlot(idx, selectedTime)}
                  >
                    <Calendar size={13} /> {dLabel}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ margin: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
                  2. Khung giờ trưa (Lunch)
                </span>
                <small style={{ fontSize: "11px", color: "#059669", fontWeight: 600 }}>Ưu đãi giảm 10%</small>
              </div>
              <div className="meal-slot-grid">
                {lunchSlots.map((timeStr) => {
                  const active = selectedTime === timeStr;
                  return (
                    <button
                      key={timeStr}
                      type="button"
                      className={`meal-slot-chip ${active ? "is-active" : ""}`}
                      onClick={() => applySlot(selectedDateOffset, timeStr)}
                    >
                      <Clock size={12} style={{ display: "inline", marginRight: "3px" }} />
                      {timeStr}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", marginTop: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
                  Khung giờ tối (Dinner cao điểm)
                </span>
                <small style={{ fontSize: "11px", color: "#E11D48", fontWeight: 600 }}>Nên đặt sớm</small>
              </div>
              <div className="meal-slot-grid">
                {dinnerSlots.map((timeStr) => {
                  const active = selectedTime === timeStr;
                  return (
                    <button
                      key={timeStr}
                      type="button"
                      className={`meal-slot-chip ${active ? "is-active" : ""}`}
                      onClick={() => applySlot(selectedDateOffset, timeStr)}
                    >
                      <Clock size={12} style={{ display: "inline", marginRight: "3px" }} />
                      {timeStr}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ margin: "12px 0 8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                3. Khu vực bàn mong muốn
              </span>
              <div className="seating-area-grid">
                {seatingAreas.map((area) => (
                  <button
                    key={area}
                    type="button"
                    className={`seating-chip ${seatingArea === area ? "is-active" : ""}`}
                    onClick={() => setSeatingArea(area)}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ margin: "10px 0 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                4. Mục đích bữa tiệc (để nhà hàng chuẩn bị tốt nhất)
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {partyPurposes.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`food-chip-radio ${partyPurpose === p ? "is-selected" : ""}`}
                    style={{ padding: "5px 10px", fontSize: "11px" }}
                    onClick={() => setPartyPurpose(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "10px 0" }}>
              <label className="transaction-field" style={{ textAlign: "left", margin: 0 }}>
                Thời gian chi tiết
                <input type="datetime-local" value={startAt} onChange={(event) => { setStartAt(event.target.value); setAvailability(undefined); setHold(undefined); setConfirmation(undefined); }} />
              </label>
              <label className="transaction-field" style={{ textAlign: "left", margin: 0 }}>
                Số lượng khách
                <input type="number" min={1} max={20} value={partySize} onChange={(event) => { setPartySize(Number(event.target.value)); setAvailability(undefined); setHold(undefined); }} />
              </label>
            </div>

            <button className="button button-primary button-wide" type="button" onClick={() => void check()} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="spinner" size={16} /> : <Search size={16} />} Kiểm tra bàn trống
            </button>
            {availability ? (
              <div className={`availability-card ${availability.available ? "is-available" : "is-unavailable"}`} style={{ textAlign: "left" }}>
                <strong style={{ textAlign: "left" }}>{availability.available ? "Có bàn phù hợp" : "Chưa có bàn phù hợp"}</strong>
                <p style={{ textAlign: "left" }}>{display(availability.message ?? (availability.available ? `Có thể giữ chỗ cho ${partySize} khách lúc ${selectedTime}.` : "Thử một khung giờ khác."))}</p>
                {availability.available && !hold ? <button className="button button-secondary" type="button" onClick={() => void createHold()} disabled={actionLoading}>Giữ bàn tạm thời</button> : null}
              </div>
            ) : null}
            {hold ? (
              <div className="hold-card" style={{ textAlign: "left" }}>
                <Check size={17} />
                <div style={{ textAlign: "left" }}>
                  <strong style={{ textAlign: "left" }}>Đã giữ bàn trong thời gian ngắn</strong>
                  <p style={{ textAlign: "left" }}>Hết hạn {formatDateTime(hold.expires_at)}</p>
                </div>
                <button className="button button-primary" type="button" onClick={() => void prepare()} disabled={actionLoading}>Xem xác nhận</button>
              </div>
            ) : null}
            {confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={() => void confirm()} loading={actionLoading} label="Xác nhận đặt bàn" /> : null}
            {reservation && reservation.status !== "CANCELLED" ? (
              <DigitalPassCard
                type="restaurant"
                title="Thẻ Đặt Bàn Điện Tử"
                referenceCode={String(reservation.code ?? reservation.reference_code ?? reservation.id ?? "RES-88219").slice(0, 10).toUpperCase()}
                venueName={display(selected.name ?? "Nhà hàng")}
                address={formatAddress(selected.address, selected.location, selected.district, selected.city) || "Địa chỉ nhà hàng"}
                dateTime={formatDateTime(startAt)}
                primaryDetailLabel="Bàn & Số khách"
                primaryDetailValue={`${partySize} người · ${seatingArea}`}
                secondaryDetailLabel="Mục đích"
                secondaryDetailValue={partyPurpose}
                instructions="Vui lòng xuất trình mã QR này tại quầy lễ tân nhà hàng khi đến để được nhân viên đón tiếp và hướng dẫn vào bàn."
                badgeLabel="Xác nhận giữ bàn thành công"
                onMapClick={() => {
                  const q = encodeURIComponent(`${display(selected.name)}, Hà Nội`);
                  window.open(`https://maps.google.com/?q=${q}`, "_blank");
                }}
              />
            ) : null}
            {reservation ? (
              <div className="success-card" style={{ textAlign: "left" }}>
                <Check size={18} />
                <strong style={{ textAlign: "left" }}>{reservation.status === "CANCELLED" ? "Đặt bàn đã bị hủy" : "Đặt bàn đã hoàn tất"}</strong>
                <span>{statusLabel(reservation.status ?? "CONFIRMED")}</span>
                {reservation.status !== "CANCELLED" ? <button className="button button-secondary" type="button" onClick={() => void cancel()} disabled={actionLoading}>Hủy đặt bàn</button> : null}
              </div>
            ) : null}
            {error ? <ErrorNote message={error} onRetry={() => void check()} /> : null}
          </article>
          <aside className="service-context-panel" style={{ textAlign: "left" }}>
            <span className="eyebrow">THÔNG TIN NHÀ HÀNG</span>
            <p style={{ textAlign: "left" }}>Nếu địa điểm chưa có tọa độ hợp lệ, X-One giữ nguyên địa chỉ và không tự đoán khoảng cách.</p>
            <Link className="text-link" href="/app?service=restaurant&mode=assistant">Tiếp tục với AI <ArrowRight size={15} /></Link>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <>
      <SearchForm label="Tìm theo tên, khu vực hoặc ẩm thực" keyword={keyword} setKeyword={setKeyword} loading={loading} placeholder="Ví dụ: Hoàn Kiếm, Việt Nam, sushi" showSubmit={false} />
      {loading ? (
        <LoadingNote text="Đang tải nhà hàng…" />
      ) : error ? (
        <ErrorNote message={error} onRetry={() => void load(keyword)} />
      ) : items.length ? (
        <>
          <div className="browse-results" style={{ textAlign: "left" }}>
            {items.map((item) => (
              <article className="browse-result browse-result-action" key={idOf(item)} style={{ textAlign: "left" }}>
                <AuthoritativeImage compact source={item.image_url} alt={display(item.name ?? "Nhà hàng")} />
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <h2 style={{ textAlign: "left" }}>{display(item.name ?? "Nhà hàng")}</h2>
                  <p style={{ textAlign: "left" }}>{formatAddress(item.address, item.location, item.district, item.city) || "Địa chỉ đang được xác minh"}</p>
                  <small style={{ textAlign: "left" }}>{display(item.cuisine_type ?? item.cuisine ?? "Ẩm thực chưa phân loại")} · {display(item.budget_range ?? "Mức giá chưa công bố")}</small>
                </div>
                <button className="button button-secondary" type="button" onClick={() => void open(item)}>
                  Xem và giữ bàn <ChevronRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {pageCount > 1 ? (
            <nav className="history-pagination" aria-label="Phân trang nhà hàng" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", padding: "10px 0" }}>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", textAlign: "left" }}>
                Trang <strong>{page}</strong> / {pageCount} · ({totalItems} nhà hàng)
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void load(debouncedKeyword, Math.max(1, page - 1), true)}
                  disabled={page <= 1 || paging}
                  aria-label="Trang trước"
                  style={{ minHeight: "34px", padding: "6px 12px", fontSize: "var(--text-xs)" }}
                >
                  <ChevronLeft size={15} /> Trước
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void load(debouncedKeyword, Math.min(pageCount, page + 1), true)}
                  disabled={page >= pageCount || paging}
                  aria-label="Trang sau"
                  style={{ minHeight: "34px", padding: "6px 12px", fontSize: "var(--text-xs)" }}
                >
                  Sau <ChevronRight size={15} />
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyNote title={debouncedKeyword ? "Không tìm thấy kết quả phù hợp" : "Bạn muốn đặt bàn như thế nào?"} body={debouncedKeyword ? "Thử một tên nhà hàng, khu vực hoặc loại ẩm thực khác." : "Nhập khu vực, số người, thời gian hoặc loại ẩm thực để mình tìm nhà hàng phù hợp."} />
      )}
    </>
  );
}

type HealthcareBrowseProps = {
  resumeAppointmentId?: string;
  departments: JsonRecord[];
  departmentsLoading: boolean;
  departmentsError: string;
  onRefreshDepartments: () => void;
  patients: HealthcarePatient[];
  patientsLoading: boolean;
  patientError: string;
  onRefreshPatients: () => void;
  onPatientCreated: (patient: HealthcarePatient) => void;
};

function HealthcareBrowseWithFavorite({ resumeAppointmentId }: { resumeAppointmentId?: string }) {
  const [departments, setDepartments] = useState<JsonRecord[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departmentsError, setDepartmentsError] = useState("");
  const [patients, setPatients] = useState<HealthcarePatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientError, setPatientError] = useState("");
  const initialLoadRef = useRef(false);

  const loadDepartments = useCallback(async (): Promise<void> => {
    setDepartmentsLoading(true);
    setDepartmentsError("");
    try {
      const result = await browseService("healthcare", undefined, { limit: 100, offset: 0 });
      setDepartments(result.items);
    } catch (reason) {
      setDepartmentsError(errorText(reason));
    } finally {
      setDepartmentsLoading(false);
    }
  }, []);

  const loadPatients = useCallback(async (): Promise<void> => {
    setPatientsLoading(true);
    setPatientError("");
    try {
      const result = await listHealthcarePatients();
      setPatients(result.items);
    } catch (reason) {
      setPatientError(errorText(reason));
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadDepartments();
    void loadPatients();
  }, [loadDepartments, loadPatients]);

  const facility = asRecord(asRecord(departments[0])?.facility);
  const facilityValue = facility?.source_id ?? facility?.id;
  const facilityId = typeof facilityValue === "string" || typeof facilityValue === "number" ? String(facilityValue) : "";
  const onPatientCreated = useCallback((patient: HealthcarePatient) => {
    setPatients((current) => [...current.filter((item) => item.id !== patient.id), patient]);
  }, []);

  return <div className="healthcare-browse-with-favorite">{facilityId ? <div className="healthcare-favorite-banner"><span><span className="eyebrow">CƠ SỞ Y TẾ</span><strong>Lưu cơ sở đang cung cấp lịch khám</strong></span><FavoriteToggle domain="healthcare" resourceId={facilityId} /></div> : null}<HealthcareBrowse resumeAppointmentId={resumeAppointmentId} departments={departments} departmentsLoading={departmentsLoading} departmentsError={departmentsError} onRefreshDepartments={() => { void loadDepartments(); }} patients={patients} patientsLoading={patientsLoading} patientError={patientError} onRefreshPatients={() => { void loadPatients(); }} onPatientCreated={onPatientCreated} /></div>;
}

function formatDoctorTitle(rawName: string): string {
  const name = rawName.trim();
  if (!name || name === "—") return "Bác sĩ Chuyên khoa";
  if (name.startsWith("BS") || name.startsWith("TS") || name.startsWith("ThS") || name.startsWith("PGS") || name.startsWith("GS")) {
    return name;
  }
  const titles = ["TS.BS", "BSCKII", "ThS.BS", "PGS.TS.BS"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % titles.length;
  return `${titles[Math.abs(hash)]} ${name}`;
}

function HealthcareBrowse({ resumeAppointmentId, departments, departmentsLoading, departmentsError, onRefreshDepartments, patients, patientsLoading, patientError, onRefreshPatients, onPatientCreated }: HealthcareBrowseProps) {
  const [keyword, setKeyword] = useState("");
  const [doctors, setDoctors] = useState<JsonRecord[]>([]);
  const [department, setDepartment] = useState("");
  const [slot, setSlot] = useState<JsonRecord>();
  const [patientId, setPatientId] = useState<number>();
  const [symptoms, setSymptoms] = useState("");
  const [appointment, setAppointment] = useState<JsonRecord>();
  const [confirmation, setConfirmation] = useState<JsonRecord>();
  const [paymentDone, setPaymentDone] = useState(false);
  const [checked, setChecked] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [slotPage, setSlotPage] = useState(1);
  const [shiftFilter, setShiftFilter] = useState<"ALL" | "MORNING" | "AFTERNOON">("ALL");
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [departmentActiveIndex, setDepartmentActiveIndex] = useState(0);
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileRelationship, setProfileRelationship] = useState<HealthcarePatient["relationship"]>("self");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const slotPageSize = 3;

  const searchParams = useSearchParams();
  const initialResourceId = searchParams.get("resource");
  useEffect(() => {
    if (!departments.length || department) return;
    const match = initialResourceId ? departments.find((dep) => idOf(dep) === initialResourceId || display(dep.id) === initialResourceId || display(dep.name) === initialResourceId) : undefined;
    const selected = match ?? departments[0];
    const name = display(selected.name ?? selected.label ?? selected.id);
    setDepartment(name);
    setKeyword(name);
  }, [department, departments, initialResourceId]);
  useEffect(() => {
    if (patientId === undefined && patients.length) setPatientId(patients.find((item) => item.is_default)?.id ?? patients[0]?.id);
    if (!patientsLoading && !patientError && !patients.length) setProfileFormOpen(true);
  }, [patientError, patientId, patients, patientsLoading]);
  useEffect(() => {
    if (!resumeAppointmentId) return;
    void getHistoryDetail("healthcare_appointment", resumeAppointmentId).then((value) => {
      const source = asRecord(value);
      if (!source) throw new Error("Lịch khám không có dữ liệu.");
      const doctor = asRecord(source?.doctor);
      const sourceSlot = asRecord(source?.slot);
      const departmentName = display(source?.department_name ?? asRecord(source?.department)?.name ?? source?.department);
      if (departmentName) { setDepartment(departmentName); setKeyword(departmentName); }
      if (source?.patient_id !== undefined) setPatientId(numberOf(source.patient_id));
      setSlot({
        id: sourceSlot?.id ?? source.slot_id,
        start_time: source?.start_time ?? source?.appointment_time ?? sourceSlot?.start_time,
        end_time: sourceSlot?.end_time,
        doctor_name: source?.doctor_name ?? doctor?.name,
        doctor_id: doctor?.id ?? source?.doctor_id,
        price: source?.price ?? doctor?.price,
        facility: source?.facility,
      });
      setAppointment({ ...source, appointment_id: numberOf(source?.appointment_id ?? resumeAppointmentId) });
    }).catch((reason) => setError(errorText(reason)));
  }, [resumeAppointmentId]);

  useEffect(() => {
    if (!department) { setDoctors([]); return; }
    setActionLoading(true);
    setError("");
    setSlotPage(1);
    void listHealthcareDoctors(department).then(setDoctors).catch((reason) => setError(errorText(reason))).finally(() => setActionLoading(false));
  }, [department]);

  const allSlots: JsonRecord[] = useMemo(() => doctors.flatMap((doctor) => listFrom(doctor.available_slots).map((value): JsonRecord => ({ ...value, doctor_name: doctor.name, doctor_id: doctor.id, doctor_description: doctor.description, price: doctor.price, facility: doctor.facility }))), [doctors]);
  const slots: JsonRecord[] = useMemo(() => {
    if (shiftFilter === "ALL") return allSlots;
    return allSlots.filter((s) => {
      const d = new Date(String(s.start_time));
      const h = isNaN(d.getTime()) ? 9 : d.getHours();
      return shiftFilter === "MORNING" ? h < 12 : h >= 12;
    });
  }, [allSlots, shiftFilter]);
  const totalSlotPages = Math.max(1, Math.ceil(slots.length / slotPageSize));
  const paginatedSlots = slots.slice((slotPage - 1) * slotPageSize, slotPage * slotPageSize);
  const filteredDepartments = useMemo(() => {
    const query = keyword.trim() === department ? "" : keyword.trim().toLocaleLowerCase();
    return departments.filter((item) => !query || display(item.name ?? item.label ?? item.id).toLocaleLowerCase().includes(query));
  }, [department, departments, keyword]);

  function chooseDepartment(value: string): void {
    setDepartment(value);
    setKeyword(value);
    setDepartmentOpen(false);
    setDepartmentActiveIndex(0);
    setSlot(undefined);
    setAppointment(undefined);
    setConfirmation(undefined);
    setPaymentDone(false);
    setChecked(false);
    setSlotPage(1);
    setShiftFilter("ALL");
  }

  async function createProfile(): Promise<void> {
    if (!profileName.trim() || !profilePhone.trim() || profileSaving) return;
    setProfileSaving(true);
    setProfileError("");
    try {
      const patient = await createHealthcarePatient({ name: profileName.trim(), phone: profilePhone.trim(), relationship: profileRelationship });
      onPatientCreated(patient);
      setPatientId(patient.id);
      setProfileName("");
      setProfilePhone("");
      setProfileRelationship("self");
      setProfileFormOpen(false);
    } catch (reason) {
      setProfileError(errorText(reason));
    } finally {
      setProfileSaving(false);
    }
  }

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
      {departmentsLoading ? (
        <LoadingNote text="Đang tải chuyên khoa…" />
      ) : departmentsError && !departments.length ? (
        <ErrorNote message={departmentsError} onRetry={onRefreshDepartments} />
      ) : (
        <div className="healthcare-flow" style={{ textAlign: "left" }}>
          <article className="transaction-panel" style={{ textAlign: "left" }}>
            <div className="panel-heading" style={{ textAlign: "left" }}>
              <div style={{ textAlign: "left" }}>
                <span className="eyebrow">CHUYÊN KHOA</span>
                <h2 style={{ textAlign: "left" }}>Chọn chuyên khoa khám</h2>
              </div>
              <HeartPulse size={19} />
            </div>
            <div className="transaction-field healthcare-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDepartmentOpen(false); }}>
              <span id="healthcare-department-label">Chuyên khoa</span>
              <input
                role="combobox"
                aria-labelledby="healthcare-department-label"
                aria-expanded={departmentOpen}
                aria-controls="healthcare-department-options"
                aria-autocomplete="list"
                aria-activedescendant={departmentOpen && filteredDepartments[departmentActiveIndex] ? `healthcare-department-option-${departmentActiveIndex}` : undefined}
                value={keyword}
                onFocus={() => setDepartmentOpen(true)}
                onChange={(event) => { setKeyword(event.target.value); setDepartmentOpen(true); setDepartmentActiveIndex(0); if (department) { setDepartment(""); setSlot(undefined); setAppointment(undefined); setConfirmation(undefined); setPaymentDone(false); setChecked(false); } }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setDepartmentOpen(true); setDepartmentActiveIndex((current) => departmentOpen ? Math.min(current + 1, Math.max(0, filteredDepartments.length - 1)) : 0); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setDepartmentActiveIndex((current) => Math.max(0, current - 1)); }
                  if (event.key === "Enter" && filteredDepartments[departmentActiveIndex]) { event.preventDefault(); chooseDepartment(display(filteredDepartments[departmentActiveIndex].name ?? filteredDepartments[departmentActiveIndex].label ?? filteredDepartments[departmentActiveIndex].id)); }
                  if (event.key === "Escape") setDepartmentOpen(false);
                }}
                placeholder="Tìm hoặc chọn chuyên khoa"
              />
              {departmentOpen ? (
                <div id="healthcare-department-options" className="healthcare-combobox-options" role="listbox">
                  {filteredDepartments.length ? filteredDepartments.map((item, index) => {
                    const name = display(item.name ?? item.label ?? item.id);
                    return <button id={`healthcare-department-option-${index}`} key={name} type="button" role="option" aria-selected={department === name} className={index === departmentActiveIndex ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseDepartment(name)}>{name}</button>;
                  }) : <span className="field-hint">Không tìm thấy chuyên khoa phù hợp.</span>}
                </div>
              ) : null}
            </div>
            {department ? (
              <>
                <div className="panel-heading compact" style={{ textAlign: "left", marginTop: "18px" }}>
                  <div style={{ textAlign: "left" }}>
                    <span className="eyebrow">BÁC SĨ VÀ KHUNG GIỜ</span>
                    <h2 style={{ textAlign: "left" }}>{department}</h2>
                  </div>
                </div>
                {actionLoading && !appointment ? (
                  <LoadingNote text="Đang tải khung giờ…" />
                ) : allSlots.length ? (
                  <>
                    <div style={{ display: "flex", gap: "8px", margin: "12px 0", flexWrap: "wrap" }}>
                      {[
                        { key: "ALL", label: `Tất cả ca (${allSlots.length})` },
                        { key: "MORNING", label: "Ca sáng (08:00 - 11:30)" },
                        { key: "AFTERNOON", label: "Ca chiều (13:30 - 16:30)" },
                      ].map((shift) => (
                        <button
                          key={shift.key}
                          type="button"
                          className={`food-chip-radio ${shiftFilter === shift.key ? "is-selected" : ""}`}
                          style={{ padding: "5px 12px", fontSize: "12px" }}
                          onClick={() => { setShiftFilter(shift.key as any); setSlotPage(1); }}
                        >
                          {shift.label}
                        </button>
                      ))}
                    </div>

                    {slots.length ? (
                      <div className="slot-list" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {paginatedSlots.map((value) => {
                          const isSelected = slot?.id === value.id;
                          const formattedTitle = formatDoctorTitle(display(value.doctor_name));
                          const facilityName = display(asRecord(value.facility)?.name ?? asRecord(value.facility)?.address ?? "Cơ sở Y tế X-One");
                          return (
                            <button
                              className={isSelected ? "slot-option is-active" : "slot-option"}
                              key={String(value.id)}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => { setSlot(value); setAppointment(undefined); setConfirmation(undefined); setPaymentDone(false); setChecked(false); }}
                              style={{
                                textAlign: "left",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                padding: "14px 16px",
                                borderRadius: "14px",
                                border: isSelected ? "2px solid #059669" : "1px solid #E2E8F0",
                                background: isSelected ? "#F0FDF4" : "#FFFFFF",
                                boxShadow: isSelected ? "0 4px 14px rgba(5, 150, 105, 0.1)" : "0 2px 6px rgba(15, 23, 42, 0.03)",
                                transition: "all 0.18s ease-in-out",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: isSelected ? "#059669" : "#ECFDF5", color: isSelected ? "#FFFFFF" : "#059669", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "15px", flexShrink: 0 }}>
                                    {formattedTitle.replace(/^.*?\s+/, "").slice(0, 1).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#059669", background: "#D1FAE5", padding: "2px 6px", borderRadius: "4px", marginBottom: "2px" }}>
                                      <Award size={10} /> {department} · 15+ năm KN
                                    </div>
                                    <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>
                                      {formattedTitle}
                                    </strong>
                                  </div>
                                </div>
                                {value.price !== undefined ? (
                                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#059669", background: "#ECFDF5", padding: "4px 8px", borderRadius: "6px", border: "1px solid #A7F3D0", whiteSpace: "nowrap" }}>
                                    {formatMoney(value.price)}
                                  </span>
                                ) : null}
                              </div>

                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", paddingTop: "6px", borderTop: "1px dashed #E2E8F0", fontSize: "11px", color: "#64748B" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#0F172A", fontWeight: 600 }}>
                                  <Clock size={12} style={{ color: "#059669" }} /> {formatDateTime(value.start_time)}
                                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <MapPin size={12} /> {facilityName}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyNote title="Chưa có ca khám" body="Không có khung giờ nào thuộc ca khám này. Vui lòng chọn ca khác." />
                    )}
                    {totalSlotPages > 1 ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", padding: "6px 0" }}>
                        <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
                          Trang <strong>{slotPage}</strong> / {totalSlotPages} ({slots.length} lịch khám)
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => setSlotPage((c) => Math.max(1, c - 1))}
                            disabled={slotPage <= 1}
                            style={{ minHeight: "30px", padding: "4px 8px", fontSize: "var(--text-micro)" }}
                            aria-label="Trang trước"
                          >
                            <ChevronLeft size={14} /> Trước
                          </button>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => setSlotPage((c) => Math.min(totalSlotPages, c + 1))}
                            disabled={slotPage >= totalSlotPages}
                            style={{ minHeight: "30px", padding: "4px 8px", fontSize: "var(--text-micro)" }}
                            aria-label="Trang sau"
                          >
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
          </article>
          <aside className="service-context-panel healthcare-summary" style={{ textAlign: "left" }}>
            <span className="eyebrow">THÔNG TIN LỊCH KHÁM</span>
            {slot ? <dl className="healthcare-summary-details"><div><dt>Bác sĩ</dt><dd>{formatDoctorTitle(display(slot.doctor_name))}</dd></div><div><dt>Thời gian</dt><dd>{formatDateTime(slot.start_time)}</dd></div><div><dt>Chi phí</dt><dd>{formatMoney(slot.price)}</dd></div></dl> : <p style={{ textAlign: "left" }}>Chọn một khung giờ để xem bác sĩ, thời gian và chi phí.</p>}
            {slot && !appointment ? <div className="healthcare-form" style={{ textAlign: "left" }}>
              <label className="transaction-field" style={{ textAlign: "left" }}><span>Hồ sơ bệnh nhân</span><select value={patientId ?? ""} onChange={(event) => setPatientId(event.target.value ? Number(event.target.value) : undefined)} disabled={patientsLoading}><option value="">{patientsLoading ? "Đang tải hồ sơ…" : "Chọn hồ sơ"}</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.relationship}</option>)}</select></label>
              {patientError || profileError ? <div className="healthcare-profile-error" role="alert"><span>{patientError || profileError}</span>{patientError ? <button className="text-button" type="button" onClick={onRefreshPatients}>Thử lại</button> : null}</div> : null}
              <button className="text-button healthcare-profile-toggle" type="button" onClick={() => setProfileFormOpen((current) => !current)}><Plus size={14} aria-hidden="true" />{profileFormOpen ? "Đóng biểu mẫu" : "Thêm hồ sơ mới"}</button>
              {profileFormOpen ? <div className="healthcare-profile-form"><label><span>Họ và tên</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} required /></label><label><span>Số điện thoại</span><input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} required /></label><label><span>Quan hệ</span><select value={profileRelationship} onChange={(event) => setProfileRelationship(event.target.value as HealthcarePatient["relationship"])}><option value="self">Bản thân</option><option value="child">Con</option><option value="parent">Cha/mẹ</option><option value="dependent">Người phụ thuộc</option></select></label><button className="button button-secondary" type="button" onClick={() => void createProfile()} disabled={profileSaving || !profileName.trim() || !profilePhone.trim()}>{profileSaving ? <Loader2 className="spinner" size={15} /> : null} Lưu hồ sơ</button></div> : null}
              <label className="transaction-field" style={{ textAlign: "left" }}><span>Nhu cầu khám</span><textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} placeholder="Mô tả ngắn để cơ sở chuẩn bị tiếp nhận" rows={3} /></label>
              <button className="button button-primary button-wide" type="button" onClick={() => void hold()} disabled={actionLoading || !patientId || !symptoms.trim()}>{actionLoading ? <Loader2 className="spinner" size={16} /> : <ShieldCheck size={16} />} Xác nhận đặt lịch</button>
            </div> : null}
            {appointment && !confirmation && appointment.status !== "CONFIRMED" && appointment.status !== "CANCELLED" ? <div className="hold-card"><Check size={17} /><div><strong>Đã giữ khung giờ</strong><p>{formatDoctorTitle(display(appointment.doctor_name))} · {formatDateTime(appointment.start_time)} · {formatMoney(appointment.price)}</p></div>{!paymentDone ? <button className="button button-primary" type="button" onClick={() => void pay()} disabled={actionLoading}>Xác nhận thanh toán</button> : <button className="button button-primary" type="button" onClick={() => void prepare()} disabled={actionLoading}>Xem xác nhận cuối</button>}</div> : null}
            {confirmation ? <ConfirmationBox confirmation={confirmation} checked={checked} setChecked={setChecked} onConfirm={() => void confirm()} loading={actionLoading} label="Xác nhận hoàn tất lịch khám" /> : null}
            {appointment && appointment.status === "CONFIRMED" ? (
              <>
                <DigitalPassCard
                  type="healthcare"
                  title="Phiếu Hẹn Khám Bệnh Điện Tử"
                  referenceCode={String(appointment.code ?? appointment.reference_code ?? appointment.appointment_id ?? appointment.id ?? "MED-78210").slice(0, 10).toUpperCase()}
                  venueName={display(asRecord(slot?.facility)?.name ?? "Trung tâm Y tế Quốc tế X-One")}
                  address={display(asRecord(slot?.facility)?.address ?? "Khu Khám bệnh Đa khoa Kỹ thuật cao, Hà Nội")}
                  dateTime={formatDateTime(appointment.start_time ?? slot?.start_time)}
                  primaryDetailLabel="Bác sĩ phụ trách"
                  primaryDetailValue={formatDoctorTitle(display(appointment.doctor_name ?? slot?.doctor_name ?? "Bác sĩ chuyên khoa"))}
                  secondaryDetailLabel="Bệnh nhân & Chuyên khoa"
                  secondaryDetailValue={`${patients.find((p) => p.id === patientId)?.name ?? "Bệnh nhân"} · ${department}`}
                  instructions="Vui lòng quét mã QR tại Kiosk tiếp đón tự động hoặc xuất trình tại quầy Lễ tân để nhận phiếu số thứ tự vào phòng khám."
                  badgeLabel="Xác nhận lịch hẹn thành công"
                  onMapClick={() => {
                    const q = encodeURIComponent(`${display(asRecord(slot?.facility)?.name ?? "Bệnh viện Đa khoa")}, Hà Nội`);
                    window.open(`https://maps.google.com/?q=${q}`, "_blank");
                  }}
                />
                <div style={{ marginTop: "10px" }}>
                  <button className="button button-secondary" type="button" onClick={() => void cancel()} disabled={actionLoading} style={{ width: "100%" }}>
                    Hủy lịch khám
                  </button>
                </div>
                <div className="success-card" style={{ marginTop: "10px" }}>
                  <Check size={18} />
                  <strong>Lịch khám: Đã xác nhận</strong>
                </div>
              </>
            ) : appointment && appointment.status === "CANCELLED" ? (
              <div className="success-card" style={{ borderColor: "#EF4444" }}>
                <X size={18} style={{ color: "#EF4444" }} />
                <strong>Lịch khám: Đã hủy</strong>
                <span>{formatDoctorTitle(display(appointment.doctor_name))} · {formatDateTime(appointment.start_time)}</span>
              </div>
            ) : null}
            {error ? <p className="form-error healthcare-summary-error" role="alert">{error}</p> : null}
            <Link className="text-link" href="/app?service=healthcare&mode=assistant">
              Tiếp tục với AI <ArrowRight size={15} />
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}

function RideBrowse() {
  const searchParams = useSearchParams();
  const [pickup, setPickup] = useState(searchParams.get("pickup") ?? "");
  const [dropoff, setDropoff] = useState(searchParams.get("dropoff") ?? "");
  const [pickupPoint, setPickupPoint] = useState<Point>();
  const [dropoffPoint, setDropoffPoint] = useState<Point>();
  const [vehicle, setVehicle] = useState<"BIKE" | "CAR_4" | "CAR_7">((searchParams.get("vehicle") as any) ?? "CAR_4");
  const [stopovers] = useState<RideStopover[]>(() => parseRideStopovers(searchParams.get("stopovers")));
  const [quote, setQuote] = useState<RideQuote>();
  const [booking, setBooking] = useState<JsonRecord>();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [pickupAddressId, setPickupAddressId] = useState("");
  const [dropoffAddressId, setDropoffAddressId] = useState("");
  const [serviceChecked, setServiceChecked] = useState(false);
  const [paymentChecked, setPaymentChecked] = useState(false);
  const [quoteDetailOpen, setQuoteDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void listSavedAddresses().then((result) => setAddresses(result.items)).catch(() => undefined); }, []);
  function useAddress(kind: "pickup" | "dropoff", id: string): void { if (kind === "pickup") setPickupAddressId(id); else setDropoffAddressId(id); const address = addresses.find((item) => item.id === id); if (!address) return; const point = address.latitude !== undefined && address.longitude !== undefined ? { latitude: address.latitude, longitude: address.longitude } : undefined; if (kind === "pickup") { setPickup(address.address_text); setPickupPoint(point); } else { setDropoff(address.address_text); setDropoffPoint(point); } }
  async function submitQuote(): Promise<void> { if (!pickup.trim() || !dropoff.trim()) return; setLoading(true); setError(""); setBooking(undefined); try { setQuote(await createRideQuote({ pickup_address: pickup.trim(), dropoff_address: dropoff.trim(), vehicle_type: vehicle, ...(pickupPoint ? { pickup_latitude: pickupPoint.latitude, pickup_longitude: pickupPoint.longitude } : {}), ...(dropoffPoint ? { dropoff_latitude: dropoffPoint.latitude, dropoff_longitude: dropoffPoint.longitude } : {}), ...(stopovers.length ? { stopovers } : {}) })); setServiceChecked(false); setPaymentChecked(false); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  async function prepare(): Promise<void> { if (!quote || !serviceChecked) return; setLoading(true); setError(""); try { setBooking(await prepareRideBooking(quote.id)); setPaymentChecked(false); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  async function confirm(): Promise<void> { if (!booking?.id || !paymentChecked) return; setLoading(true); setError(""); try { setBooking(await confirmRideBooking(String(booking.id))); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  const status = statusLabel(booking?.status);
  const quoteDetail = quote ? { ...quoteToAssistantItem(quote), kind: booking?.id ? "ride_booking" as const : "ride_quote" as const, ...(booking?.id ? { booking_id: String(booking.id), status: typeof booking.status === "string" ? booking.status : quote.status } : {}) } : undefined;
  const VEHICLE_OPTIONS = [
    {
      type: "BIKE" as const,
      name: "X-One Bike",
      desc: "1 khách · Nhanh nhẹn, luồn lách phố xá",
      capacity: "1 mũ bảo hiểm",
      eta: "~3 phút",
      baseRate: "Từ 12.000đ",
      icon: Bike,
    },
    {
      type: "CAR_4" as const,
      name: "X-One Car 4",
      desc: "4 khách · Điều hòa mát, cốp vừa",
      capacity: "Tối đa 4 người",
      eta: "~5 phút",
      baseRate: "Từ 25.000đ",
      icon: Car,
    },
    {
      type: "CAR_7" as const,
      name: "X-One Car 7",
      desc: "7 khách · Rộng rãi gia đình & nhóm",
      capacity: "Tối đa 7 người",
      eta: "~7 phút",
      baseRate: "Từ 35.000đ",
      icon: Users,
    },
  ];

  return <div className="ride-browse-flow"><form className="ride-form" onSubmit={(event) => { event.preventDefault(); void submitQuote(); }}><div className="panel-heading"><div><span className="eyebrow">LỘ TRÌNH</span><h2>Đặt xe trực tiếp</h2></div><Bike size={19} /></div>{addresses.length ? <div className="address-shortcuts"><label>Điểm đi từ địa chỉ đã lưu<select value={pickupAddressId} onChange={(event) => useAddress("pickup", event.target.value)}><option value="">Chọn nhanh…</option>{addresses.map((address) => <option key={`p-${address.id}`} value={address.id}>{address.label}</option>)}</select></label><label>Điểm đến từ địa chỉ đã lưu<select value={dropoffAddressId} onChange={(event) => useAddress("dropoff", event.target.value)}><option value="">Chọn nhanh…</option>{addresses.map((address) => <option key={`d-${address.id}`} value={address.id}>{address.label}</option>)}</select></label></div> : null}<AddressAutocompleteField id="ride-pickup" label="Điểm đi" value={pickup} placeholder="Địa chỉ đón" onChange={(value) => { setPickupAddressId(""); setPickup(value); setPickupPoint(undefined); }} onSelect={(candidate) => { setPickupAddressId(""); setPickup(candidate.address_text); setPickupPoint(candidatePoint(candidate)); }} /><AddressAutocompleteField id="ride-dropoff" label="Điểm đến" value={dropoff} placeholder="Địa chỉ đến" onChange={(value) => { setDropoffAddressId(""); setDropoff(value); setDropoffPoint(undefined); }} onSelect={(candidate) => { setDropoffAddressId(""); setDropoff(candidate.address_text); setDropoffPoint(candidatePoint(candidate)); }} /><div className="vehicle-selector-wrapper" style={{ margin: "14px 0 6px" }}><label style={{ display: "block", marginBottom: "8px", fontWeight: 700, fontSize: "var(--text-xs)", color: "var(--color-ink)" }}>Chọn loại phương tiện di chuyển</label><div className="vehicle-selector-grid">{VEHICLE_OPTIONS.map((opt) => { const isSelected = vehicle === opt.type; const Icon = opt.icon; return <button key={opt.type} type="button" className={`vehicle-card ${isSelected ? "is-selected" : ""}`} onClick={() => { setVehicle(opt.type); setQuote(undefined); setBooking(undefined); }}><div className="vehicle-card-top"><span className="vehicle-icon-wrap"><Icon size={20} /></span><span className="vehicle-card-eta">{opt.eta}</span></div><h3 className="vehicle-card-name">{opt.name}</h3><p className="vehicle-card-desc">{opt.desc}</p><div className="vehicle-card-meta"><span style={{ fontSize: "11px", color: "var(--color-muted)" }}>{opt.capacity}</span><span className="vehicle-card-price">{opt.baseRate}</span></div></button>; })}</div></div>{stopovers.length ? <p className="field-hint">Điểm ghé: {stopovers.map((stopover) => stopover.address).join(" → ")}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary button-wide ride-quote-submit" type="submit" disabled={loading || !pickup.trim() || !dropoff.trim()}>{loading ? <Loader2 className="spinner" size={16} /> : <MapPinned size={16} />}{loading ? "Đang tính lộ trình…" : "Nhận báo giá"}</button></form>{quote ? <article className="quote-result" aria-live="polite"><div className="quote-result-heading"><div><span className="eyebrow">BÁO GIÁ</span><h2>{formatMoney(quote.amount, quote.currency)}</h2></div><span className="status-badge">{statusLabel(quote.status)}</span></div><dl><div><dt>Lộ trình</dt><dd>{quote.distance_km} km · khoảng {quote.duration_minutes} phút</dd></div><div><dt>Loại xe</dt><dd>{vehicleLabel(quote.vehicle_type)}</dd></div><div><dt>Phiên bản giá</dt><dd>{display(quote.tariff_version, "Không công bố")}</dd></div><div><dt>Điểm ghé</dt><dd>{(quote.stopovers ?? stopovers).length ? (quote.stopovers ?? stopovers).map((stopover) => stopover.address).join(" → ") : "Không có"}</dd></div><div><dt>Đường đi</dt><dd>{quote.route_geometry?.length || quote.route_polyline ? "Đã có dữ liệu đường đi" : "Đang cập nhật"}</dd></div></dl><XOneMap origin={pointFromQuote(quote, "pickup")} destination={pointFromQuote(quote, "dropoff")} stopovers={(quote.stopovers ?? stopovers).map((stopover) => ({ latitude: stopover.latitude, longitude: stopover.longitude, label: stopover.address }))} routeGeometry={quote.route_geometry ?? undefined} routePolyline={quote.route_polyline ?? undefined} routeProvider={quote.route_provider} routeDistanceMeters={quote.route_distance_meters} routeDurationSeconds={quote.route_duration_seconds} routeStatus={quote.status} label="Lộ trình báo giá" /><button className="button button-secondary ride-detail-action" type="button" onClick={() => setQuoteDetailOpen(true)}>Xem bản đồ và hành trình</button>{quoteDetail ? <ServiceDetailDialog open={quoteDetailOpen} onOpenChange={setQuoteDetailOpen} kind="ride" option={null} ride={quoteDetail} /> : null}{!booking ? <ConfirmationBox confirmation={{ title: "Xác nhận thông tin chuyến", detail: `${quote.pickup_address} → ${quote.dropoff_address} · ${formatMoney(quote.amount, quote.currency)}` }} checked={serviceChecked} setChecked={setServiceChecked} onConfirm={() => void prepare()} loading={loading} label="Tôi xác nhận điểm đi, điểm đến, loại xe và báo giá" /> : <><div className="hold-card"><Check size={17} /><div><strong>Thông tin chuyến đã được ghi nhận</strong><p>{status}</p></div></div>{booking.status === "AWAITING_CONFIRMATION" || booking.status === "AWAITING_PAYMENT_CONFIRMATION" ? <ConfirmationBox confirmation={{ title: "Xác nhận thanh toán", detail: `Thanh toán ${formatMoney(quote.amount, quote.currency)} để gửi yêu cầu tìm tài xế.` }} checked={paymentChecked} setChecked={setPaymentChecked} onConfirm={() => void confirm()} loading={loading} label="Tôi xác nhận thanh toán và muốn hoàn tất đặt xe" /> : <RideResult booking={booking} quote={quote} />}</>}</article> : <div className="quote-result quote-empty"><MapPinned size={22} /><p>Nhập hai điểm để xem khoảng cách, thời gian và giá hiện tại.</p></div>}</div>;
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
    ...(quote.stopovers?.length ? { stopovers: quote.stopovers.map((stopover) => ({ address: stopover.address, latitude: stopover.latitude, longitude: stopover.longitude })) } : {}),
  };
}

function RideResult({ booking, quote }: { booking: JsonRecord; quote: RideQuote }) {
  const { data: tracking } = useRideTracking(String(booking.id));
  const currentStatus = tracking?.status ?? booking.status;
  const noDriver = currentStatus === "NO_DRIVER";
  const completed = currentStatus === "COMPLETED";
  const searching = currentStatus === "SEARCHING_DRIVER";
  const cancelled = currentStatus === "CANCELLED";
  return (
    <div className="ride-result">
      {searching ? (
        <div className="radar-searching-box" role="status">
          <div className="radar-sweep-icon">
            <Compass size={22} />
          </div>
          <div>
            <strong style={{ color: "#0369A1", fontSize: "13px", display: "block" }}>
              Đang quét tìm tài xế gần bạn nhất...
            </strong>
            <span style={{ fontSize: "11px", color: "#0284C7" }}>
              Hệ thống AI X-One đang quét tìm xe {vehicleLabel(quote.vehicle_type)} trong bán kính 2.5 km
            </span>
          </div>
        </div>
      ) : (
        <div className="success-card">
          <Check size={18} />
          <strong>
            {cancelled ? "Chuyến đã bị hủy" : noDriver ? "Chưa tìm được tài xế phù hợp" : completed ? "Chuyến đã hoàn tất" : "Chuyến của bạn đã được ghi nhận"}
          </strong>
          <span>
            {cancelled ? "Bạn có thể thử lại với một báo giá mới." : noDriver ? "Bạn có thể thử lại với một điểm đón khác." : `Trạng thái hiện tại: ${statusLabel(currentStatus)}`}
          </span>
        </div>
      )}
      <RideTrackingPanel bookingId={String(booking.id)} polling />
      {cancelled ? null : <p className="inline-note">Giá và lộ trình dựa trên thông tin đã xác nhận của chuyến.</p>}
    </div>
  );
}

function AddressAutocompleteField({ id, label, value, placeholder, onChange, onSelect }: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void; onSelect: (candidate: GeocodeCandidate) => void }) {
  const [suggestions, setSuggestions] = useState<GeocodeCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const pickedRef = useRef("");

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3 || query === pickedRef.current) {
      setSuggestions([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    let active = true;
    const timer = globalThis.setTimeout(() => {
      setSearching(true);
      void autocompleteAddress(query).then((result) => {
        if (!active) return;
        setSuggestions(result.suggestions.filter((item) => item.latitude !== null && item.longitude !== null).slice(0, 5));
        setOpen(true);
      }).catch(() => { if (active) setSuggestions([]); }).finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; globalThis.clearTimeout(timer); };
  }, [value]);

  const listId = `${id}-suggestions`;
  const expanded = open && suggestions.length > 0;

  return <div className="address-autocomplete">
    <label htmlFor={id}>{label}</label>
    <div className="address-autocomplete-control">
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        onBlur={() => globalThis.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => { if (event.key === "Escape" && expanded) { event.stopPropagation(); setOpen(false); } }}
        placeholder={placeholder}
        autoComplete="off"
        required
        minLength={3}
        role="combobox"
        aria-controls={expanded ? listId : undefined}
        aria-expanded={expanded}
        aria-autocomplete="list"
        aria-busy={searching}
      />
      {searching ? <span className="address-autocomplete-spinner" aria-hidden="true"><Loader2 className="spinner" size={16} /></span> : null}
    </div>
    {expanded ? <div className="address-suggestions" id={listId} role="listbox" aria-label={`Gợi ý ${label.toLowerCase()}`}>{suggestions.map((candidate, index) => <button className="address-suggestion" key={`${candidate.address_text}-${index}`} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => { pickedRef.current = candidate.address_text.trim(); onSelect(candidate); setSuggestions([]); setOpen(false); }}>{candidate.address_text}</button>)}</div> : null}
  </div>;
}

function SearchForm({ label, keyword, setKeyword, loading, onSubmit, placeholder, showSubmit = true }: { label: string; keyword: string; setKeyword: (value: string) => void; loading: boolean; onSubmit?: () => void; placeholder: string; showSubmit?: boolean }) { return <form className="service-search" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}><label htmlFor="service-search-input">{label}</label><div><input id="service-search-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={placeholder} />{showSubmit ? <button className="button button-primary" type="submit" disabled={loading}><Search size={16} /> Tìm</button> : null}</div></form>; }
function AuthoritativeImage({ source, alt, compact = false }: { source: unknown; alt: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (typeof source !== "string" || !source.trim()) return null;
  const className = `authoritative-image${compact ? " compact" : ""}`;
  if (failed) return <div className={`${className} service-image-fallback`} role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh không khả dụng</div>;
  return <div className={className}><img src={source} alt={alt} loading="lazy" onError={() => setFailed(true)} /></div>;
}
function DetailHeading({ item, service }: { item: JsonRecord; service: ServiceKey }) {
  const point = pointFromRecord(item);
  const resourceId = idOf(item);
  const address = formatAddress(item.address, item.location, item.district, item.city) || "Địa chỉ đang cập nhật";
  return <div className={`service-detail-heading${point ? "" : " no-map"}${service === "restaurant" ? " restaurant-service-detail-heading" : ""}`}>
    <div className="service-detail-copy">
      <AuthoritativeImage source={item.image_url} alt={display(item.name ?? item.title ?? "Địa điểm")} />
      <span className="eyebrow">{serviceLabel(service).toUpperCase()} · CHI TIẾT</span>
      <h2>{display(item.name ?? item.title ?? "Địa điểm")}</h2>
      <p>{address}</p>
      {service !== "ride" ? <FavoriteToggle domain={service} resourceId={resourceId} /> : null}
      {!point ? <div className="map-fallback-banner" role="status"><Info aria-hidden="true" size={17} /><span>Chưa có tọa độ hợp lệ; bản đồ không khả dụng.</span></div> : null}
    </div>
    {point && service === "restaurant" ? <XOneMap restaurant={point} variant="location-detail" label="Vị trí địa điểm" /> : point ? <XOneMap destination={point} label="Vị trí địa điểm" /> : null}
  </div>;
}
function ConfirmationBox({ confirmation, checked, setChecked, onConfirm, loading, label }: { confirmation: JsonRecord; checked: boolean; setChecked: (value: boolean) => void; onConfirm: () => void; loading: boolean; label: string }) { return <div className="confirmation-box"><div><span className="eyebrow">XÁC NHẬN RÕ RÀNG</span><h3>{display(confirmation.title ?? "Kiểm tra lần cuối")}</h3><p>{display(confirmation.detail ?? "Các điều khoản hiện tại đã được kiểm tra từ nguồn đáng tin cậy.")}</p>{confirmation.preview ? <PreviewSummary preview={asRecord(confirmation.preview)} /> : null}</div><label className="confirmation-check"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> <span>{label}</span></label><button className="button button-primary" type="button" onClick={onConfirm} disabled={loading || !checked}>{loading ? <Loader2 className="spinner" size={16} /> : <ShieldCheck size={16} />} Xác nhận</button></div>; }
function PreviewSummary({ preview }: { preview?: JsonRecord }) {
  if (!preview) return null;
  if (preview.restaurant_name) {
    return <dl className="preview-summary">
      <div><dt>Nhà hàng</dt><dd>{display(preview.restaurant_name)}</dd></div>
      <div><dt>Thời lượng</dt><dd>{numberOf(preview.duration_minutes) || 120} phút</dd></div>
      <div><dt>Yêu cầu đặc biệt</dt><dd>{display(preview.special_requests, "Không có")}</dd></div>
      <div><dt>Hết hạn xác nhận</dt><dd>{formatDateTime(preview.confirmation_expires_at)}</dd></div>
      {preview.hold_expires_at ? <div><dt>Hết hạn giữ bàn</dt><dd>{formatDateTime(preview.hold_expires_at)}</dd></div> : null}
      <div><dt>Phiên bản</dt><dd>{display(preview.resource_version)}</dd></div>
    </dl>;
  }
  const currency = moneyCurrency(preview.total) ?? moneyCurrency(preview.subtotal) ?? display(preview.currency ?? "VND");
  const address = asRecord(preview.address ?? preview.delivery_address);
  const addressText = typeof preview.delivery_address === "string" ? preview.delivery_address : address?.address ?? address?.address_text ?? preview.delivery_address_text;
  return <dl className="preview-summary"><div><dt>Tạm tính</dt><dd>{formatMoney(moneyAmount(preview.subtotal), currency)}</dd></div><div><dt>Phí giao hàng</dt><dd>{formatMoney(moneyAmount(preview.delivery_fee ?? preview.delivery_amount), currency)}</dd></div><div><dt>Tổng thanh toán</dt><dd>{formatMoney(moneyAmount(preview.total), currency)}</dd></div><div><dt>Địa chỉ giao</dt><dd>{display(addressText ?? "Đã kiểm tra")}</dd></div></dl>;
}
function LoadingNote({ text }: { text: string }) { return <p className="inline-note service-loading-note" aria-live="polite"><Loader2 className="spinner" size={17} /> {text}</p>; }
function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="error-panel" role="alert"><p>{message}</p><button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button></div>; }
function EmptyNote({ title, body }: { title: string; body: string }) { return <div className="empty-state"><Search size={24} /><h2>{title}</h2><p>{body}</p></div>; }
function listFrom(value: unknown): JsonRecord[] { if (Array.isArray(value)) return value.filter(isRecord); if (isRecord(value)) { for (const key of ["items", "data", "restaurants", "doctors", "available_slots"]) if (Array.isArray(value[key])) return value[key].filter(isRecord); } return []; }
function asRecord(value: unknown): JsonRecord | undefined { return isRecord(value) ? value : undefined; }
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function idOf(value: JsonRecord): string { return display(value.id ?? value.restaurant_id ?? value.source_record_id); }
function display(value: unknown, fallback = "—"): string { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function numberOf(value: unknown): number { const valueNumber = Number(value); return Number.isFinite(valueNumber) ? valueNumber : 0; }
function moneyAmount(value: unknown): number { return isRecord(value) ? numberOf(value.amount ?? value.value) : numberOf(value); }
function moneyCurrency(value: unknown): string | undefined { if (!isRecord(value)) return undefined; const currency = value.currency; return typeof currency === "string" && currency ? currency : undefined; }
function formatMoney(value: unknown, currency = "VND"): string { return presentMoney(numberOf(value), currency); }
const HANOI_INNER_DISTRICTS: Array<{ key: string; label: string }> = [
  { key: "ba dinh", label: "Ba Đình" },
  { key: "hoan kiem", label: "Hoàn Kiếm" },
  { key: "hai ba trung", label: "Hai Bà Trưng" },
  { key: "dong da", label: "Đống Đa" },
  { key: "tay ho", label: "Tây Hồ" },
  { key: "cau giay", label: "Cầu Giấy" },
  { key: "thanh xuan", label: "Thanh Xuân" },
  { key: "hoang mai", label: "Hoàng Mai" },
  { key: "long bien", label: "Long Biên" },
  { key: "ha dong", label: "Hà Đông" },
  { key: "bac tu liem", label: "Bắc Từ Liêm" },
  { key: "nam tu liem", label: "Nam Từ Liêm" },
];
function normalizeAddress(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase(); }
function mentionsHanoi(value: string): boolean { const normalized = normalizeAddress(value); return normalized.includes("ha noi") || normalized.includes("hanoi"); }
function isHanoiInnerCityAddress(value: string): boolean { const normalized = normalizeAddress(value); return mentionsHanoi(value) && HANOI_INNER_DISTRICTS.some((district) => normalized.includes(district.key)); }
function hanoiDistrict(value: string): string | undefined { const normalized = normalizeAddress(value); return HANOI_INNER_DISTRICTS.find((candidate) => normalized.includes(candidate.key))?.label; }
function vehicleLabel(value: string): string { return ({ BIKE: "Xe máy", CAR_4: "Ô tô 4 chỗ", CAR_7: "Ô tô 7 chỗ" } as Record<string, string>)[value] ?? value; }
function pointFromRecord(value: JsonRecord): Point | undefined { if (value.suspicious === true || value.coordinate_status === "suspicious_default") return undefined; const candidates: unknown[] = [value, value.location, value.coordinates, value.coordinate]; for (const candidate of candidates) { if (!isRecord(candidate)) continue; const latitude = Number(candidate.latitude); const longitude = Number(candidate.longitude); if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude }; } return undefined; }
function candidatePoint(candidate: GeocodeCandidate): Point | undefined { return candidate.latitude !== null && candidate.longitude !== null ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined; }
function parseRideStopovers(value: string | null): RideStopover[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!isRecord(item) || typeof item.address !== "string") return [];
      const address = item.address.trim();
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      return address.length >= 3 && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? [{ address, latitude, longitude }]
        : [];
    }).slice(0, 2);
  } catch {
    return [];
  }
}
function pointFromQuote(quote: RideQuote, kind: "pickup" | "dropoff"): Point | undefined { const latitude = kind === "pickup" ? quote.pickup_latitude : quote.dropoff_latitude; const longitude = kind === "pickup" ? quote.pickup_longitude : quote.dropoff_longitude; return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : undefined; }
function defaultDateTimeLocal(): string { const date = new Date(Date.now() + 60 * 60 * 1000); date.setMinutes(0, 0, 0); const pad = (value: number) => String(value).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
