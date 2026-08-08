import { useState, type FormEvent } from "react";
import { ArrowRight, Bot, Loader2, LockKeyhole } from "lucide-react";
import { errorText, login } from "../api";
import type { AuthUser } from "../types";

export function AuthPage({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try { onAuthenticated(await login(email.trim(), password)); } catch (requestError) { setError(errorText(requestError)); } finally { setLoading(false); }
  }

  return <main className="auth-screen"><section className="auth-layout"><div className="auth-intro"><div className="brand-mark"><Bot size={22} /></div><span className="eyebrow">X-ONE</span><h1>Một trợ lý.<br />Mọi việc hằng ngày.</h1><p>Đặt xe, tìm món, giữ bàn hoặc tìm lịch khám trong cùng một cuộc trò chuyện.</p><div className="auth-domain-list"><span><ArrowRight size={14} /> Chuyến xe</span><span><ArrowRight size={14} /> Đồ ăn</span><span><ArrowRight size={14} /> Nhà hàng</span><span><ArrowRight size={14} /> Lịch khám</span></div></div><div className="auth-card"><div className="auth-card-heading"><span className="eyebrow">ĐĂNG NHẬP</span><h2>Chào mừng trở lại</h2><p>Dùng tài khoản demo đã được cấp cho môi trường này.</p></div>{error ? <div className="form-error" role="alert">{error}</div> : null}<form onSubmit={submit}><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label className="field-label" htmlFor="password">Mật khẩu</label><input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="button button-primary button-wide" disabled={loading} type="submit">{loading ? <Loader2 className="spinner" size={17} /> : <LockKeyhole size={17} />}{loading ? "Đang xác thực…" : "Đăng nhập"}</button></form><p className="auth-note">Phiên đăng nhập chỉ được giữ trong tab hiện tại.</p></div></section></main>;
}
