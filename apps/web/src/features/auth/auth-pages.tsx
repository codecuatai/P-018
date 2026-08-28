"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText, forgotPassword, getGoogleAuthUrl, resetPassword } from "@/lib/api-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HINT, validatePasswordPolicy } from "@/lib/password-policy";
import { useAuth } from "@/providers/auth-provider";
import type { AuthUser } from "@/types";

interface AuthFormProps {
  onSuccess: (user: AuthUser) => void;
  onSwitch?: () => void;
}

export function GoogleSignInButton({ pending, text = "Tiếp tục với Google" }: { pending?: boolean; text?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleClick() {
    setError("");
    setLoading(true);
    try {
      const url = await getGoogleAuthUrl();
      if (url) {
        window.location.href = url;
      } else {
        setError("Không lấy được đường dẫn đăng nhập Google.");
        setLoading(false);
      }
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
    }
  }

  return (
    <div className="google-auth-wrapper">
      <button
        type="button"
        className="button-google-auth"
        onClick={handleGoogleClick}
        disabled={loading || pending}
      >
        {loading ? (
          <LoaderCircle className="spinner" size={18} />
        ) : (
          <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
            />
          </svg>
        )}
        <span>{text}</span>
      </button>
      {error ? <p className="form-error" style={{ marginTop: 8 }}>{error}</p> : null}
      <div className="auth-divider">
        <span>Hoặc</span>
      </div>
    </div>
  );
}

export function LoginForm({ onSuccess, onSwitch }: AuthFormProps) {
  const { login } = useAuth();
  let reason: string | null = null;
  try {
    if (typeof useSearchParams === "function") {
      reason = useSearchParams()?.get("reason") ?? null;
    }
  } catch {
    // In Next.js App Router, useSearchParams can throw if rendered outside Suspense.
  }
  const sessionExpiredMessage = reason === "session_expired" ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục." : undefined;
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

  return (
    <>
      <GoogleSignInButton pending={pending} text="Đăng nhập bằng Google" />
      <form onSubmit={submit}>
        <Field label="Email" id="login-email" type="email" value={email} onChange={setEmail} autoComplete="username" required />
        <PasswordField id="login-password" label="Mật khẩu" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="form-row-end"><Link className="text-link" href="/forgot-password">Quên mật khẩu?</Link></div>
        <FormFeedback error={error} message={sessionExpiredMessage} />
        <Button className="button-wide" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="spinner" size={17} /> : <LockKeyhole size={17} />}
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
      <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={onSwitch}>Tạo tài khoản</button></p>
    </>
  );
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
    const validation = validatePasswordPolicy(password);
    if (!validation.valid) {
      setError(validation.error ?? "Mật khẩu không hợp lệ.");
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

  return (
    <>
      <GoogleSignInButton pending={pending} text="Đăng ký bằng Google" />
      <form onSubmit={submit}>
        <Field label="Họ và tên" id="register-name" value={fullName} onChange={setFullName} autoComplete="name" required />
        <Field label="Email" id="register-email" value={email} onChange={setEmail} autoComplete="email" required />
        <PasswordField id="register-password" label="Mật khẩu" value={password} onChange={setPassword} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
        <PasswordField id="register-confirm-password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
        <p className="field-hint">{PASSWORD_POLICY_HINT}</p>
        <FormFeedback error={error} />
        <Button className="button-wide" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="spinner" size={17} /> : <ShieldCheck size={17} />}
          {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
        </Button>
      </form>
      <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={onSwitch}>Đăng nhập</button></p>
    </>
  );
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
    const validation = validatePasswordPolicy(password);
    if (!validation.valid) {
      setError(validation.error ?? "Mật khẩu không hợp lệ.");
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

  return <AuthCard eyebrow="MẬT KHẨU MỚI" title="Đặt lại mật khẩu" intro={`Chọn một mật khẩu mới, ${PASSWORD_POLICY_HINT.toLowerCase()}`}>{success ? <div className="auth-success" role="status"><ShieldCheck size={20} /><h2>Mật khẩu đã được cập nhật</h2><p>Phiên cũ đã được kết thúc. Bạn sẽ được chuyển về trang chủ để đăng nhập lại.</p></div> : <form onSubmit={submit}><PasswordField id="reset-password" label="Mật khẩu mới" value={password} onChange={setPassword} autoComplete="new-password" disabled={!token} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} /><PasswordField id="reset-confirm-password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={!token} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} /><p className="field-hint">{PASSWORD_POLICY_HINT}</p><FormFeedback error={error} /><Button className="button-wide" disabled={pending || !token} type="submit">{pending ? <LoaderCircle className="spinner" size={17} /> : <LockKeyhole size={17} />}{pending ? "Đang cập nhật…" : "Cập nhật mật khẩu"}</Button></form>}</AuthCard>;
}

function AuthCard({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <section className="auth-page" aria-labelledby="auth-title"><div className="auth-motif" aria-hidden="true"><XOneMark size={72} /><span /><span /><span /><span /></div><article className="auth-card"><div className="auth-card-heading"><span className="eyebrow">{eyebrow}</span><h1 id="auth-title">{title}</h1><p>{intro}</p></div>{children}</article></section>;
}

function Field({ label, id, value, onChange, type = "text", autoComplete, required = false }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; required?: boolean }) {
  return <div className="form-field"><Label htmlFor={id}>{label}</Label><Input id={id} name={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required={required} /> </div>;
}

function PasswordField({ id, label, value, onChange, autoComplete, disabled = false, minLength, maxLength }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; disabled?: boolean; minLength?: number; maxLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <div className="form-field"><Label htmlFor={id}>{label}</Label><span className="password-input"><Input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} required disabled={disabled} /><button type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisible((state) => !state)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></div>;
}

function FormFeedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="form-error" role="alert" aria-live="polite">{error}</p>;
  if (message) return <p className="form-notice" role="status" aria-live="polite">{message}</p>;
  return <p className="form-feedback-placeholder" aria-live="polite" />;
}
