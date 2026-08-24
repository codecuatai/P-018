"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText, forgotPassword, resetPassword } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";
import type { AuthUser } from "@/types";

interface AuthFormProps {
  onSuccess: (user: AuthUser) => void;
  onSwitch?: () => void;
}

export function LoginForm({ onSuccess, onSwitch }: AuthFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const user = await login(email, password);
      onSuccess(user);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setPending(false);
    }
  }

  return <><form onSubmit={submit}><Field label="Email" id="login-email" type="email" value={email} onChange={setEmail} autoComplete="username" required /><PasswordField id="login-password" label="Mật khẩu" value={password} onChange={setPassword} autoComplete="current-password" /><div className="form-row-end"><Link className="text-link" href="/forgot-password">Quên mật khẩu?</Link></div><FormFeedback error={error} /><Button className="button-wide" disabled={pending} type="submit">{pending ? <LoaderCircle className="spinner" size={17} /> : <LockKeyhole size={17} />}{pending ? "Đang đăng nhập…" : "Đăng nhập"}</Button></form><p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={onSwitch}>Tạo tài khoản</button></p></>;
}

export function RegisterForm({ onSuccess, onSwitch }: AuthFormProps) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Mật khẩu phải có tối thiểu 8 ký tự.");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      setError("Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const user = await register(fullName, email, password);
      onSuccess(user);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setPending(false);
    }
  }

  return <><form onSubmit={submit}><Field label="Họ và tên" id="register-name" value={fullName} onChange={setFullName} autoComplete="name" required /><Field label="Email" id="register-email" value={email} onChange={setEmail} autoComplete="email" required /><PasswordField id="register-password" label="Mật khẩu" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /><PasswordField id="register-confirm-password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={8} /><p className="field-hint">Mật khẩu dài từ 8 ký tự, bao gồm chữ, số và ký tự đặc biệt.</p><FormFeedback error={error} /><Button className="button-wide" disabled={pending} type="submit">{pending ? <LoaderCircle className="spinner" size={17} /> : <ShieldCheck size={17} />}{pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}</Button></form><p className="auth-switch">Đã có tài khoản? <button type="button" onClick={onSwitch}>Đăng nhập</button></p></>;
}

export function ForgotPasswordPage() {
  return <AuthCard eyebrow="KHÔI PHỤC TRUY CẬP" title="Quên mật khẩu?" intro="Nhập email tài khoản của bạn. Chúng tôi sẽ xử lý yêu cầu một cách riêng tư."><ForgotPasswordForm /></AuthCard>;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setPending(false);
    }
  }

  return sent ? <div className="auth-success" role="status"><Mail size={20} /><h2>Yêu cầu đã được ghi nhận</h2><p>Nếu tài khoản và kênh gửi đã được cấu hình, hướng dẫn sẽ được gửi theo cách phù hợp. Bạn có thể quay lại trang chủ để đăng nhập.</p><Link className="button button-primary button-wide" href="/?auth=login">Đăng nhập</Link></div> : <form onSubmit={submit}><Field label="Email" id="forgot-email" type="email" value={email} onChange={setEmail} autoComplete="email" required /><FormFeedback error={error} /><Button className="button-wide" disabled={pending} type="submit">{pending ? <LoaderCircle className="spinner" size={17} /> : <Mail size={17} />}{pending ? "Đang gửi yêu cầu…" : "Gửi yêu cầu"}</Button><p className="auth-switch"><Link href="/?auth=login">Đăng nhập</Link></p></form>;
}

export function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(token ? "" : "Liên kết đặt lại mật khẩu đang thiếu thông tin cần thiết.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setError("Mật khẩu phải có tối thiểu 8 ký tự.");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      setError("Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setError("");
    setPending(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      window.setTimeout(() => router.replace("/?auth=login"), 900);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setPending(false);
    }
  }

  return <AuthCard eyebrow="MẬT KHẨU MỚI" title="Đặt lại mật khẩu" intro="Chọn một mật khẩu mới, dài tối thiểu 8 ký tự, bao gồm chữ, số và ký tự đặc biệt.">{success ? <div className="auth-success" role="status"><ShieldCheck size={20} /><h2>Mật khẩu đã được cập nhật</h2><p>Phiên cũ đã được kết thúc. Bạn sẽ được chuyển về trang chủ để đăng nhập lại.</p></div> : <form onSubmit={submit}><PasswordField id="reset-password" label="Mật khẩu mới" value={password} onChange={setPassword} autoComplete="new-password" disabled={!token} minLength={8} /><PasswordField id="reset-confirm-password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={!token} minLength={8} /><p className="field-hint">Mật khẩu dài từ 8 ký tự, bao gồm chữ, số và ký tự đặc biệt.</p><FormFeedback error={error} /><Button className="button-wide" disabled={pending || !token} type="submit">{pending ? <LoaderCircle className="spinner" size={17} /> : <LockKeyhole size={17} />}{pending ? "Đang cập nhật…" : "Cập nhật mật khẩu"}</Button></form>}</AuthCard>;
}

function AuthCard({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <section className="auth-page" aria-labelledby="auth-title"><div className="auth-motif" aria-hidden="true"><XOneMark size={72} /><span /><span /><span /><span /></div><article className="auth-card"><div className="auth-card-heading"><span className="eyebrow">{eyebrow}</span><h1 id="auth-title">{title}</h1><p>{intro}</p></div>{children}</article></section>;
}

function Field({ label, id, value, onChange, type = "text", autoComplete, required = false }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; required?: boolean }) {
  return <div className="form-field"><Label htmlFor={id}>{label}</Label><Input id={id} name={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required={required} /> </div>;
}

function PasswordField({ id, label, value, onChange, autoComplete, disabled = false, minLength }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; disabled?: boolean; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <div className="form-field"><Label htmlFor={id}>{label}</Label><span className="password-input"><Input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} required disabled={disabled} /><button type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisible((state) => !state)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></div>;
}

function FormFeedback({ error }: { error: string }) {
  return error ? <p className="form-error" role="alert" aria-live="polite">{error}</p> : <p className="form-feedback-placeholder" aria-live="polite" />;
}
