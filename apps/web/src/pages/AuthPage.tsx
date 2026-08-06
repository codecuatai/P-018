import React, { useState } from "react";
import { Headphones, Loader2, Lock, LogIn, Mail, Shield, Sparkles, Store, User, UserPlus } from "lucide-react";
import { AuthUser, UserRole } from "../types";
import { ApiService } from "../api";
import "./AuthPage.css";

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthPage: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("admin@Assistant-018.ai");
  const [password, setPassword] = useState("admin123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (mode === "register" && fullName.trim().length < 2) {
      setError("Vui lòng nhập đầy đủ họ tên.");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu cần tối thiểu 6 ký tự.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp. Vui lòng kiểm tra lại.");
      return;
    }

    try {
      setLoading(true);
      const user = mode === "login"
        ? await ApiService.login(email, password)
        : await ApiService.register(fullName, email, password, role as 'customer' | 'provider');
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xác thực tài khoản.");
    } finally {
      setLoading(false);
    }
  };

  const loginDemo = async (targetRole: UserRole) => {
    setError("");
    setLoading(true);
    try {
      let demoEmail = "";
      let demoPass = "";
      if (targetRole === "admin") {
        demoEmail = "admin@assistant-018.ai";
        demoPass = "admin123";
      } else if (targetRole === "operator") {
        demoEmail = "operator@assistant-018.ai";
        demoPass = "operator123";
      } else if (targetRole === "provider") {
        demoEmail = "partner@assistant-018.ai";
        demoPass = "partner123";
      } else {
        demoEmail = "user@assistant-018.ai";
        demoPass = "user123";
      }
      const user = await ApiService.login(demoEmail, demoPass);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng nhập tài khoản demo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page-container">
      {/* Dynamic Ambient Glow Background */}
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />
      <div className="ambient-glow glow-3" />

      <section className="auth-panel">
        {/* Brand Header */}
        <div className="auth-brand">
          <div className="auth-logo-badge">
            <Sparkles className="logo-icon" size={28} />
          </div>
          <div className="brand-text">
            <h1 className="brand-title">Assistant-018</h1>
            <p className="brand-subtitle">AI Concierge - Nền tảng đa dịch vụ</p>
          </div>
        </div>

        {/* Main Glass Card */}
        <div className="auth-card">
          {/* Tab Switcher */}
          <div className="auth-tabs">
            <button
              className={`tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setEmail("admin@Assistant-018.ai");
                setError("");
              }}
              type="button"
            >
              <LogIn size={16} />
              Đăng nhập
            </button>
            <button
              className={`tab-btn ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setEmail("");
                setConfirmPassword("");
                setError("");
              }}
              type="button"
            >
              <UserPlus size={16} />
              Đăng ký
            </button>
          </div>

          {/* Alert Message */}
          {error && <div className="auth-error">{error}</div>}

          {/* Auth Form */}
          <form className="auth-form" onSubmit={submitAuth}>
            {mode === "register" && (
              <div className="auth-field">
                <label>Họ và tên</label>
                <div className="input-wrapper">
                  <User className="input-icon" size={18} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Nguyễn Văn A"
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label>Địa chỉ Email</label>
              <div className="input-wrapper">
                <Mail className="input-icon" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@Assistant-018.ai"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label>Mật khẩu</label>
              <div className="input-wrapper">
                <Lock className="input-icon" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {mode === "register" && (
              <div className="auth-field">
                <label>Nhập lại mật khẩu</label>
                <div className={`input-wrapper ${confirmPassword && confirmPassword !== password ? "input-error" : ""}`}>
                  <Lock className="input-icon" size={18} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <span className="field-error-hint">Mật khẩu không khớp</span>
                )}
              </div>
            )}

            {mode === "register" && (
              <div className="auth-field">
                <label>Loại tài khoản đăng ký</label>
                <div className="role-selector">
                  <button
                    type="button"
                    className={`role-btn ${role === "customer" ? "active" : ""}`}
                    onClick={() => setRole("customer")}
                  >
                    <User size={16} />
                    Khách hàng
                  </button>
                  <button
                    type="button"
                    className={`role-btn ${role === "admin" ? "active" : ""}`}
                    onClick={() => setRole("admin")}
                  >
                    <Store size={16} />
                    Đối tác / Provider
                  </button>
                </div>
              </div>
            )}

            <button className="auth-submit-btn" disabled={loading} type="submit">
              {loading ? <Loader2 className="spinner" size={20} /> : <LogIn size={20} />}
              <span>{mode === "login" ? "Đăng nhập ngay" : "Khởi tạo tài khoản"}</span>
            </button>
          </form>

          {/* Quick Demo Section */}
          <div className="demo-section">
            <span className="demo-divider">Hoặc thử nhanh với tài khoản Demo</span>
            <div className="demo-login-row">
              <button
                type="button"
                className="demo-btn admin-demo"
                onClick={() => loginDemo("admin")}
                disabled={loading}
              >
                <Shield size={15} />
                <span>Admin Demo</span>
              </button>
              <button
                type="button"
                className="demo-btn user-demo"
                onClick={() => loginDemo("customer")}
                disabled={loading}
              >
                <User size={15} />
                <span>User Demo</span>
              </button>
              <button
                type="button"
                className="demo-btn operator-demo"
                onClick={() => loginDemo("operator")}
                disabled={loading}
              >
                <Headphones size={15} />
                <span>Operator Demo</span>
              </button>
              <button
                type="button"
                className="demo-btn provider-demo"
                onClick={() => loginDemo("provider")}
                disabled={loading}
              >
                <Store size={15} />
                <span>Partner Demo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Credit */}
        <footer className="auth-footer">
          <span>Powered by <strong>X-One Agentic Architecture</strong></span>
        </footer>
      </section>
    </main>
  );
};
