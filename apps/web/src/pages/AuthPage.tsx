import React, { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { AuthUser } from "../types";
import "./AuthPage.css";

interface Props { onAuthenticated: (user: AuthUser) => void; }

export const AuthPage: React.FC<Props> = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <main className="auth-page"><section className="auth-panel"><div className="auth-brand"><h1>NaviGo</h1><p>Đăng nhập sẽ khả dụng khi Auth Service được tích hợp.</p></div><form className="auth-card auth-form" onSubmit={(event) => event.preventDefault()}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" /></label><button className="auth-submit" disabled type="submit"><LockKeyhole size={18} />Chưa kết nối Auth Service</button><p className="auth-error"><LogIn size={16} /> Không có tài khoản demo hoặc dữ liệu xác thực cục bộ.</p></form></section></main>;
};
