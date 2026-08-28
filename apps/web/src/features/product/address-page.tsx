"use client";

import { LocateFixed, MapPinned, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { autocompleteAddress, createSavedAddress, deleteSavedAddress, errorText, resolveAddress, reverseGeocodeAddress, updateSavedAddress } from "@/lib/api-client";
import type { GeocodeCandidate, SavedAddress } from "@/types";

import { XOneMap } from "./xone-map";

type Coordinates = { latitude: number; longitude: number };

type AddressPageProps = {
  items: SavedAddress[];
  loading: boolean;
  onReload: () => Promise<void>;
  onItemsChange: Dispatch<SetStateAction<SavedAddress[]>>;
};

function normalizeCoordinates(value: Coordinates): Coordinates {
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}

export function AddressPage({ items, loading, onReload, onItemsChange }: AddressPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalAddressText, setOriginalAddressText] = useState("");
  const [label, setLabel] = useState("Nhà");
  const [addressText, setAddressText] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [provider, setProvider] = useState<string>();
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const autocompleteSequence = useRef(0);
  const skipAutocompleteQuery = useRef("");

  useEffect(() => {
    const query = addressText.trim();
    const sequence = ++autocompleteSequence.current;
    if (query.length < 3 || query === skipAutocompleteQuery.current) {
      skipAutocompleteQuery.current = "";
      if (query.length < 3) setCandidates([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void autocompleteAddress(query).then((result) => {
        if (sequence !== autocompleteSequence.current) return;
        setProvider(result.provider);
        setCandidates(result.suggestions.slice(0, 5));
      }).catch(() => {
        if (sequence === autocompleteSequence.current) setCandidates([]);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [addressText]);

  function resetForm(): void {
    setEditingId(null);
    setOriginalAddressText("");
    setLabel("Nhà");
    setAddressText("");
    setCoordinates(undefined);
    setProvider(undefined);
    setCandidates([]);
    setLocationNote("");
  }

  function startEdit(item: SavedAddress): void {
    setEditingId(item.id);
    setOriginalAddressText(item.address_text);
    setLabel(item.label);
    setAddressText(item.address_text);
    setCoordinates(item.latitude !== undefined && item.longitude !== undefined ? { latitude: item.latitude, longitude: item.longitude } : undefined);
    setProvider(item.provider);
    setCandidates([]);
    setLocationNote("Nếu đổi địa chỉ, bạn nên xác nhận lại vị trí để tính giao hàng chính xác. Lưu thủ công sẽ xóa tọa độ cũ.");
    setError("");
    setTimeout(() => document.querySelector(".address-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 10);
  }

  async function resolve(): Promise<void> {
    if (!addressText.trim() || locating) return;
    setLocating(true);
    setError("");
    setLocationNote("");
    try {
      const result = await resolveAddress(addressText.trim());
      setCandidates(result.candidates);
      setProvider(result.provider);
      setLocationNote(result.status === "RESOLVED" ? "Hãy chọn kết quả đúng trước khi lưu." : "Chưa có tọa độ chắc chắn; bạn có thể lưu địa chỉ thủ công.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLocating(false);
    }
  }

  function selectCandidate(candidate: GeocodeCandidate): void {
    skipAutocompleteQuery.current = candidate.address_text;
    setAddressText(candidate.address_text);
    const latitude = Number(candidate.latitude);
    const longitude = Number(candidate.longitude);
    if (candidate.latitude !== null && candidate.longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      setCoordinates(normalizeCoordinates({ latitude, longitude }));
      setProvider(provider || "geocoded");
    }
    setCandidates([]);
    setLocationNote("Đã chọn tọa độ từ kết quả định vị. Kiểm tra lại địa chỉ trước khi lưu.");
  }

  function useBrowserLocation(): void {
    if (!navigator.geolocation) {
      setLocationNote("Trình duyệt này không hỗ trợ vị trí hiện tại.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = normalizeCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setCoordinates(point);
        setCandidates([]);
        setLocationNote("Đã nhận tọa độ. Đang tìm địa chỉ tương ứng…");
        void reverseGeocodeAddress(point.latitude, point.longitude).then((result) => {
          const candidate = result.candidates.find((item) => item.latitude !== null && item.longitude !== null);
          if (!candidate) {
            setProvider("browser-geolocation");
            setLocationNote("Chưa đổi được tọa độ thành địa chỉ. Bạn hãy nhập địa chỉ để lưu; vị trí hiện tại vẫn đang được đánh dấu trên bản đồ.");
            return;
          }
          skipAutocompleteQuery.current = candidate.address_text;
          setAddressText(candidate.address_text);
          setCoordinates(normalizeCoordinates({ latitude: candidate.latitude!, longitude: candidate.longitude! }));
          setProvider(result.provider);
          setLocationNote("Đã điền địa chỉ hiện tại và đánh dấu vị trí trên bản đồ. Kiểm tra lại trước khi lưu.");
        }).catch(() => {
          setProvider("browser-geolocation");
          setLocationNote("Đã nhận vị trí hiện tại nhưng chưa lấy được địa chỉ. Bạn hãy nhập địa chỉ để lưu.");
        }).finally(() => setLocating(false));
      },
      () => {
        setLocationNote("Không thể nhận vị trí. Bạn vẫn có thể nhập và lưu địa chỉ thủ công.");
        setLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    );
  }

  function changeAddress(value: string): void {
    setAddressText(value);
    setCandidates([]);
    if (editingId && value.trim() === originalAddressText.trim()) {
      setLocationNote("Địa chỉ gốc vẫn được giữ nguyên tọa độ.");
      return;
    }
    setCoordinates(undefined);
    setProvider(undefined);
    setLocationNote(editingId ? "Địa chỉ đã đổi. Bạn có thể xác nhận vị trí mới hoặc lưu thủ công; tọa độ cũ sẽ không được giữ lại." : "");
  }

  async function save(): Promise<void> {
    if (!label.trim() || !addressText.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        const updated = await updateSavedAddress(editingId, {
          label: label.trim(),
          address_text: addressText.trim(),
          ...(coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude } : {}),
          ...(provider ? { provider } : {}),
          source: coordinates ? "geocoded" : "manual",
        });
        onItemsChange((current) => current.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await createSavedAddress({ label: label.trim(), address_text: addressText.trim(), ...(coordinates ?? {}), ...(provider ? { provider } : {}), source: coordinates ? "geocoded" : "manual" });
        onItemsChange((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      }
      await onReload();
      resetForm();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: SavedAddress): Promise<void> {
    try {
      await deleteSavedAddress(item.id);
      onItemsChange((current) => current.filter((candidate) => candidate.id !== item.id));
      if (editingId === item.id) resetForm();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function makeDefault(item: SavedAddress): Promise<void> {
    try {
      const updated = await updateSavedAddress(item.id, { is_default: true });
      onItemsChange((current) => current.map((candidate) => ({ ...candidate, is_default: candidate.id === updated.id })));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return <section className="route-shell" aria-labelledby="addresses-title">
    <header className="section-heading">
      <div><span className="eyebrow">ĐỊA CHỈ</span><h1 id="addresses-title">Địa chỉ đã lưu</h1><p>Địa chỉ thuộc tài khoản Core của bạn. Tọa độ chỉ xuất hiện khi đã được xác nhận bởi nguồn định vị.</p></div>
      <button className="icon-button" type="button" onClick={() => void onReload()} aria-label="Tải lại địa chỉ"><RefreshCw size={18} /></button>
    </header>
    <div className="address-form">
      <div className="address-form-heading"><div><strong>{editingId ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ"}</strong>{editingId ? <p className="inline-note">Đang sửa địa chỉ đã lưu.</p> : null}</div>{editingId ? <button className="text-button" type="button" onClick={resetForm}><X size={15} /> Hủy sửa</button> : null}</div>
      <label><span>Nhãn</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nhà, Công ty…" /></label>
      <label className="address-autocomplete-field"><span>Địa chỉ</span><input value={addressText} onChange={(event) => changeAddress(event.target.value)} placeholder="Số nhà, đường, quận, thành phố" autoComplete="street-address" aria-autocomplete="list" aria-controls="address-suggestions" /></label>
      <div className="address-form-actions"><button className="button button-secondary" type="button" onClick={() => void resolve()} disabled={locating || !addressText.trim()}><MapPinned size={16} />{locating ? "Đang xác nhận…" : "Xác nhận vị trí"}</button><button className="button button-secondary" type="button" onClick={useBrowserLocation} disabled={locating}><LocateFixed size={16} />Vị trí hiện tại</button><button className="button button-primary" type="button" onClick={() => void save()} disabled={saving || !label.trim() || !addressText.trim()}><Plus size={16} />{saving ? "Đang lưu…" : editingId ? "Cập nhật địa chỉ" : "Lưu địa chỉ"}</button></div>
    </div>
    {locationNote ? <p className="inline-note location-note" aria-live="polite">{locationNote}</p> : null}
    {candidates.length ? <div id="address-suggestions" className="location-candidates" role="listbox" aria-label="Gợi ý địa chỉ">{candidates.map((candidate, index) => <button className="location-candidate" role="option" type="button" key={`${candidate.address_text}-${index}`} onClick={() => selectCandidate(candidate)}><strong>{candidate.address_text}</strong><small>{candidate.latitude !== null && candidate.longitude !== null ? `${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}` : "Chưa có tọa độ"}</small></button>)}</div> : null}
    <XOneMap destination={coordinates} label="Vị trí địa chỉ" />
    {error ? <div className="error-panel" role="alert"><p>{error}</p></div> : null}
    {loading ? <p className="inline-note">Đang tải địa chỉ…</p> : items.length === 0 ? <div className="empty-state"><MapPinned size={24} /><h2>Chưa có địa chỉ</h2><p>Lưu một điểm đến để các luồng đặt xe và giao hàng có thể dùng lại sau khi bạn xác nhận.</p></div> : <div className="address-list">{items.map((item) => <article className="address-row" key={item.id}><div><div className="address-title"><strong>{item.label}</strong>{item.is_default ? <span className="status-badge">Mặc định</span> : null}</div><p>{item.address_text}</p><small>{item.city ?? "Chưa phân loại"}</small></div><div className="address-actions">{!item.is_default ? <button className="text-button" type="button" onClick={() => void makeDefault(item)}>Đặt mặc định</button> : null}<button className="icon-button" type="button" onClick={() => startEdit(item)} aria-label={`Sửa ${item.label}`}><Pencil size={16} /></button><button className="icon-button danger" type="button" onClick={() => void remove(item)} aria-label={`Xóa ${item.label}`}><Trash2 size={16} /></button></div></article>)}</div>}
  </section>;
}
