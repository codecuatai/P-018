import { useState, type FormEvent } from "react";
import { ArrowRight, Bot, Loader2, LockKeyhole } from "lucide-react";
import { errorText, login } from "../api";
import type { AuthUser } from "../types";

interface AuthPageProps {
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      onAuthenticated(user);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-layout">
        <div className="auth-intro">
          <div className="brand-mark" aria-hidden="true"><Bot size={22} /></div>
          <span className="eyebrow">X-ONE</span>
          <h1>Một trợ lý.<br />Mọi dịch vụ hằng ngày.</h1>
          <p>Đặt xe, đặt món, giữ bàn hoặc đặt lịch khám trong cùng một cuộc trò chuyện.</p>
          <div className="auth-domain-list">
            <span><ArrowRight size={14} /> Ride</span>
            <span><ArrowRight size={14} /> Food</span>
            <span><ArrowRight size={14} /> Restaurant</span>
            <span><ArrowRight size={14} /> Healthcare</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="eyebrow">ĐĂNG NHẬP</span>
            <h2>Chào mừng trở lại</h2>
            <p>Dùng tài khoản Gateway đang được cấu hình cho môi trường demo.</p>
          </div>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <form onSubmit={submit}>
            <label className="field-label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label className="field-label" htmlFor="password">Mật khẩu</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="button button-primary button-wide" disabled={loading} type="submit">
              {loading ? <Loader2 className="spinner" size={17} /> : <LockKeyhole size={17} />}
              {loading ? "Đang xác thực…" : "Đăng nhập"}
            </button>
          </form>
          <p className="auth-note">Phiên đăng nhập chỉ được giữ trong tab hiện tại. X-One không tạo tài khoản mới vì Gateway chưa cung cấp endpoint đăng ký.</p>
        </div>
      </section>
    </main>
  );
}
