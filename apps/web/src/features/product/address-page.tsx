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

  return (
    <section className="w-full flex flex-col gap-6" aria-labelledby="addresses-title">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">ĐỊA CHỈ</span>
            <h1 id="addresses-title" className="text-2xl font-bold text-slate-900 tracking-tight">Địa chỉ đã lưu</h1>
          </div>
          <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void load()} aria-label="Tải lại địa chỉ">
            <RefreshCw size={18} />
          </button>
        </div>
        <p className="text-sm font-medium text-slate-500">Địa chỉ thuộc tài khoản Core của bạn. Tọa độ chỉ xuất hiện khi đã được xác nhận bởi nguồn định vị.</p>
      </header>

      <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-1">
            <strong className="text-lg font-bold text-slate-900">{editingId ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ mới"}</strong>
            {editingId ? <p className="text-xs font-medium text-amber-600">Đang sửa địa chỉ đã lưu.</p> : null}
          </div>
          {editingId ? (
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" type="button" onClick={resetForm}>
              <X size={14} /> Hủy sửa
            </button>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <label className="flex flex-col gap-1.5 sm:w-1/3">
            <span className="text-xs font-bold text-slate-700">Nhãn</span>
            <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nhà, Công ty…" />
          </label>
          <label className="flex flex-col gap-1.5 flex-1">
            <span className="text-xs font-bold text-slate-700">Địa chỉ</span>
            <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" value={addressText} onChange={(event) => changeAddress(event.target.value)} placeholder="Số nhà, đường, quận, thành phố" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2" type="button" onClick={() => void resolve()} disabled={locating || !addressText.trim()}>
            <MapPinned size={16} />
            {locating ? "Đang xác nhận…" : "Xác nhận vị trí"}
          </button>
          <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2" type="button" onClick={useBrowserLocation} disabled={locating}>
            <LocateFixed size={16} />
            Vị trí hiện tại
          </button>
          <div className="flex-1 min-w-[1rem]"></div>
          <button className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2" type="button" onClick={() => void save()} disabled={saving || !label.trim() || !addressText.trim()}>
            <Plus size={16} />
            {saving ? "Đang lưu…" : editingId ? "Cập nhật địa chỉ" : "Lưu địa chỉ"}
          </button>
        </div>
      </div>

      {locationNote ? <p className="text-xs font-medium text-slate-500 px-4 py-3 bg-slate-100 rounded-xl" aria-live="polite">{locationNote}</p> : null}
      
      {candidates.length > 0 ? (
        <div className="flex flex-col gap-2 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl" aria-label="Kết quả định vị">
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Chọn kết quả chính xác nhất</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {candidates.map((candidate, index) => (
              <button className="flex flex-col items-start gap-1 p-3 bg-white border border-amber-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-colors text-left" type="button" key={`${candidate.address_text}-${index}`} onClick={() => selectCandidate(candidate)}>
                <strong className="text-sm font-bold text-slate-900 leading-tight">{candidate.address_text}</strong>
                <small className="text-[11px] font-medium text-slate-500">
                  {candidate.latitude !== null && candidate.longitude !== null ? `${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}` : "Chưa có tọa độ"}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="h-[200px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
        <XOneMap destination={coordinates} label="Vị trí địa chỉ" />
      </div>

      {error ? <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-sm font-semibold text-red-600" role="alert">{error}</div> : null}

      <div className="flex flex-col gap-4 mt-4">
        {loading ? (
          <p className="text-sm font-medium text-slate-500 animate-pulse">Đang tải địa chỉ…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-slate-400 bg-slate-50/50 border border-slate-100 border-dashed rounded-3xl">
            <MapPinned size={40} strokeWidth={1.5} />
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-700">Chưa có địa chỉ</h2>
              <p className="text-sm font-medium mt-1">Lưu một điểm đến để các luồng đặt xe và giao hàng<br/>có thể dùng lại sau khi bạn xác nhận.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <article className="flex flex-col justify-between gap-4 p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:shadow-md transition-shadow" key={item.id}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-base font-bold text-slate-900">{item.label}</strong>
                    {item.is_default ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md">Mặc định</span> : null}
                  </div>
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">{item.address_text}</p>
                  <small className="text-xs font-medium text-slate-400 mt-1">{item.city ?? "Chưa phân loại"}</small>
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  {!item.is_default ? (
                    <button className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mr-auto" type="button" onClick={() => void makeDefault(item)}>
                      Đặt mặc định
                    </button>
                  ) : <div className="mr-auto"></div>}
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors" type="button" onClick={() => startEdit(item)} aria-label={`Sửa ${item.label}`}>
                    <Pencil size={14} />
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors" type="button" onClick={() => void remove(item)} aria-label={`Xóa ${item.label}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
