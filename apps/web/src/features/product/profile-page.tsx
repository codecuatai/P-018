"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleUserRound, HeartPulse, Loader2, MapPinned, Save, Settings, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

import { errorText, listSavedAddresses, createSavedAddress, deleteSavedAddress, resolveAddress } from "@/lib/api-client";
import type { SavedAddress } from "@/types";
import { useAuth } from "@/providers/auth-provider";
import { AddressPage } from "./address-page";
import { PatientPage } from "./patient-page";
import { SettingsPage } from "./settings-page";

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const searchParams = useSearchParams();
  const section = searchParams?.get("section");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("vi");
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");
  const [saving, setSaving] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [newAddressText, setNewAddressText] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState("");

  const loadAddresses = useCallback(async () => {
    try {
      const res = await listSavedAddresses();
      setAddresses(res.items);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    setFullName(user?.full_name ?? "");
    setPhone(user?.phone ?? "");
    setLanguage(user?.language ?? "vi");
    setTimezone(user?.timezone ?? "Asia/Ho_Chi_Minh");
  }, [user]);

  async function save(): Promise<void> {
    if (!fullName.trim() || saving) return;
    setSaving(true); setFeedback(""); setError("");
    try {
      await updateProfile({ full_name: fullName.trim(), phone: phone.trim(), language: language.trim(), timezone: timezone.trim(), onboarding_completed: true });
      if (newAddressText.trim()) { await handleAddAddress(); }
      setFeedback("Hồ sơ đã được cập nhật.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  }

  async function skipOptionalOnboarding(): Promise<void> {
    if (onboardingSaving) return;
    setOnboardingSaving(true); setError("");
    try { await updateProfile({ onboarding_completed: true }); setFeedback("Bạn có thể bổ sung địa chỉ hoặc hồ sơ y tế bất cứ lúc nào."); }
    catch (reason) { setError(errorText(reason)); }
    finally { setOnboardingSaving(false); }
  }

  async function handleAddAddress(): Promise<void> {
    if (!newAddressText.trim() || addressSaving) return;
    setAddressSaving(true);
    setAddressError("");
    try {
      const result = await resolveAddress(newAddressText.trim());
      if (!result.candidates || result.candidates.length === 0) {
        setAddressError("Không tìm thấy vị trí này trên bản đồ. Vui lòng nhập rõ số nhà, tên đường, phường/quận.");
        return;
      }
      const candidate = result.candidates[0];
      const created = await createSavedAddress({
        label: `Địa chỉ ${addresses.length + 1}`,
        address_text: candidate.address_text,
        ...(candidate.latitude && candidate.longitude ? { latitude: candidate.latitude, longitude: candidate.longitude } : {}),
        provider: result.provider,
        source: candidate.latitude ? "geocoded" : "manual"
      });
      setAddresses(prev => [created, ...prev]);
      setNewAddressText("");
    } catch (reason) {
      setAddressError(errorText(reason));
    } finally {
      setAddressSaving(false);
    }
  }

  async function handleRemoveAddress(id: string): Promise<void> {
    try {
      await deleteSavedAddress(id);
      setAddresses(prev => prev.filter(addr => addr.id !== id));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <section className="w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col gap-8" aria-labelledby="profile-title">
      <header className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">HỒ SƠ</span>
        <h1 id="profile-title" className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Thông tin tài khoản</h1>
        <p className="text-sm font-medium text-slate-500">Danh tính này được dùng để giữ ngữ cảnh, địa chỉ và lịch sử đúng theo tài khoản của bạn.</p>
      </header>

      {!user?.onboarding_completed_at ? (
        <article className="bg-blue-50/50 border border-blue-100 rounded-2xl md:rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">BƯỚC TIẾP THEO</span>
            <h2 className="text-xl font-bold text-blue-950">Hoàn tất ngữ cảnh cá nhân</h2>
            <p className="text-sm font-medium text-blue-800/80 max-w-md">Thêm tên và số điện thoại là đủ để bắt đầu. Địa chỉ hiện tại và hồ sơ người bệnh đều là bước tùy chọn, có thể làm sau.</p>
          </div>
          <button className="shrink-0 px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50" type="button" onClick={() => void skipOptionalOnboarding()} disabled={onboardingSaving}>
            {onboardingSaving ? "Đang xử lý…" : "Đã xong, bắt đầu dùng"}
          </button>
        </article>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <article className="md:col-span-4 bg-white rounded-3xl border border-slate-200/60 p-8 flex flex-col items-center text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 mb-4 shadow-sm">
            <CircleUserRound size={40} strokeWidth={1.5} />
          </div>
          <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase mb-1">X-ONE</span>
          <h2 className="text-xl font-bold text-slate-900 mb-1">{user?.full_name || "Tài khoản X-One"}</h2>
          <p className="text-sm font-medium text-slate-500 mb-6">{user?.email}</p>
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full flex items-center gap-1.5 text-xs font-bold">
            <ShieldCheck size={14} /> {user?.status === "active" ? "Đang hoạt động" : "Trạng thái tài khoản"}
          </div>
        </article>

        <article className="md:col-span-8 bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Chỉnh sửa hồ sơ</h2>
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700">Họ và tên</span>
              <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Ví dụ: Nguyễn Văn A" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700">Số điện thoại</span>
              <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="Ví dụ: 0912345678" />
            </label>

            <div className="flex flex-col gap-2 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
              <span className="text-xs font-bold text-slate-700">Địa chỉ giao hàng</span>
              <div className="flex flex-col gap-2">
                {addresses.map(addr => (
                  <div className="flex items-center gap-2" key={addr.id}>
                    <input className="flex-1 px-4 py-2 bg-slate-100 border border-transparent rounded-lg text-sm text-slate-500 font-medium cursor-not-allowed" value={addr.address_text} disabled />
                    <button type="button" className="shrink-0 w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all active:scale-95 shadow-sm" onClick={() => handleRemoveAddress(addr.id)} title="Xóa địa chỉ" aria-label="Xóa địa chỉ">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                <input
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                  placeholder="Thêm số nhà, đường, quận/huyện..."
                  value={newAddressText}
                  onChange={e => setNewAddressText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddAddress(); } }}
                />
                <button type="button" className="shrink-0 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2" onClick={() => void handleAddAddress()} disabled={addressSaving || !newAddressText.trim()}>
                  {addressSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  Thêm
                </button>
              </div>
              {addressError ? <p className="text-xs font-semibold text-red-600 mt-1" role="alert">{addressError}</p> : null}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700">Email</span>
              <input className="w-full px-4 py-2.5 bg-slate-100 border border-transparent rounded-xl text-sm font-medium text-slate-500 cursor-not-allowed" value={user?.email ?? ""} disabled aria-describedby="email-note" />
              <small id="email-note" className="text-[11px] font-medium text-slate-400">Email chưa được thay đổi trong luồng này.</small>
            </label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-700">Ngôn ngữ</span>
                <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-slate-700 appearance-none" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-700">Múi giờ</span>
                <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-slate-700 appearance-none" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                  <option value="Asia/Ho_Chi_Minh">Hà Nội</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
            </div>

            {error ? <div className="bg-red-50 border border-red-100 p-3 rounded-xl text-sm font-semibold text-red-600" role="alert">{error}</div> : null}
            {feedback ? <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-sm font-semibold text-emerald-600" role="status">{feedback}</div> : null}
            
            <div className="mt-2 flex justify-end">
              <button className="px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2" type="button" onClick={() => void save()} disabled={saving || !fullName.trim()}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {saving ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </article>
      </div>

      <section className="mt-4" aria-labelledby="profile-sections-title">
        <header className="flex flex-col gap-2 mb-6">
          <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase">KHÔNG GIAN TÀI KHOẢN</span>
          <h2 id="profile-sections-title" className="text-lg font-bold text-slate-900 tracking-tight">Dữ liệu dùng chung cho các dịch vụ</h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link scroll={false} className={`group flex flex-col gap-3 p-5 rounded-3xl border transition-all shadow-sm ${section === "addresses" ? "bg-white border-blue-600 ring-4 ring-blue-50" : "bg-white border-slate-200/60 hover:border-slate-300 hover:bg-slate-50"}`} href="/app/profile?section=addresses">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${section === "addresses" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"}`}>
              <MapPinned size={20} />
            </div>
            <div className="flex flex-col gap-0.5 mt-2">
              <strong className="text-sm font-bold text-slate-900 flex items-center justify-between">
                Địa chỉ đã lưu
                <ArrowRight size={16} className={`transition-transform ${section === "addresses" ? "text-blue-600 translate-x-1" : "text-slate-300 group-hover:text-slate-500"}`} />
              </strong>
              <small className="text-xs font-medium text-slate-500 leading-relaxed">Dùng lại cho chuyến xe và giao hàng, với tọa độ đã xác minh.</small>
            </div>
          </Link>
          <Link scroll={false} className={`group flex flex-col gap-3 p-5 rounded-3xl border transition-all shadow-sm ${section === "patients" ? "bg-white border-blue-600 ring-4 ring-blue-50" : "bg-white border-slate-200/60 hover:border-slate-300 hover:bg-slate-50"}`} href="/app/profile?section=patients">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${section === "patients" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"}`}>
              <HeartPulse size={20} />
            </div>
            <div className="flex flex-col gap-0.5 mt-2">
              <strong className="text-sm font-bold text-slate-900 flex items-center justify-between">
                Hồ sơ y tế
                <ArrowRight size={16} className={`transition-transform ${section === "patients" ? "text-blue-600 translate-x-1" : "text-slate-300 group-hover:text-slate-500"}`} />
              </strong>
              <small className="text-xs font-medium text-slate-500 leading-relaxed">Liên kết người thân cho luồng chăm sóc sức khỏe (Healthcare).</small>
            </div>
          </Link>
          <Link scroll={false} className={`group flex flex-col gap-3 p-5 rounded-3xl border transition-all shadow-sm ${section === "settings" ? "bg-white border-blue-600 ring-4 ring-blue-50" : "bg-white border-slate-200/60 hover:border-slate-300 hover:bg-slate-50"}`} href="/app/profile?section=settings">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${section === "settings" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"}`}>
              <Settings size={20} />
            </div>
            <div className="flex flex-col gap-0.5 mt-2">
              <strong className="text-sm font-bold text-slate-900 flex items-center justify-between">
                Bảo mật
                <ArrowRight size={16} className={`transition-transform ${section === "settings" ? "text-blue-600 translate-x-1" : "text-slate-300 group-hover:text-slate-500"}`} />
              </strong>
              <small className="text-xs font-medium text-slate-500 leading-relaxed">Quản lý mật khẩu và các phiên đăng nhập đang hoạt động.</small>
            </div>
          </Link>
        </div>
      </section>

      {section === "addresses" ? (
        <div className="mt-4"><AddressPage /></div>
      ) : section === "patients" ? (
        <div className="mt-4"><PatientPage /></div>
      ) : section === "settings" ? (
        <div className="mt-4"><SettingsPage /></div>
      ) : null}
    </section>
  );
}
