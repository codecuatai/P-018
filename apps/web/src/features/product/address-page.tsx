"use client";

import { LocateFixed, MapPinned, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { createSavedAddress, deleteSavedAddress, errorText, listSavedAddresses, resolveAddress, updateSavedAddress } from "@/lib/api-client";
import type { GeocodeCandidate, SavedAddress } from "@/types";

import { XOneMap } from "./xone-map";

type Coordinates = { latitude: number; longitude: number };

function normalizeCoordinates(value: Coordinates): Coordinates {
  return { latitude: Number(value.latitude.toFixed(6)), longitude: Number(value.longitude.toFixed(6)) };
}

export function AddressPage() {
  const [items, setItems] = useState<SavedAddress[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalAddressText, setOriginalAddressText] = useState("");
  const [label, setLabel] = useState("Nhà");
  const [addressText, setAddressText] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [provider, setProvider] = useState<string>();
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [locationNote, setLocationNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await listSavedAddresses()).items);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setAddressText(candidate.address_text);
    if (candidate.latitude !== null && candidate.longitude !== null) setCoordinates(normalizeCoordinates({ latitude: candidate.latitude, longitude: candidate.longitude }));
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
        setCoordinates(normalizeCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }));
        setProvider("browser-geolocation");
        setLocationNote("Đã nhận vị trí hiện tại từ trình duyệt. Hãy nhập địa chỉ để lưu nhãn dễ nhớ.");
        setLocating(false);
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
        setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await createSavedAddress({ label: label.trim(), address_text: addressText.trim(), ...(coordinates ?? {}), ...(provider ? { provider } : {}), source: coordinates ? "geocoded" : "manual" });
        setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      }
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
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (editingId === item.id) resetForm();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function makeDefault(item: SavedAddress): Promise<void> {
    try {
      const updated = await updateSavedAddress(item.id, { is_default: true });
      setItems((current) => current.map((candidate) => ({ ...candidate, is_default: candidate.id === updated.id })));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return <section className="route-shell" aria-labelledby="addresses-title">
    <header className="section-heading">
      <div><span className="eyebrow">ĐỊA CHỈ</span><h1 id="addresses-title">Địa chỉ đã lưu</h1><p>Địa chỉ thuộc tài khoản Core của bạn. Tọa độ chỉ xuất hiện khi đã được xác nhận bởi nguồn định vị.</p></div>
      <button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại địa chỉ"><RefreshCw size={18} /></button>
    </header>
    <div className="address-form">
      <div className="address-form-heading"><div><strong>{editingId ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ"}</strong>{editingId ? <p className="inline-note">Đang sửa địa chỉ đã lưu.</p> : null}</div>{editingId ? <button className="text-button" type="button" onClick={resetForm}><X size={15} /> Hủy sửa</button> : null}</div>
      <label><span>Nhãn</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nhà, Công ty…" /></label>
      <label><span>Địa chỉ</span><input value={addressText} onChange={(event) => changeAddress(event.target.value)} placeholder="Số nhà, đường, quận, thành phố" /></label>
      <div className="address-form-actions"><button className="button button-secondary" type="button" onClick={() => void resolve()} disabled={locating || !addressText.trim()}><MapPinned size={16} />{locating ? "Đang xác nhận…" : "Xác nhận vị trí"}</button><button className="button button-secondary" type="button" onClick={useBrowserLocation} disabled={locating}><LocateFixed size={16} />Vị trí hiện tại</button><button className="button button-primary" type="button" onClick={() => void save()} disabled={saving || !label.trim() || !addressText.trim()}><Plus size={16} />{saving ? "Đang lưu…" : editingId ? "Cập nhật địa chỉ" : "Lưu địa chỉ"}</button></div>
    </div>
    {locationNote ? <p className="inline-note location-note" aria-live="polite">{locationNote}</p> : null}
    {candidates.length ? <div className="location-candidates" aria-label="Kết quả định vị">{candidates.map((candidate, index) => <button className="location-candidate" type="button" key={`${candidate.address_text}-${index}`} onClick={() => selectCandidate(candidate)}><strong>{candidate.address_text}</strong><small>{candidate.latitude !== null && candidate.longitude !== null ? `${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}` : "Chưa có tọa độ"}</small></button>)}</div> : null}
    <XOneMap destination={coordinates} label="Vị trí địa chỉ" />
    {error ? <div className="error-panel" role="alert"><p>{error}</p></div> : null}
    {loading ? <p className="inline-note">Đang tải địa chỉ…</p> : items.length === 0 ? <div className="empty-state"><MapPinned size={24} /><h2>Chưa có địa chỉ</h2><p>Lưu một điểm đến để các luồng đặt xe và giao hàng có thể dùng lại sau khi bạn xác nhận.</p></div> : <div className="address-list">{items.map((item) => <article className="address-row" key={item.id}><div><div className="address-title"><strong>{item.label}</strong>{item.is_default ? <span className="status-badge">Mặc định</span> : null}</div><p>{item.address_text}</p><small>{item.city ?? "Chưa phân loại"}</small></div><div className="address-actions">{!item.is_default ? <button className="text-button" type="button" onClick={() => void makeDefault(item)}>Đặt mặc định</button> : null}<button className="icon-button" type="button" onClick={() => startEdit(item)} aria-label={`Sửa ${item.label}`}><Pencil size={16} /></button><button className="icon-button danger" type="button" onClick={() => void remove(item)} aria-label={`Xóa ${item.label}`}><Trash2 size={16} /></button></div></article>)}</div>}
  </section>;
}
