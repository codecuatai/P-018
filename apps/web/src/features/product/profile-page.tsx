"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleUserRound, ChevronDown, HeartPulse, Loader2, MapPinned, Save, Search, Settings, ShieldCheck, Plus } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";

import { ApiError, autocompleteAddress, errorText, listSavedAddresses, createSavedAddress, setSavedAddressDefault, updateSavedAddress } from "@/lib/api-client";
import type { GeocodeCandidate, SavedAddress } from "@/types";
import { useAuth } from "@/providers/auth-provider";
import { AddressPage } from "./address-page";
import { XOneMap } from "./xone-map";
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
  const [addressCandidates, setAddressCandidates] = useState<GeocodeCandidate[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<GeocodeCandidate>();
  const [addressProvider, setAddressProvider] = useState<string>();
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string>();
  const [currentAddressPoint, setCurrentAddressPoint] = useState<{ latitude: number; longitude: number }>();
  const [defaultAddressSaving, setDefaultAddressSaving] = useState(false);
  const [addressDropdownOpen, setAddressDropdownOpen] = useState(false);
  const addressLoadSequence = useRef(0);

  const loadAddresses = useCallback(async () => {
    const sequence = ++addressLoadSequence.current;
    try {
      const res = await listSavedAddresses();
      if (sequence !== addressLoadSequence.current) return;
      setAddresses(res.items);
      setSelectedSavedAddressId((currentId) => {
        if (currentId && res.items.some((address) => address.id === currentId)) return currentId;
        return res.items.find((address) => address.is_default)?.id;
      });
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

  useEffect(() => {
    const selected = addresses.find((address) => address.id === selectedSavedAddressId);
    if (!selected) return;
    setNewAddressText(selected.address_text);
    setSelectedAddress({
      address_text: selected.address_text,
      latitude: selected.latitude ?? null,
      longitude: selected.longitude ?? null,
      confidence: 1,
    });
    setAddressProvider(selected.provider);
    setCurrentAddressPoint(selected.latitude !== undefined && selected.longitude !== undefined ? { latitude: selected.latitude, longitude: selected.longitude } : undefined);
  }, [addresses, selectedSavedAddressId]);

  useEffect(() => {
    const query = newAddressText.trim();
    if (query.length < 3 || selectedAddress?.address_text === query) {
      setAddressCandidates([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void autocompleteAddress(query).then((result) => {
        if (!active) return;
        setAddressProvider(result.provider);
        setAddressCandidates(result.suggestions.filter((candidate) => candidate.latitude !== null && candidate.longitude !== null).slice(0, 5));
      }).catch(() => { if (active) setAddressCandidates([]); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [newAddressText, selectedAddress]);

  async function save(): Promise<void> {
    if (!fullName.trim() || saving) return;
    setSaving(true); setFeedback(""); setError("");
    try {
      await updateProfile({ full_name: fullName.trim(), phone: phone.trim(), language: language.trim(), timezone: timezone.trim() });
      if (newAddressText.trim() && (selectedSavedAddressId || selectedAddress) && !(await handleSetDefaultAddress())) return;
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

  async function handleSetDefaultAddress(): Promise<boolean> {
    if (!newAddressText.trim() || defaultAddressSaving) return false;
    setDefaultAddressSaving(true);
    setError("");
    try {
      const savedAddress = addresses.find((address) => address.id === selectedSavedAddressId);
      if (savedAddress) {
        let updated: SavedAddress;
        try {
          updated = await setSavedAddressDefault(savedAddress.id);
        } catch (reason) {
          // Keep the action compatible with a gateway instance that predates
          // the dedicated default-address endpoint.
          if (!(reason instanceof ApiError) || ![404, 405].includes(reason.status)) throw reason;
          updated = await updateSavedAddress(savedAddress.id, { is_default: true });
        }
        setSelectedSavedAddressId(updated.id);
        await loadAddresses();
        setFeedback("Địa chỉ đã được lưu và đặt làm mặc định.");
        return true;
      }
      const selectedText = selectedAddress?.address_text ? normalizeAddressText(selectedAddress.address_text) : "";
      const inputText = normalizeAddressText(newAddressText);
      const latitude = selectedAddress?.latitude === null || selectedAddress?.latitude === undefined ? undefined : Number(selectedAddress.latitude);
      const longitude = selectedAddress?.longitude === null || selectedAddress?.longitude === undefined ? undefined : Number(selectedAddress.longitude);
      if (!selectedAddress || selectedText !== inputText || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError("Hãy chọn một địa chỉ trong danh sách gợi ý để xác nhận vị trí trước khi thêm.");
        return false;
      }
      const created = await createSavedAddress({
        label: "Địa chỉ mặc định",
        address_text: selectedAddress.address_text,
        latitude,
        longitude,
        ...(addressProvider ? { provider: addressProvider } : {}),
        source: "geocoded",
        is_default: true,
      });
      setAddresses(prev => [created, ...prev]);
      setSelectedSavedAddressId(created.id);
      setNewAddressText("");
      setAddressCandidates([]);
      setSelectedAddress(undefined);
      setAddressProvider(undefined);
      setCurrentAddressPoint(created.latitude !== undefined && created.longitude !== undefined ? { latitude: created.latitude, longitude: created.longitude } : undefined);
      await loadAddresses();
      setFeedback("Địa chỉ đã được lưu và đặt làm mặc định.");
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    } finally {
      setDefaultAddressSaving(false);
    }
  }

  function chooseAddress(candidate: GeocodeCandidate): void {
    setNewAddressText(candidate.address_text);
    setSelectedAddress(candidate);
    setSelectedSavedAddressId(undefined);
    setAddressDropdownOpen(false);
    setAddressCandidates([]);
    setError("");
    if (candidate.latitude !== null && candidate.longitude !== null) setCurrentAddressPoint({ latitude: candidate.latitude, longitude: candidate.longitude });
  }

  function chooseSavedAddress(address: SavedAddress): void {
    setSelectedSavedAddressId(address.id);
    setAddressDropdownOpen(false);
    setNewAddressText(address.address_text);
    setSelectedAddress({
      address_text: address.address_text,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      confidence: 1,
    });
    setAddressProvider(address.provider);
    setCurrentAddressPoint(address.latitude !== undefined && address.longitude !== undefined ? { latitude: address.latitude, longitude: address.longitude } : undefined);
    setError("");
  }

  function handleAddressInput(value: string): void {
    const saved = addresses.find((address) => normalizeAddressText(address.address_text) === normalizeAddressText(value));
    if (saved) {
      chooseSavedAddress(saved);
      return;
    }
    setNewAddressText(value);
    setSelectedAddress(undefined);
    setSelectedSavedAddressId(undefined);
    setCurrentAddressPoint(undefined);
    setAddressProvider(undefined);
    setError("");
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
            <div className="address-inline-new">
              <div className="address-dropdown">
                <button type="button" className="address-dropdown-trigger" onClick={() => setAddressDropdownOpen((open) => !open)} aria-expanded={addressDropdownOpen} aria-haspopup="listbox">
                  <span>{newAddressText || "Chọn hoặc nhập địa chỉ giao hàng..."}</span><ChevronDown size={17} aria-hidden="true" />
                </button>
                {addressDropdownOpen ? <div className="address-dropdown-menu" role="listbox" aria-label="Chọn địa chỉ giao hàng">
                  <input
                    autoFocus
                    placeholder="Nhập địa chỉ để tìm kiếm..."
                    value={newAddressText}
                    onChange={e => handleAddressInput(e.target.value)}
                    aria-label="Tìm địa chỉ giao hàng"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSetDefaultAddress(); } }}
                  />
                  {[...addresses].sort((left, right) => Number(right.is_default) - Number(left.is_default)).map((address) => <button className={`address-dropdown-option ${selectedSavedAddressId === address.id ? "is-selected" : ""}`} type="button" role="option" aria-selected={selectedSavedAddressId === address.id} key={address.id} onClick={() => chooseSavedAddress(address)}><strong>{address.label}{address.is_default ? " · Mặc định" : ""}</strong><span>{address.address_text}</span></button>)}
                  {addressCandidates.length ? <div className="address-dropdown-suggestions" role="group" aria-label="Gợi ý địa chỉ mới">{addressCandidates.map((candidate, index) => <button className="address-dropdown-option" role="option" type="button" key={`${candidate.address_text}-${index}`} onClick={() => chooseAddress(candidate)}><Search size={14} /><span>{candidate.address_text}</span></button>)}</div> : null}
                  {!addresses.length && !addressCandidates.length ? <span className="field-hint">Chưa có địa chỉ lưu. Hãy nhập địa chỉ mới để tìm kiếm.</span> : null}
                </div> : null}
              </div>
              <button type="button" className="button button-secondary" onClick={() => void handleSetDefaultAddress()} disabled={defaultAddressSaving || Boolean(addresses.find((address) => address.id === selectedSavedAddressId)?.is_default) || (!selectedSavedAddressId && !(selectedAddress?.latitude !== null && selectedAddress?.longitude !== null)) || !newAddressText.trim()}>
                {defaultAddressSaving ? <Loader2 className="spinner" size={16} /> : <Plus size={16} />}
                {addresses.find((address) => address.id === selectedSavedAddressId)?.is_default ? "Đang mặc định" : "Đặt làm mặc định"}
              </button>
            </div>
            {selectedSavedAddressId ? <p className="field-hint">Đã chọn địa chỉ lưu sẵn. Bản đồ bên dưới hiển thị vị trí của địa chỉ này.</p> : null}
          </div>

          {(() => {
            const saved = addresses.find((address) => address.id === selectedSavedAddressId);
            const point = saved?.latitude !== undefined && saved.longitude !== undefined ? { latitude: saved.latitude, longitude: saved.longitude } : selectedAddress && selectedAddress.latitude !== null && selectedAddress.longitude !== null ? { latitude: selectedAddress.latitude, longitude: selectedAddress.longitude } : currentAddressPoint;
            return <XOneMap destination={point} label={saved ? `Vị trí ${saved.label}` : "Vị trí địa chỉ mới"} />;
          })()}

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

function normalizeAddressText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}
