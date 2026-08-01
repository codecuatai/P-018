import React, { useState, useEffect } from "react";
import { Save, UserCircle, MapPin, Loader2, Contact, Fingerprint } from "lucide-react";
import { UserProfile } from "../types";
import { MockService } from "../mocks/mockService";
import "./ProfileSettings.css";

export const ProfileSettings: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>({
    fullName: "",
    phone: "",
    email: "",
    idNumber: "",
    dob: "",
    gender: "",
    address: "",
    nationality: "",
    idIssueDate: "",
    idIssuePlace: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const data = await MockService.getUserProfile();
    if (data) {
      setProfile(data);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const phoneRegex = /^[0-9]{9,11}$/;
    if (!phoneRegex.test(profile.phone)) {
      return "Số điện thoại không hợp lệ (9-11 chữ số).";
    }

    const idRegex = /^([0-9]{9}|[0-9]{12})$/;
    if (!idRegex.test(profile.idNumber)) {
      return "Số CCCD/CMND không hợp lệ (9 hoặc 12 chữ số).";
    }

    if (profile.dob) {
      const dobDate = new Date(profile.dob);
      const today = new Date();
      if (dobDate > today) {
        return "Ngày sinh không được lớn hơn ngày hiện tại.";
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const errorMsg = validate();
    if (errorMsg) {
      setMessage({ type: "error", text: errorMsg });
      return;
    }

    setLoading(true);
    const success = await MockService.updateUserProfile(profile);
    setLoading(false);

    if (success) {
      setMessage({ type: "success", text: "Lưu hồ sơ thành công!" });
    } else {
      setMessage({ type: "error", text: "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  return (
    <div className="profile-settings">
      <div className="profile-header">
        <UserCircle size={40} className="text-primary" />
        <div>
          <h2>Hồ sơ cá nhân</h2>
          <p className="subtitle">Cập nhật thông tin để việc đặt dịch vụ diễn ra nhanh chóng hơn.</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
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
              <input type="text" name="fullName" value={profile.fullName} onChange={handleChange} required placeholder="Nguyễn Văn A" />
            </div>
            <div className="form-group">
              <label>Số điện thoại <span className="required">*</span></label>
              <input type="tel" name="phone" value={profile.phone} onChange={handleChange} required placeholder="09xxxxxxx" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email <span className="required">*</span></label>
              <input type="email" name="email" value={profile.email} onChange={handleChange} required placeholder="email@example.com" />
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
              <label>Ngày sinh</label>
              <input type="date" name="dob" value={profile.dob} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Quốc tịch</label>
              <input type="text" name="nationality" value={profile.nationality} onChange={handleChange} placeholder="Việt Nam" />
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
              <input type="text" name="idNumber" value={profile.idNumber} onChange={handleChange} required placeholder="Nhập số CCCD" />
            </div>
            <div className="form-group">
              <label>Ngày cấp CCCD</label>
              <input type="date" name="idIssueDate" value={profile.idIssueDate} onChange={handleChange} />
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
            <h3>Địa chỉ</h3>
          </div>
          <div className="form-row">
            <div className="form-group full-width">
              <label>Địa chỉ liên hệ</label>
              <input type="text" name="address" value={profile.address} onChange={handleChange} placeholder="Nhập địa chỉ của bạn" />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
            {loading ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </form>
    </div>
  );
};
