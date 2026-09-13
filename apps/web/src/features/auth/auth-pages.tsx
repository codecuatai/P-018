"use client";

import { Car, Check, Eye, EyeOff, HeartPulse, Info, LoaderCircle, LockKeyhole, Mail, Phone, ShieldCheck, Store, User, UtensilsCrossed } from "lucide-react";
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
          <svg className="google-icon" width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
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
      const raw = errorText(requestError);
      if (
        raw.includes("không đúng") ||
        raw.includes("mật khẩu") ||
        raw.includes("credentials") ||
        raw.includes("Email hoặc mật khẩu")
      ) {
        setError("Sai mật khẩu hoặc email. Thử lại hoặc đặt lại qua email.");
      } else {
        setError(raw);
      }
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
        <div className="form-row-end">
          <Link className="text-link" href="/forgot-password">Quên mật khẩu?</Link>
        </div>
        <FormFeedback error={error} message={sessionExpiredMessage} />
        <Button className="button-wide button-primary" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="spinner" size={17} /> : <LockKeyhole size={17} />}
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
      <p className="auth-switch">
        Lần đầu đến X-One?{" "}
        <button type="button" onClick={onSwitch}>
          Tạo tài khoản miễn phí
        </button>
      </p>
    </>
  );
}

export function RegisterForm({ onSuccess, onSwitch }: AuthFormProps) {
  const { register } = useAuth();
  const [accountType, setAccountType] = useState<"user" | "provider">("user");
  const [providerType, setProviderType] = useState<"ride_driver" | "restaurant_merchant" | "healthcare_doctor">("ride_driver");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
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
    if (accountType === "provider" && !phone.trim()) {
      setError("Vui lòng cung cấp số điện thoại liên hệ cho đối tác.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const user = await register(
        fullName,
        email,
        password,
        accountType === "provider"
          ? {
              role: "provider",
              providerType,
              businessName: businessName.trim() || fullName,
              phone: phone.trim(),
            }
          : { role: "customer" },
      );
      onSuccess(user);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="account-type-switch" role="group" aria-label="Chọn loại tài khoản">
        <button
          type="button"
          onClick={() => setAccountType("user")}
          aria-pressed={accountType === "user"}
          data-active={accountType === "user"}
          data-variant="user"
          className="account-type-option"
        >
          <span className="opt-icon"><User size={17} aria-hidden="true" /></span>
          <span className="opt-text"><span className="opt-title">Cá nhân</span><span className="opt-sub">Đặt món, xe, khám</span></span>
        </button>
        <button
          type="button"
          onClick={() => setAccountType("provider")}
          aria-pressed={accountType === "provider"}
          data-active={accountType === "provider"}
          data-variant="provider"
          className="account-type-option"
        >
          <span className="opt-icon"><Store size={17} aria-hidden="true" /></span>
          <span className="opt-text"><span className="opt-title">Đối tác</span><span className="opt-sub">Kinh doanh cùng X-One</span></span>
        </button>
      </div>

      {accountType === "user" ? (
        <GoogleSignInButton pending={pending} text="Đăng ký bằng Google" />
      ) : (
        <p className="provider-notice" role="note">
          <Info size={15} aria-hidden="true" />
          <span>Hoàn tất hồ sơ 3 bước bên dưới — bạn có thể liên kết Google sau.</span>
        </p>
      )}

      <form onSubmit={submit}>
        {accountType === "provider" ? (
          <div className="provider-steps">
            {/* Bước 1: Chọn lĩnh vực */}
            <div className="provider-step">
              <div className="provider-step-header">
                <span className="provider-step-title">
                  <span className="provider-step-badge">1</span>
                  Lĩnh vực hợp tác
                </span>
                <p className="provider-step-desc">Chọn mô hình kinh doanh bạn muốn hợp tác cùng X-One</p>
              </div>
              <div className="provider-type-grid" role="group" aria-label="Chọn lĩnh vực đối tác">
                <button
                  type="button"
                  onClick={() => setProviderType("ride_driver")}
                  aria-pressed={providerType === "ride_driver"}
                  data-active={providerType === "ride_driver"}
                  data-tone="ride"
                  className="provider-type-option"
                >
                  <span className="tone-icon"><Car size={16} aria-hidden="true" /></span>
                  <span className="tone-body">
                    <span className="tone-title">Di chuyển</span>
                    <span className="tone-sub">Tài xế xe</span>
                  </span>
                  <span className="tone-check" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                </button>
                <button
                  type="button"
                  onClick={() => setProviderType("restaurant_merchant")}
                  aria-pressed={providerType === "restaurant_merchant"}
                  data-active={providerType === "restaurant_merchant"}
                  data-tone="food"
                  className="provider-type-option"
                >
                  <span className="tone-icon"><UtensilsCrossed size={16} aria-hidden="true" /></span>
                  <span className="tone-body">
                    <span className="tone-title">Ẩm thực</span>
                    <span className="tone-sub">Quán ăn, F&B</span>
                  </span>
                  <span className="tone-check" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                </button>
                <button
                  type="button"
                  onClick={() => setProviderType("healthcare_doctor")}
                  aria-pressed={providerType === "healthcare_doctor"}
                  data-active={providerType === "healthcare_doctor"}
                  data-tone="health"
                  className="provider-type-option"
                >
                  <span className="tone-icon"><HeartPulse size={16} aria-hidden="true" /></span>
                  <span className="tone-body">
                    <span className="tone-title">Y tế</span>
                    <span className="tone-sub">Phòng khám</span>
                  </span>
                  <span className="tone-check" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                </button>
              </div>
            </div>

            {/* Bước 2: Thông tin cơ sở kinh doanh */}
            <div className="provider-step">
              <div className="provider-step-header">
                <span className="provider-step-title">
                  <span className="provider-step-badge">2</span>
                  Thông tin cơ sở kinh doanh
                </span>
                <p className="provider-step-desc">Tên thương hiệu và số điện thoại liên hệ xác minh</p>
              </div>
              <div className="auth-fields-grid">
                <Field
                  label="Tên cơ sở kinh doanh"
                  id="register-business-name"
                  value={businessName}
                  onChange={setBusinessName}
                  placeholder="VD: Cơm Tấm Sài Gòn..."
                />
                <Field
                  label="Số điện thoại liên hệ"
                  id="register-phone"
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  autoComplete="tel"
                  placeholder="VD: 0912 345 678"
                  required
                />
              </div>
            </div>

            {/* Bước 3: Tài khoản quản trị */}
            <div className="provider-step">
              <div className="provider-step-header">
                <span className="provider-step-title">
                  <span className="provider-step-badge">3</span>
                  Tài khoản quản trị
                </span>
                <p className="provider-step-desc">Thông tin người đại diện để đăng nhập cổng vận hành</p>
              </div>
              <div className="auth-fields-grid">
                <Field
                  label="Họ tên người đại diện"
                  id="register-name"
                  value={fullName}
                  onChange={setFullName}
                  autoComplete="name"
                  placeholder="Nguyễn Văn An"
                  required
                />
                <Field
                  label="Email"
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                  placeholder="ban@example.com"
                  required
                />
              </div>
              <div className="auth-fields-grid">
                <PasswordField
                  id="register-password"
                  label="Mật khẩu"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  placeholder="Tối thiểu 8 ký tự"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                />
                <PasswordField
                  id="register-confirm-password"
                  label="Xác nhận mật khẩu"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                />
              </div>
              <p className="field-hint">{PASSWORD_POLICY_HINT}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-fields-grid">
              <Field
                label="Họ và tên"
                id="register-name"
                value={fullName}
                onChange={setFullName}
                autoComplete="name"
                placeholder="Nguyễn Văn An"
                required
              />
              <Field
                label="Email"
                id="register-email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                placeholder="ban@example.com"
                required
              />
            </div>
            <div className="auth-fields-grid">
              <PasswordField
                id="register-password"
                label="Mật khẩu"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                placeholder="Tối thiểu 8 ký tự"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
              />
              <PasswordField
                id="register-confirm-password"
                label="Xác nhận mật khẩu"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
              />
            </div>
            <p className="field-hint">{PASSWORD_POLICY_HINT}</p>
          </>
        )}

        <FormFeedback error={error} />
        <Button className="button-wide button-primary" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="spinner" size={17} /> : <ShieldCheck size={17} />}
          {pending ? "Đang xử lý đăng ký…" : accountType === "provider" ? "Đăng ký làm Đối tác X-One" : "Tạo tài khoản"}
        </Button>
      </form>
      <p className="auth-switch">
        Đã có tài khoản?{" "}
        <button type="button" onClick={onSwitch}>
          Đăng nhập
        </button>
      </p>
    </>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="KHÔI PHỤC TRUY CẬP"
      title="Quên mật khẩu?"
      intro="Nhập email tài khoản của bạn để nhận hướng dẫn đặt lại mật khẩu an toàn."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
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

  return sent ? (
    <div className="auth-success" role="status">
      <Mail size={22} aria-hidden="true" />
      <h2>Đã gửi liên kết khôi phục</h2>
      <p>
        Mở email của bạn, bấm vào liên kết trong thư để đặt lại mật khẩu, rồi quay lại đây đăng nhập.
      </p>
      <Link className="button button-primary button-wide" href="/?auth=login">
        Quay lại đăng nhập
      </Link>
    </div>
  ) : (
    <form onSubmit={submit}>
      <Field label="Email" id="forgot-email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
      <FormFeedback error={error} />
      <Button className="button-wide button-primary" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="spinner" size={17} /> : <Mail size={17} />}
        {pending ? "Đang gửi yêu cầu…" : "Gửi yêu cầu"}
      </Button>
      <p className="auth-switch">
        Nhớ mật khẩu rồi? <Link href="/?auth=login">Đăng nhập</Link>
      </p>
    </form>
  );
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

  return (
    <AuthCard
      eyebrow="MẬT KHẨU MỚI"
      title="Đặt lại mật khẩu"
      intro={`Chọn mật khẩu mới, ${PASSWORD_POLICY_HINT.toLowerCase()}`}
    >
      {success ? (
        <div className="auth-success" role="status">
          <ShieldCheck size={22} aria-hidden="true" />
          <h2>Mật khẩu đã được cập nhật thành công</h2>
          <p>Phiên đăng nhập cũ đã được kết thúc. Đang chuyển hướng bạn về trang đăng nhập…</p>
          <Link className="button button-primary button-wide" href="/?auth=login">
            Đăng nhập ngay
          </Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <PasswordField id="reset-password" label="Mật khẩu mới" value={password} onChange={setPassword} autoComplete="new-password" disabled={!token} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          <PasswordField id="reset-confirm-password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={!token} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          <p className="field-hint">{PASSWORD_POLICY_HINT}</p>
          <FormFeedback error={error} />
          <Button className="button-wide button-primary" disabled={pending || !token} type="submit">
            {pending ? <LoaderCircle className="spinner" size={17} /> : <LockKeyhole size={17} />}
            {pending ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function AuthHero({
  title = "Một tài khoản, xong cả xe, món và lịch khám.",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="auth-hero" aria-hidden="true">
      <div className="auth-hero-top">
        <span className="auth-hero-brand">
          <span className="auth-hero-mark"><XOneMark size={20} /></span>
          X-One
        </span>
      </div>
      <div className="auth-hero-body">
        <h2 className="auth-hero-title">{title}</h2>
        {subtitle && <p className="auth-hero-sub">{subtitle}</p>}
      </div>
      <ul className="auth-hero-services" aria-label="Các dịch vụ X-One">
        <li>
          <span className="auth-hero-icon" data-tone="ride"><Car size={15} aria-hidden="true" /></span>
          <span><strong>Xe</strong> — Đặt xe trong 1 chạm</span>
        </li>
        <li>
          <span className="auth-hero-icon" data-tone="food"><UtensilsCrossed size={15} aria-hidden="true" /></span>
          <span><strong>Món</strong> — Quán chuẩn vị gần bạn</span>
        </li>
        <li>
          <span className="auth-hero-icon" data-tone="health"><HeartPulse size={15} aria-hidden="true" /></span>
          <span><strong>Khám</strong> — Bác sĩ tận tâm chu đáo</span>
        </li>
      </ul>
    </div>
  );
}

function AuthCard({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <AuthHero />
      <article className="auth-card">
        <div className="auth-card-heading">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1 id="auth-title">{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {children}
      </article>
    </section>
  );
}

function fieldIconFor(id: string, type: string) {
  if (type === "email") return <Mail size={17} aria-hidden="true" />;
  if (type === "tel") return <Phone size={17} aria-hidden="true" />;
  if (id.includes("business")) return <Store size={17} aria-hidden="true" />;
  if (id.includes("phone")) return <Phone size={17} aria-hidden="true" />;
  if (id.includes("name")) return <User size={17} aria-hidden="true" />;
  return <User size={17} aria-hidden="true" />;
}

const FLAT_INPUT_STYLE = { border: 0, background: "transparent", boxShadow: "none", height: "40px", padding: "0 8px 0 0", borderRadius: 0 } as const;

function Field({ label, id, value, onChange, type = "text", autoComplete, required = false, placeholder, icon }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; required?: boolean; placeholder?: string; icon?: ReactNode }) {
  return (
    <div className="form-field">
      <Label htmlFor={id}>{label}</Label>
      <span className="field-control">
        <span className="field-icon">{icon ?? fieldIconFor(id, type)}</span>
        <Input id={id} name={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required={required} placeholder={placeholder} style={{ ...FLAT_INPUT_STYLE }} />
      </span>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, disabled = false, minLength, maxLength, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; disabled?: boolean; minLength?: number; maxLength?: number; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="form-field">
      <Label htmlFor={id}>{label}</Label>
      <span className="password-input">
        <span className="field-icon"><LockKeyhole size={16} aria-hidden="true" /></span>
        <Input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} required disabled={disabled} placeholder={placeholder} style={{ ...FLAT_INPUT_STYLE }} />
        <button type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisible((state) => !state)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </span>
    </div>
  );
}

function FormFeedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="form-error" role="alert" aria-live="polite">{error}</p>;
  if (message) return <p className="form-notice" role="status" aria-live="polite">{message}</p>;
  return <p className="form-feedback-placeholder" aria-live="polite" />;
}
