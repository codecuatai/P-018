"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleUserRound, HeartPulse, Loader2, MapPinned, Save, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { errorText } from "@/lib/api-client";
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

  return <section className="account-page" aria-labelledby="profile-title">
    <header className="section-heading"><div><span className="eyebrow">HỒ SƠ</span><h1 id="profile-title">Thông tin tài khoản</h1><p>Danh tính này được dùng để giữ ngữ cảnh, địa chỉ và lịch sử đúng theo tài khoản của bạn.</p></div></header>
    {!user?.onboarding_completed_at ? <article className="onboarding-card"><div><span className="eyebrow">BƯỚC TIẾP THEO</span><h2>Hoàn tất ngữ cảnh cá nhân</h2><p>Thêm tên và số điện thoại là đủ để bắt đầu. Địa chỉ hiện tại và hồ sơ người bệnh đều là bước tùy chọn, có thể làm sau.</p></div><div className="onboarding-actions"><Link className="button button-secondary" href="/app/profile?section=addresses"><MapPinned size={16} />Thêm địa chỉ <ArrowRight size={15} /></Link><button className="text-button" type="button" onClick={() => void skipOptionalOnboarding()} disabled={onboardingSaving}>{onboardingSaving ? "Đang lưu…" : "Bỏ qua bước tùy chọn"}</button></div></article> : null}
    <div className="profile-grid">
      <article className="profile-identity"><span className="profile-avatar"><CircleUserRound size={34} /></span><span className="eyebrow">X-ONE</span><h2>{user?.full_name || "Tài khoản X-One"}</h2><p>{user?.email}</p><span className="status-badge"><ShieldCheck size={15} /> {user?.status === "active" ? "Đang hoạt động" : "Trạng thái tài khoản"}</span></article>
      <article className="profile-details"><h2>Chỉnh sửa hồ sơ</h2><div className="profile-form"><label className="form-field"><span>Họ và tên</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label><label className="form-field"><span>Số điện thoại</span><input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" /></label><label className="form-field"><span>Email</span><input value={user?.email ?? ""} disabled aria-describedby="email-note" /><small id="email-note" className="field-hint">Email chưa được thay đổi trong luồng này.</small></label><div className="profile-form-row"><label className="form-field"><span>Ngôn ngữ</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label><label className="form-field"><span>Múi giờ</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Ho_Chi_Minh">Hà Nội</option><option value="UTC">UTC</option></select></label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}{feedback ? <p className="form-success" role="status">{feedback}</p> : null}<button className="button button-primary" type="button" onClick={() => void save()} disabled={saving || !fullName.trim()}>{saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div></article>
    </div>
    <section className="profile-sections" aria-labelledby="profile-sections-title"><div className="panel-heading"><div><span className="eyebrow">KHÔNG GIAN TÀI KHOẢN</span><h2 id="profile-sections-title">Dữ liệu dùng chung cho các dịch vụ</h2></div></div><div className="profile-section-links"><Link className={`profile-section-link ${section === "addresses" ? "is-selected" : ""}`} href="/app/profile?section=addresses"><span className="profile-section-icon"><MapPinned size={18} /></span><span><strong>Địa chỉ đã lưu</strong><small>Dùng lại cho chuyến xe và giao hàng, với tọa độ đã xác minh.</small></span><ArrowRight size={16} /></Link><Link className={`profile-section-link ${section === "patients" ? "is-selected" : ""}`} href="/app/profile?section=patients"><span className="profile-section-icon"><HeartPulse size={18} /></span><span><strong>Hồ sơ người bệnh</strong><small>Liên kết người thân cho luồng Healthcare.</small></span><ArrowRight size={16} /></Link><Link className={`profile-section-link ${section === "settings" ? "is-selected" : ""}`} href="/app/profile?section=settings"><span className="profile-section-icon"><Settings size={18} /></span><span><strong>Cài đặt & phiên bảo mật</strong><small>Ngôn ngữ, múi giờ và các phiên đăng nhập.</small></span><ArrowRight size={16} /></Link></div></section>
    {section === "addresses" ? <div className="profile-section-content"><AddressPage /></div> : section === "patients" ? <div className="profile-section-content"><PatientPage /></div> : section === "settings" ? <div className="profile-section-content"><SettingsPage /></div> : null}
  </section>;
}
