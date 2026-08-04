import React, { useState } from "react";
import { Loader2, LockKeyhole, LogIn, Navigation, UserPlus } from "lucide-react";
import { AuthUser, UserRole } from "../types";
import { MockService } from "../mocks/mockService";
import "./AuthPage.css";

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthPage: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("admin@navigo.vn");
  const [password, setPassword] = useState("admin123");
  const [role, setRole] = useState<UserRole>("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (mode === "register" && fullName.trim().length < 2) {
      setError("Vui lòng nhập họ tên.");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu cần tối thiểu 6 ký tự.");
      return;
    }

    try {
      setLoading(true);
      const user = mode === "login"
        ? await MockService.login({ email, password })
        : await MockService.register({ fullName, email, password, role });
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
      const user = await MockService.login({
        email: targetRole === "admin" ? "admin@navigo.vn" : "user@navigo.vn",
        password: targetRole === "admin" ? "admin123" : "user123",
      });
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng nhập demo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="auth-logo">
            <Navigation size={30} />
          </div>
          <div>
            <h1>NaviGo Admin</h1>
            <p>Quản trị vận hành đặt dịch vụ</p>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
              <LogIn size={16} />
              Đăng nhập
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">
              <UserPlus size={16} />
              Đăng ký
            </button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form className="auth-form" onSubmit={submitAuth}>
            {mode === "register" && (
              <div className="auth-field">
                <label>Họ tên</label>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Minh Anh" />
              </div>
            )}

            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@navigo.vn"
                required
              />
            </div>

            <div className="auth-field">
              <label>Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                required
              />
            </div>

            {mode === "register" && (
              <div className="auth-field">
                <label>Vai trò</label>
                <div className="role-control">
                  <button type="button" className={role === "admin" ? "active" : ""} onClick={() => setRole("admin")}>
                    Admin
                  </button>
                  <button type="button" className={role === "customer" ? "active" : ""} onClick={() => setRole("customer")}>
                    Khách hàng
                  </button>
                </div>
              </div>
            )}

            <button className="auth-submit" disabled={loading} type="submit">
              {loading ? <Loader2 className="spinner" size={18} /> : <LockKeyhole size={18} />}
              {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </form>

          <div className="demo-login-divider">
            <span>Hoặc thử nhanh bằng tài khoản Demo</span>
          </div>

          <div className="demo-login-row">
            <button type="button" onClick={() => loginDemo("admin")} disabled={loading}>
              Admin Demo
            </button>
            <button type="button" onClick={() => loginDemo("customer")} disabled={loading}>
              User Demo
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};
