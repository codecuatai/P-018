"use client";

import { Check, ChevronLeft, ChevronRight, Copy, KeyRound, LoaderCircle, LogOut, MonitorCog, Shield, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { changePassword, disable2FA, errorText, getSessions, logoutAll as apiLogoutAll, revokeSession, setup2FA, verify2FA, type TwoFactorSetupResult } from "@/lib/api-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HINT, validatePasswordPolicy } from "@/lib/password-policy";
import { useAuth } from "@/providers/auth-provider";
import type { AuthSessionSummary } from "@/types";

const SESSION_PAGE_SIZE = 5;

// ─── 2FA TOTP Setup ──────────────────────────────────────────────────────────

export function TwoFactorSetup() {
  const [status, setStatus] = useState<"disabled" | "setup" | "enabled">("disabled");
  const [setupData, setSetupData] = useState<TwoFactorSetupResult | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  // Disable 2FA dialog state
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState("");

  async function handleStartSetup() {
    setLoading(true);
    setError("");
    setFeedback("");
    try {
      const data = await setup2FA();
      setSetupData(data);
      setStatus("setup");
      setCode("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.trim().replace(/\s+/g, "");
    if (!cleanCode || cleanCode.length !== 6 || loading) {
      setError("Vui lòng nhập đầy đủ mã xác thực 6 chữ số.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await verify2FA(cleanCode);
      setStatus("enabled");
      const codes = result.backup_codes?.length ? result.backup_codes : (setupData?.backup_codes ?? []);
      setBackupCodes(codes);
      setFeedback("Xác thực 2 bước đã được kích hoạt thành công!");
      setCode("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disablePassword.trim() || disabling) {
      setDisableError("Vui lòng nhập mật khẩu hiện tại.");
      return;
    }
    setDisabling(true);
    setDisableError("");
    try {
      await disable2FA(disablePassword);
      setStatus("disabled");
      setSetupData(null);
      setBackupCodes([]);
      setDisableDialogOpen(false);
      setDisablePassword("");
      setFeedback("Đã tắt xác thực 2 bước cho tài khoản.");
    } catch (err) {
      setDisableError(errorText(err));
    } finally {
      setDisabling(false);
    }
  }

  function copyBackupCodes() {
    if (!backupCodes.length) return;
    void navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function copySecret() {
    if (!setupData?.secret) return;
    void navigator.clipboard.writeText(setupData.secret);
    setSecretCopied(true);
    window.setTimeout(() => setSecretCopied(false), 2000);
  }

  return (
    <article className="settings-card two-factor-section">
      <div className="settings-card-title">
        <Smartphone size={20} />
        <div>
          <h2>Bảo mật nâng cao</h2>
          <p>Bảo vệ tài khoản bằng mã xác thực 2 bước (TOTP).</p>
        </div>
      </div>

      {feedback ? <p className="form-success" role="status">{feedback}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {status === "disabled" ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-[color:var(--color-muted)]">
            Xác thực 2 bước bổ sung một lớp bảo mật khi đăng nhập bằng cách yêu cầu mã 6 số từ ứng dụng như Google Authenticator hoặc Microsoft Authenticator.
          </p>
          <Button type="button" onClick={() => void handleStartSetup()} disabled={loading}>
            {loading ? <LoaderCircle className="spinner" size={16} /> : <Shield size={16} />}
            {loading ? "Đang khởi tạo…" : "Bật xác thực 2 bước"}
          </Button>
        </div>
      ) : null}

      {status === "setup" && setupData ? (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-[color:var(--color-muted)]">
            1. Quét mã QR này bằng ứng dụng xác thực của bạn (Google Authenticator, Authy, v.v.):
          </p>

          <div className="two-factor-qr">
            <img
              src={setupData.qr_code_url}
              alt="Mã QR cấu hình 2FA"
              width={180}
              height={180}
            />
          </div>

          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 text-xs">
            <span className="block font-medium text-[color:var(--color-muted)] mb-1">
              Hoặc nhập mã bí mật thủ công:
            </span>
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-sm font-semibold tracking-wider text-[color:var(--color-ink)]">
                {setupData.secret}
              </code>
              <Button variant="secondary" size="sm" type="button" onClick={copySecret}>
                {secretCopied ? <Check size={14} /> : <Copy size={14} />}
                {secretCopied ? "Đã chép" : "Sao chép"}
              </Button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleVerify}>
            <div className="form-field">
              <Label htmlFor="two-factor-code">
                2. Nhập mã 6 chữ số từ ứng dụng:
              </Label>
              <Input
                id="two-factor-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="max-w-[200px] text-center font-mono text-lg tracking-widest"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading || code.trim().length !== 6}>
                {loading ? <LoaderCircle className="spinner" size={16} /> : <ShieldCheck size={16} />}
                {loading ? "Đang xác thực…" : "Kích hoạt 2FA"}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => { setStatus("disabled"); setSetupData(null); setError(""); }}
                disabled={loading}
              >
                Hủy
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {status === "enabled" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong className="block text-sm text-emerald-900">
                  Xác thực 2 bước đang hoạt động
                </strong>
                <span className="text-xs text-emerald-700">
                  Tài khoản của bạn được bảo vệ bởi mã TOTP khi đăng nhập.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[color:var(--color-muted)]">Đã bật ·</span>
              <button
                type="button"
                className="text-xs font-semibold text-[color:var(--color-danger)] underline hover:text-red-700 cursor-pointer"
                onClick={() => { setDisableDialogOpen(true); setDisablePassword(""); setDisableError(""); }}
              >
                [Tắt 2FA]
              </button>
            </div>
          </div>

          {backupCodes.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-[color:var(--color-border)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
                    Mã dự phòng (Backup Codes)
                  </h3>
                  <p className="text-xs text-[color:var(--color-muted)]">
                    Lưu các mã này ở nơi an toàn. Mỗi mã chỉ dùng được một lần nếu bạn mất thiết bị.
                  </p>
                </div>
                <Button variant="secondary" size="sm" type="button" onClick={copyBackupCodes}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Đã sao chép" : "Sao chép tất cả"}
                </Button>
              </div>

              <div className="backup-codes-grid">
                {backupCodes.map((c, i) => (
                  <code key={`${c}-${i}`}>{c}</code>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Dialog for disabling 2FA */}
      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-bold">Tắt xác thực 2 bước?</DialogTitle>
          <DialogDescription className="mt-2 block leading-6 text-[color:var(--color-muted)]">
            Nhập mật khẩu hiện tại của bạn để xác nhận tắt tính năng bảo vệ 2 bước.
          </DialogDescription>
          <form className="mt-4 space-y-4" onSubmit={handleDisable}>
            <div className="form-field">
              <Label htmlFor="disable-2fa-password">Mật khẩu hiện tại</Label>
              <Input
                id="disable-2fa-password"
                type="password"
                value={disablePassword}
                onChange={(e) => { setDisablePassword(e.target.value); if (disableError) setDisableError(""); }}
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            {disableError ? <p className="form-error" role="alert">{disableError}</p> : null}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDisableDialogOpen(false)}
                disabled={disabling}
              >
                Hủy
              </Button>
              <Button variant="destructive" type="submit" disabled={disabling || !disablePassword.trim()}>
                {disabling ? <LoaderCircle className="spinner" size={16} /> : <ShieldAlert size={16} />}
                {disabling ? "Đang xử lý…" : "Xác nhận tắt 2FA"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}

// ─── SettingsPage ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user, login, logout } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [actionPending, setActionPending] = useState("");
  const [sessionPage, setSessionPage] = useState(1);

  const sessionPageCount = Math.max(1, Math.ceil(sessions.length / SESSION_PAGE_SIZE));
  const visibleSessions = sessions.slice((sessionPage - 1) * SESSION_PAGE_SIZE, sessionPage * SESSION_PAGE_SIZE);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true); setSessionsError("");
    try { setSessions((await getSessions()).items); setSessionPage(1); } catch (error) { setSessionsError(errorText(error)); } finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordError(""); setPasswordSuccess("");
    const validation = validatePasswordPolicy(newPassword);
    if (!validation.valid) { setPasswordError(validation.error ?? "Mật khẩu không hợp lệ."); return; }
    setPasswordPending(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (error) {
      setPasswordError(errorText(error));
      setPasswordPending(false);
      return;
    }
    try {
      // Changing the password revokes the old session on the server. Create a
      // fresh session immediately so the user can continue in the chat.
      await login(user?.email ?? "", newPassword);
      setPasswordSuccess("Mật khẩu đã được cập nhật. Đang mở lại không gian chat…");
      setPasswordPending(false);
      router.replace("/app");
    } catch {
      // The password was already changed, but the automatic re-authentication
      // failed. Clear the invalid local token and provide a normal login path.
      setPasswordError("Mật khẩu đã được cập nhật nhưng chưa thể mở lại phiên chat. Bạn hãy đăng nhập lại.");
      setPasswordPending(false);
      void Promise.resolve(logout()).catch(() => undefined);
      router.replace("/");
    }
  }

  async function revoke(id: string, current: boolean) {
    setActionPending(id); setSessionsError("");
    try { await revokeSession(id); if (current) await logout(); else await loadSessions(); } catch (error) { setSessionsError(errorText(error)); } finally { setActionPending(""); }
  }

  async function handleLogoutAll() {
    setActionPending("all");
    try { await apiLogoutAll(); await logout(); } catch (error) { setSessionsError(errorText(error)); } finally { setActionPending(""); }
  }

  return <section className="settings-page" aria-labelledby="settings-title">
    <header className="section-heading">
      <div>
        <span className="eyebrow">CÀI ĐẶT</span>
        <h1 id="settings-title">Bảo mật tài khoản</h1>
        <p>Quản lý mật khẩu và các phiên đăng nhập đang hoạt động của {user?.email}.</p>
      </div>
    </header>
    <div className="settings-stack">
      <article className="settings-card">
        <div className="settings-card-title">
          <KeyRound size={20} />
          <div>
            <h2>Đổi mật khẩu</h2>
            <p>Đổi mật khẩu sẽ kết thúc các phiên cũ để bảo vệ tài khoản.</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={submitPassword}>
          <div className="form-field">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <Input id="current-password" type="password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); if (passwordError) setPasswordError(""); }} autoComplete="current-password" aria-invalid={passwordError && passwordError.includes("hiện tại") ? "true" : undefined} aria-describedby={passwordError && passwordError.includes("hiện tại") ? "current-password-error" : undefined} required />
            {passwordError && passwordError.includes("hiện tại") ? <p id="current-password-error" className="form-error" role="alert">{passwordError}</p> : null}
          </div>
          <div className="form-field">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); if (passwordError && !passwordError.includes("hiện tại")) setPasswordError(""); }} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required />
          </div>
          <p className="field-hint">{PASSWORD_POLICY_HINT}</p>
          {passwordError && !passwordError.includes("hiện tại") ? <p className="form-error" role="alert">{passwordError}</p> : null}
          {passwordSuccess ? <p className="form-success" role="status">{passwordSuccess}</p> : null}
          <Button disabled={passwordPending} type="submit">
            {passwordPending ? <LoaderCircle className="spinner" size={16} /> : <KeyRound size={16} />}
            {passwordPending ? "Đang cập nhật…" : "Đổi mật khẩu"}
          </Button>
        </form>
      </article>

      {/* 2FA TOTP Setup Section */}
      <TwoFactorSetup />

      <article className="settings-card">
        <div className="settings-card-title">
          <MonitorCog size={20} />
          <div>
            <h2>Phiên đang hoạt động</h2>
            <p>Chỉ những phiên tài khoản của bạn mới xuất hiện ở đây.</p>
          </div>
        </div>
        {sessionsError ? <div className="form-error" role="alert">{sessionsError} <button className="inline-button" type="button" onClick={() => void loadSessions()}>Thử lại</button></div> : null}
        {sessionsLoading ? (
          <div className="space-y-3" aria-label="Đang tải phiên">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="settings-empty">
            <ShieldCheck size={22} />
            <p>Không có phiên hoạt động khác để hiển thị.</p>
          </div>
        ) : (
          <>
            <div className="session-list-summary" aria-live="polite">
              <span>{sessions.length} {sessions.length === 1 ? "phiên" : "phiên đăng nhập"}</span>
              <small>Phiên hiện tại được đánh dấu để bạn dễ nhận biết.</small>
            </div>
            <ul className="session-list">
              {visibleSessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <div className="session-row-heading">
                      <strong>{session.current ? "Thiết bị hiện tại" : "Phiên đã đăng nhập"}</strong>
                      {session.current ? <span className="session-current-badge">Đang dùng</span> : null}
                    </div>
                    <span>{session.user_agent || "Thiết bị không xác định"}</span>
                    <small>Hoạt động {formatSessionTime(session.last_used_at)} · Hết hạn {formatSessionTime(session.expires_at)}</small>
                  </div>
                  <Button variant="destructive" size="sm" type="button" onClick={() => void revoke(session.id, session.current)} disabled={Boolean(actionPending)}>
                    {actionPending === session.id ? <LoaderCircle className="spinner" size={15} /> : null}
                    {session.current ? "Đăng xuất" : "Thu hồi"}
                  </Button>
                </li>
              ))}
            </ul>
            {sessionPageCount > 1 ? (
              <nav className="session-pagination" aria-label="Phân trang phiên đăng nhập">
                <button className="button button-secondary" type="button" onClick={() => setSessionPage((page) => Math.max(1, page - 1))} disabled={sessionPage === 1 || Boolean(actionPending)}>
                  <ChevronLeft size={16} /> Trước
                </button>
                <span aria-live="polite">Trang {sessionPage} / {sessionPageCount} · {sessions.length} phiên</span>
                <button className="button button-secondary" type="button" onClick={() => setSessionPage((page) => Math.min(sessionPageCount, page + 1))} disabled={sessionPage === sessionPageCount || Boolean(actionPending)}>
                  Sau <ChevronRight size={16} />
                </button>
              </nav>
            ) : null}
          </>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="secondary" type="button" disabled={Boolean(actionPending)}>
              <LogOut size={16} />Đăng xuất khỏi tất cả thiết bị
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle className="text-lg font-bold">Đăng xuất khỏi tất cả thiết bị?</AlertDialogTitle>
            <AlertDialogDescription className="mt-2 block leading-6 text-[color:var(--color-muted)]">
              Mọi phiên đăng nhập đang hoạt động của bạn sẽ được kết thúc. Bạn có thể đăng nhập lại bằng mật khẩu của mình.
            </AlertDialogDescription>
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialogCancel asChild>
                <Button variant="secondary">Hủy</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant="destructive" onClick={() => void handleLogoutAll()}>
                  {actionPending === "all" ? <LoaderCircle className="spinner" size={16} /> : <LogOut size={16} />}
                  Đăng xuất tất cả
                </Button>
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </article>
    </div>
  </section>;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "không xác định" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
