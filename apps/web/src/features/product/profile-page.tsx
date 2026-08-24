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

  return <section className="account-page" aria-labelledby="profile-title">
    <header className="section-heading"><div><span className="eyebrow">HỒ SƠ</span><h1 id="profile-title">Thông tin tài khoản</h1><p>Danh tính này được dùng để giữ ngữ cảnh, địa chỉ và lịch sử đúng theo tài khoản của bạn.</p></div></header>
    {!user?.onboarding_completed_at ? <article className="onboarding-card"><div><span className="eyebrow">BƯỚC TIẾP THEO</span><h2>Hoàn tất ngữ cảnh cá nhân</h2><p>Thêm tên và số điện thoại là đủ để bắt đầu. Địa chỉ hiện tại và hồ sơ người bệnh đều là bước tùy chọn, có thể làm sau.</p></div><div className="onboarding-actions"><button className="button button-primary" type="button" onClick={() => void skipOptionalOnboarding()} disabled={onboardingSaving}>{onboardingSaving ? "Đang xử lý…" : "Đã xong, bắt đầu dùng"}</button></div></article> : null}
    <div className="profile-grid">
      <article className="profile-identity"><span className="profile-avatar"><CircleUserRound size={34} /></span><span className="eyebrow">X-ONE</span><h2>{user?.full_name || "Tài khoản X-One"}</h2><p>{user?.email}</p><span className="status-badge"><ShieldCheck size={15} /> {user?.status === "active" ? "Đang hoạt động" : "Trạng thái tài khoản"}</span></article>
      <article className="profile-details">
        <h2>Chỉnh sửa hồ sơ</h2>
        <div className="profile-form">
          <label className="form-field"><span>Họ và tên</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
          <label className="form-field"><span>Số điện thoại</span><input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" /></label>

          <div className="form-field">
            <span className="field-label" style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem", display: "block" }}>Địa chỉ giao hàng</span>
            <div className="address-inline-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.5rem" }}>
              {addresses.map(addr => (
                <div className="address-inline-row" key={addr.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input value={addr.address_text} disabled style={{ flex: 1 }} />
                  <button type="button" className="icon-button danger" onClick={() => handleRemoveAddress(addr.id)} title="Xóa địa chỉ" aria-label="Xóa địa chỉ"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <div className="address-inline-new" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                placeholder="Thêm số nhà, đường, quận/huyện..."
                value={newAddressText}
                onChange={e => setNewAddressText(e.target.value)}
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddAddress(); } }}
              />
              <button type="button" className="button button-secondary" onClick={() => void handleAddAddress()} disabled={addressSaving || !newAddressText.trim()}>
                {addressSaving ? <Loader2 className="spinner" size={16} /> : <Plus size={16} />}
                Thêm
              </button>
            </div>
            {addressError ? <p className="form-error" role="alert" style={{ marginTop: "0.5rem" }}>{addressError}</p> : null}
          </div>

          <label className="form-field"><span>Email</span><input value={user?.email ?? ""} disabled aria-describedby="email-note" /><small id="email-note" className="field-hint">Email chưa được thay đổi trong luồng này.</small></label>
          <div className="profile-form-row">
            <label className="form-field"><span>Ngôn ngữ</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
            <label className="form-field"><span>Múi giờ</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Ho_Chi_Minh">Hà Nội</option><option value="UTC">UTC</option></select></label>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {feedback ? <p className="form-success" role="status">{feedback}</p> : null}
          <button className="button button-primary" type="button" onClick={() => void save()} disabled={saving || !fullName.trim()}>{saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
        </div>
      </article>
    </div>
    <section className="profile-sections" aria-labelledby="profile-sections-title"><div className="panel-heading"><div><span className="eyebrow">KHÔNG GIAN TÀI KHOẢN</span><h2 id="profile-sections-title">Dữ liệu dùng chung cho các dịch vụ</h2></div></div><div className="profile-section-links"><Link scroll={false} className={`profile-section-link ${section === "addresses" ? "is-selected" : ""}`} href="/app/profile?section=addresses"><span className="profile-section-icon"><MapPinned size={18} /></span><span><strong>Địa chỉ đã lưu</strong><small>Dùng lại cho chuyến xe và giao hàng, với tọa độ đã xác minh.</small></span><ArrowRight size={16} /></Link><Link scroll={false} className={`profile-section-link ${section === "patients" ? "is-selected" : ""}`} href="/app/profile?section=patients"><span className="profile-section-icon"><HeartPulse size={18} /></span><span><strong>Hồ sơ người bệnh</strong><small>Liên kết người thân cho luồng Healthcare.</small></span><ArrowRight size={16} /></Link><Link scroll={false} className={`profile-section-link ${section === "settings" ? "is-selected" : ""}`} href="/app/profile?section=settings"><span className="profile-section-icon"><Settings size={18} /></span><span><strong>Cài đặt & phiên bảo mật</strong><small>Ngôn ngữ, múi giờ và các phiên đăng nhập.</small></span><ArrowRight size={16} /></Link></div></section>
    {section === "addresses" ? <div className="profile-section-content"><AddressPage /></div> : section === "patients" ? <div className="profile-section-content"><PatientPage /></div> : section === "settings" ? <div className="profile-section-content"><SettingsPage /></div> : null}
  </section>;
}
