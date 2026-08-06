import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Contact,
  CreditCard,
  Fingerprint,
  Loader2,
  MapPin,
  RotateCcw,
  Save,
  ShieldCheck,
  UserCircle,
  Wand2,
} from "lucide-react";
import { UserProfile } from "../types";
import { ApiService } from "../api";
import "./ProfileSettings.css";

interface Props {
  onSaved?: (profile: UserProfile) => void;
}

type ProfileErrors = Partial<Record<keyof UserProfile, string>>;

const emptyProfile: UserProfile = {
  fullName: "",
  phone: "",
  email: "",
  idNumber: "",
  dob: "",
  gender: "",
  address: "",
  city: "",
  district: "",
  nationality: "",
  idIssueDate: "",
  idIssuePlace: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  preferredPayment: "",
  preferredCabin: "",
  specialRequests: "",
  notifyEmail: true,
  notifySms: false,
  notifyReminder: true,
};

const requiredFields: Array<keyof UserProfile> = [
  "fullName",
  "phone",
  "email",
  "idNumber",
  "dob",
  "nationality",
  "address",
  "city",
  "emergencyName",
  "emergencyPhone",
  "preferredPayment",
];

const mergeProfile = (profile: UserProfile | null): UserProfile => ({
  ...emptyProfile,
  ...(profile ?? {}),
});

export const ProfileSettings: React.FC<Props> = ({ onSaved }) => {
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [savedProfile, setSavedProfile] = useState<UserProfile>(emptyProfile);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const data = mergeProfile((await ApiService.getProfile()) as UserProfile | null);
    setProfile(data);
    setSavedProfile(data);
  };

  const completion = useMemo(() => {
    const filled = requiredFields.filter((field) => Boolean(String(profile[field] ?? "").trim())).length;
    return Math.round((filled / requiredFields.length) * 100);
  }, [profile]);

  const hasChanges = useMemo(() => JSON.stringify(profile) !== JSON.stringify(savedProfile), [profile, savedProfile]);
  const profileReady = Boolean(profile.fullName && profile.phone && profile.email && profile.idNumber);

  const setField = <K extends keyof UserProfile>(name: K, value: UserProfile[K]) => {
    setProfile((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setMessage(null);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setField(name as keyof UserProfile, value as UserProfile[keyof UserProfile]);
  };

  const handleToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setField(name as keyof UserProfile, checked as UserProfile[keyof UserProfile]);
  };

  const validate = (): boolean => {
    const newErrors: ProfileErrors = {};
    requiredFields.forEach((field) => {
      if (!String(profile[field] ?? "").trim()) {
        newErrors[field] = "Trường này không được để trống";
      }
    });

    // Validate email
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      newErrors.email = "Email không hợp lệ";
    }

    // Validate phone
    if (profile.phone && !/^\d{10,11}$/.test(profile.phone)) {
      newErrors.phone = "Số điện thoại gồm 10-11 chữ số";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) {
      setMessage({ type: "error", text: "Vui lòng kiểm tra các trường đang báo lỗi." });
      return;
    }

    setLoading(true);
    const success = await ApiService.updateProfile(profile as unknown as Record<string, unknown>);
    setLoading(false);

    if (success) {
      setSavedProfile(profile);
      setMessage({ type: "success", text: "Hồ sơ đã được lưu và sẵn sàng dùng để đặt dịch vụ." });
      onSaved?.(profile);
    } else {
      setMessage({ type: "error", text: "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  const handleFillDemo = async () => {
    // Demo profile: fill local state only, then save to backend
    const demoProfile = mergeProfile({
      fullName: "Nguyễn Minh Anh", phone: "0901234567", email: "demo@assistant-018.ai",
      idNumber: "012345678901", dob: "1995-04-12", gender: "female",
      address: "25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh", city: "TP. Hồ Chí Minh",
      district: "Quận 1", nationality: "Việt Nam",
      idIssueDate: "2021-05-20", idIssuePlace: "Cục Cảnh sát quản lý hành chính",
      emergencyName: "Nguyễn Thanh Bình", emergencyPhone: "0912345678", emergencyRelation: "Anh trai",
      preferredPayment: "momo", preferredCabin: "economy",
      specialRequests: "ưu tiên chỗ gần cửa sổ, cần nhắc lịch trước chuyến đi.",
      notifyEmail: true, notifySms: true, notifyReminder: true,
    } as UserProfile);
    setLoading(true);
    await ApiService.updateProfile(demoProfile as unknown as Record<string, unknown>);
    setLoading(false);
    setProfile(demoProfile);
    setSavedProfile(demoProfile);
    setErrors({});
    setMessage({ type: "success", text: "Đã điền hồ sơ demo đầy đủ. Bạn có thể quay lại Trợ lý đặt vé để xác nhận booking." });
    onSaved?.(demoProfile);
  };

  const handleReset = () => {
    setProfile(savedProfile);
    setErrors({});
    setMessage(null);
  };

  const renderError = (field: keyof UserProfile) => errors[field] ? <span className="field-error">{errors[field]}</span> : null;

  return (
    <div className="profile-settings">
      <div className="profile-layout">
        <aside className="profile-summary">
          <div className="summary-card">
            <div className="summary-avatar">{profile.fullName ? profile.fullName.charAt(0).toUpperCase() : "U"}</div>
            <h2>{profile.fullName || "Hồ sơ cá nhân"}</h2>
            <p>{profile.email || "Chưa có email"}</p>
            <span className={`ready-badge ${profileReady ? "ready" : "missing"}`}>
              {profileReady ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
              {profileReady ? "Hồ sơ sẵn sàng" : "Cần bổ sung"}
            </span>

            <div className="completion-block">
              <div>
                <span>Mức hoàn thiện</span>
                <strong>{completion}%</strong>
              </div>
              <div className="completion-track">
                <span style={{ width: `${completion}%` }} />
              </div>
            </div>

            <div className="summary-list">
              <div><span>Số điện thoại</span><strong>{profile.phone || "Chưa cập nhật"}</strong></div>
              <div><span>Quốc tịch</span><strong>{profile.nationality || "Chưa cập nhật"}</strong></div>
              <div><span>Thanh toán mặc định</span><strong>{profile.preferredPayment || "Chưa chọn"}</strong></div>
            </div>
          </div>

          <div className="summary-card compact">
            <strong>Danh sách kiểm tra demo</strong>
            <ul>
              <li className={profile.fullName && profile.phone && profile.email ? "done" : ""}>Thông tin liên hệ</li>
              <li className={profile.idNumber && profile.dob ? "done" : ""}>Giấy tờ tùy thân</li>
              <li className={profile.address && profile.city ? "done" : ""}>Địa chỉ liên hệ</li>
              <li className={profile.emergencyName && profile.emergencyPhone ? "done" : ""}>Liên hệ khẩn cấp</li>
              <li className={profile.preferredPayment ? "done" : ""}>Tùy chọn dịch vụ</li>
            </ul>
          </div>
        </aside>

        <main className="profile-main">
          <div className="profile-header">
            <UserCircle size={40} className="text-primary" />
            <div>
              <h2>Hồ sơ cá nhân</h2>
              <p className="subtitle">Quản lý thông tin hành khách, giấy tờ, liên hệ khẩn cấp và tùy chọn đặt dịch vụ.</p>
            </div>
            <button type="button" className="btn-demo-fill" onClick={handleFillDemo} disabled={loading}>
              <Wand2 size={18} />
              Điền dữ liệu demo
            </button>
          </div>

          {message && (
            <div className={`alert alert-${message.type}`}>
              {message.type === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="profile-card">
              <div className="card-header">
                <Contact size={20} className="text-primary" />
                <h3>Thông tin liên hệ</h3>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Họ và tên <span className="required">*</span></label>
                  <input type="text" name="fullName" value={profile.fullName} onChange={handleChange} placeholder="Nguyễn Văn A" />
                  {renderError("fullName")}
                </div>
                <div className="form-group">
                  <label>Số điện thoại <span className="required">*</span></label>
                  <input type="tel" name="phone" value={profile.phone} onChange={handleChange} placeholder="09xxxxxxx" />
                  {renderError("phone")}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email <span className="required">*</span></label>
                  <input type="email" name="email" value={profile.email} onChange={handleChange} placeholder="email@example.com" />
                  {renderError("email")}
                </div>
                <div className="form-group">
                  <label>Giới tính</label>
                  <select name="gender" value={profile.gender} onChange={handleChange}>
                    <option value="">Chọn giới tính</option>
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Ngày sinh <span className="required">*</span></label>
                  <input type="date" name="dob" value={profile.dob} onChange={handleChange} />
                  {renderError("dob")}
                </div>
                <div className="form-group">
                  <label>Quốc tịch <span className="required">*</span></label>
                  <input type="text" name="nationality" value={profile.nationality} onChange={handleChange} placeholder="Việt Nam" />
                  {renderError("nationality")}
                </div>
              </div>
            </div>

            <div className="profile-card">
              <div className="card-header">
                <Fingerprint size={20} className="text-primary" />
                <h3>Giấy tờ tùy thân</h3>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Số CCCD / Passport <span className="required">*</span></label>
                  <input type="text" name="idNumber" value={profile.idNumber} onChange={handleChange} placeholder="Nhập số CCCD" />
                  {renderError("idNumber")}
                </div>
                <div className="form-group">
                  <label>Ngày cấp CCCD</label>
                  <input type="date" name="idIssueDate" value={profile.idIssueDate} onChange={handleChange} />
                  {renderError("idIssueDate")}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group full-width">
                  <label>Nơi cấp CCCD</label>
                  <input type="text" name="idIssuePlace" value={profile.idIssuePlace} onChange={handleChange} placeholder="VD: Cục cảnh sát..." />
                </div>
              </div>
            </div>

            <div className="profile-card">
              <div className="card-header">
                <MapPin size={20} className="text-primary" />
                <h3>Địa chỉ liên hệ</h3>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tỉnh / Thành phố <span className="required">*</span></label>
                  <input type="text" name="city" value={profile.city} onChange={handleChange} placeholder="TP. Hồ Chí Minh" />
                  {renderError("city")}
                </div>
                <div className="form-group">
                  <label>Quận / Huyện</label>
                  <input type="text" name="district" value={profile.district} onChange={handleChange} placeholder="Quận 1" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group full-width">
                  <label>Địa chỉ chi tiết <span className="required">*</span></label>
                  <input type="text" name="address" value={profile.address} onChange={handleChange} placeholder="Số nhà, đường, phường/xã" />
                  {renderError("address")}
                </div>
              </div>
            </div>

            <div className="profile-card">
              <div className="card-header">
                <ShieldCheck size={20} className="text-primary" />
                <h3>Liên hệ khẩn cấp</h3>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Họ tên người liên hệ <span className="required">*</span></label>
                  <input type="text" name="emergencyName" value={profile.emergencyName} onChange={handleChange} placeholder="Nguyễn Thanh Bình" />
                  {renderError("emergencyName")}
                </div>
                <div className="form-group">
                  <label>Số điện thoại <span className="required">*</span></label>
                  <input type="tel" name="emergencyPhone" value={profile.emergencyPhone} onChange={handleChange} placeholder="09xxxxxxx" />
                  {renderError("emergencyPhone")}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group full-width">
                  <label>Quan hệ</label>
                  <input type="text" name="emergencyRelation" value={profile.emergencyRelation} onChange={handleChange} placeholder="Bố, mẹ, anh/chị, bạn bè..." />
                </div>
              </div>
            </div>

            <div className="profile-card">
              <div className="card-header">
                <CreditCard size={20} className="text-primary" />
                <h3>Tùy chọn đặt dịch vụ</h3>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Thanh toán mặc định <span className="required">*</span></label>
                  <select name="preferredPayment" value={profile.preferredPayment} onChange={handleChange}>
                    <option value="">Chọn phương thức</option>
                    <option value="momo">Ví MoMo</option>
                    <option value="bank_transfer">Chuyển khoản</option>
                    <option value="card">Thẻ nội địa/quốc tế</option>
                    <option value="cash">Thanh toán tại quầy</option>
                  </select>
                  {renderError("preferredPayment")}
                </div>
                <div className="form-group">
                  <label>Hạng ghế/phòng ưa thích</label>
                  <select name="preferredCabin" value={profile.preferredCabin} onChange={handleChange}>
                    <option value="">Không ưu tiên</option>
                    <option value="economy">Phổ thông</option>
                    <option value="premium">Phổ thông đặc biệt</option>
                    <option value="business">Thương gia</option>
                  </select>
                </div>
              </div>

              {profile.preferredPayment === "momo" && (
                <div className="payment-connect-box momo-box">
                  <div className="connect-header">
                    <div className="connect-title">
                      <span className="momo-badge">MoMo</span>
                      <div>
                        <h4>Liên kết tài khoản Ví MoMo</h4>
                        <p>Dùng để xác thực và thanh toán nhanh 1-Click khi đặt dịch vụ</p>
                      </div>
                    </div>
                    <span className={`connect-status ${profile.momoLinked ? "linked" : "unlinked"}`}>
                      {profile.momoLinked ? "✓ Đã kết nối Ví" : "Chưa kết nối"}
                    </span>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Số điện thoại Ví MoMo</label>
                      <input
                        type="tel"
                        name="momoPhone"
                        value={profile.momoPhone || ""}
                        onChange={handleChange}
                        placeholder="0901234567"
                      />
                    </div>
                    <div className="form-group">
                      <label>Tên chủ tài khoản Ví</label>
                      <input
                        type="text"
                        name="momoAccountName"
                        value={profile.momoAccountName || ""}
                        onChange={handleChange}
                        placeholder="NGUYEN MINH ANH"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn-connect-verify ${profile.momoLinked ? "linked" : ""}`}
                    onClick={() => setField("momoLinked", !profile.momoLinked)}
                  >
                    {profile.momoLinked ? "Hủy kết nối Ví MoMo" : "Giả lập kết nối Ví MoMo ngay"}
                  </button>
                </div>
              )}

              {profile.preferredPayment === "card" && (
                <div className="payment-connect-box card-box">
                  <div className="connect-header">
                    <div className="connect-title">
                      <CreditCard size={22} className="text-primary" />
                      <div>
                        <h4>Thông tin thẻ Visa / Mastercard / ATM</h4>
                        <p>Mã hóa token giả lập an toàn để hỗ trợ thanh toán tức thì</p>
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group full-width">
                      <label>Số thẻ thanh toán</label>
                      <input
                        type="text"
                        name="cardNumber"
                        value={profile.cardNumber || ""}
                        onChange={handleChange}
                        placeholder="4123 4567 8901 2345"
                      />
                    </div>
                  </div>
                  <div className="form-row three-cols">
                    <div className="form-group">
                      <label>Tên chủ thẻ (Viết hoa không dấu)</label>
                      <input
                        type="text"
                        name="cardHolder"
                        value={profile.cardHolder || ""}
                        onChange={handleChange}
                        placeholder="NGUYEN MINH ANH"
                      />
                    </div>
                    <div className="form-group">
                      <label>Hạn thẻ (MM/YY)</label>
                      <input
                        type="text"
                        name="cardExpiry"
                        value={profile.cardExpiry || ""}
                        onChange={handleChange}
                        placeholder="12/28"
                      />
                    </div>
                    <div className="form-group">
                      <label>Mã CVV/CVC</label>
                      <input
                        type="password"
                        name="cardCvv"
                        value={profile.cardCvv || ""}
                        onChange={handleChange}
                        placeholder="***"
                        maxLength={4}
                      />
                    </div>
                  </div>
                </div>
              )}

              {profile.preferredPayment === "bank_transfer" && (
                <div className="payment-connect-box bank-box">
                  <div className="connect-header">
                    <div className="connect-title">
                      <ShieldCheck size={22} className="text-primary" />
                      <div>
                        <h4>Tài khoản ngân hàng liên kết (VietQR)</h4>
                        <p>Hệ thống tự động tra cứu giao dịch khớp với mã đặt chỗ</p>
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Ngân hàng liên kết</label>
                      <select
                        name="bankName"
                        value={profile.bankName || "Vietcombank"}
                        onChange={handleChange}
                      >
                        <option value="Vietcombank">Vietcombank (VCB)</option>
                        <option value="Techcombank">Techcombank (TCB)</option>
                        <option value="MBBank">MB Bank (MB)</option>
                        <option value="VietinBank">VietinBank</option>
                        <option value="BIDV">BIDV</option>
                        <option value="VPBank">VPBank</option>
                        <option value="ACB">ACB</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Số tài khoản ngân hàng</label>
                      <input
                        type="text"
                        name="bankAccountNumber"
                        value={profile.bankAccountNumber || ""}
                        onChange={handleChange}
                        placeholder="10123456789"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group full-width">
                      <label>Tên chủ tài khoản</label>
                      <input
                        type="text"
                        name="bankAccountName"
                        value={profile.bankAccountName || ""}
                        onChange={handleChange}
                        placeholder="NGUYEN MINH ANH"
                      />
                    </div>
                  </div>
                </div>
              )}

              {profile.preferredPayment === "cash" && (
                <div className="payment-connect-box cash-box">
                  <div className="connect-header">
                    <div className="connect-title">
                      <Contact size={22} className="text-primary" />
                      <div>
                        <h4>Thanh toán trực tiếp tại quầy / Điểm đón</h4>
                        <p>Thanh toán tiền mặt hoặc quẹt thẻ POS trực tiếp</p>
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group full-width">
                      <label>Ghi chú địa điểm thanh toán</label>
                      <input
                        type="text"
                        name="cashNote"
                        value={profile.cashNote || ""}
                        onChange={handleChange}
                        placeholder="Thanh toán trực tiếp tại quầy dịch vụ hoặc điểm đón"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group full-width">
                  <label>Yêu cầu đặc biệt</label>
                  <textarea name="specialRequests" value={profile.specialRequests} onChange={handleChange} rows={4} placeholder="VD: ghế gần cửa sổ, hỗ trợ hành lý, ăn chay..." />
                </div>
              </div>
            </div>

            <div className="profile-card">
              <div className="card-header">
                <Bell size={20} className="text-primary" />
                <h3>Cài đặt thông báo</h3>
              </div>
              <div className="toggle-grid">
                <label className="toggle-row">
                  <input type="checkbox" name="notifyEmail" checked={profile.notifyEmail} onChange={handleToggle} />
                  <span>Email xác nhận và vé điện tử</span>
                </label>
                <label className="toggle-row">
                  <input type="checkbox" name="notifySms" checked={profile.notifySms} onChange={handleToggle} />
                  <span>SMS khi booking thay đổi</span>
                </label>
                <label className="toggle-row">
                  <input type="checkbox" name="notifyReminder" checked={profile.notifyReminder} onChange={handleToggle} />
                  <span>Nhắc lịch trước chuyến đi</span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-reset" onClick={handleReset} disabled={loading || !hasChanges}>
                <RotateCcw size={18} />
                Hủy thay đổi
              </button>
              <button type="submit" className="btn-save" disabled={loading || !hasChanges}>
                {loading ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
                {loading ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};
