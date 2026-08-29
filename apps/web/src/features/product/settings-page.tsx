"use client";

import { KeyRound, LoaderCircle, LogOut, MonitorCog, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { changePassword, errorText, getSessions, logoutAll as apiLogoutAll, revokeSession } from "@/lib/api-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HINT, validatePasswordPolicy } from "@/lib/password-policy";
import { useAuth } from "@/providers/auth-provider";
import type { AuthSessionSummary } from "@/types";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [actionPending, setActionPending] = useState("");

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true); setSessionsError("");
    try { setSessions((await getSessions()).items); } catch (error) { setSessionsError(errorText(error)); } finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordError(""); setPasswordSuccess("");
    const validation = validatePasswordPolicy(newPassword);
    if (!validation.valid) { setPasswordError(validation.error ?? "Mật khẩu không hợp lệ."); return; }
    setPasswordPending(true);
    try { await changePassword(currentPassword, newPassword); setPasswordSuccess("Mật khẩu đã được cập nhật. Bạn cần đăng nhập lại để tiếp tục."); await logout(); } catch (error) { setPasswordError(errorText(error)); } finally { setPasswordPending(false); }
  }

  async function revoke(id: string, current: boolean) {
    setActionPending(id); setSessionsError("");
    try { await revokeSession(id); if (current) await logout(); else await loadSessions(); } catch (error) { setSessionsError(errorText(error)); } finally { setActionPending(""); }
  }

  async function handleLogoutAll() {
    setActionPending("all");
    try { await apiLogoutAll(); await logout(); } catch (error) { setSessionsError(errorText(error)); } finally { setActionPending(""); }
  }

  const currentPasswordError = passwordError.includes("hiện tại") ? passwordError : "";

  return <section className="settings-page" aria-labelledby="settings-title">
    <header className="section-heading"><div><span className="eyebrow">CÀI ĐẶT</span><h1 id="settings-title">Bảo mật tài khoản</h1><p>Quản lý mật khẩu và các phiên đăng nhập đang hoạt động của {user?.email}.</p></div></header>
    <div className="settings-stack">
      <article className="settings-card">
        <div className="settings-card-title"><KeyRound size={20} /><div><h2>Đổi mật khẩu</h2><p>Đổi mật khẩu sẽ kết thúc các phiên cũ để bảo vệ tài khoản.</p></div></div>
        <form className="settings-form" onSubmit={submitPassword}>
          <div className="form-field"><Label htmlFor="current-password">Mật khẩu hiện tại</Label><Input id="current-password" type="password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); if (passwordError) setPasswordError(""); }} autoComplete="current-password" aria-invalid={currentPasswordError ? "true" : undefined} aria-describedby={currentPasswordError ? "current-password-error" : undefined} required />{currentPasswordError ? <p id="current-password-error" className="form-error" role="alert">{currentPasswordError}</p> : null}</div>
          <div className="form-field"><Label htmlFor="new-password">Mật khẩu mới</Label><Input id="new-password" type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); if (passwordError && !passwordError.includes("hiện tại")) setPasswordError(""); }} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required /></div>
          <p className="field-hint">{PASSWORD_POLICY_HINT}</p>
          {passwordError && !currentPasswordError ? <p className="form-error" role="alert">{passwordError}</p> : null}
          {passwordSuccess ? <p className="form-success" role="status">{passwordSuccess}</p> : null}
          <Button disabled={passwordPending} type="submit">{passwordPending ? <LoaderCircle className="spinner" size={16} /> : <KeyRound size={16} />}{passwordPending ? "Đang cập nhật…" : "Đổi mật khẩu"}</Button>
        </form>
      </article>
      <article className="settings-card">
        <div className="settings-card-title"><MonitorCog size={20} /><div><h2>Phiên đang hoạt động</h2><p>Chỉ những phiên tài khoản của bạn mới xuất hiện ở đây.</p></div></div>
        {sessionsError ? <div className="form-error" role="alert">{sessionsError} <button className="inline-button" type="button" onClick={() => void loadSessions()}>Thử lại</button></div> : null}
        {sessionsLoading ? <div className="space-y-3" aria-label="Đang tải phiên"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : sessions.length === 0 ? <div className="settings-empty"><ShieldCheck size={22} /><p>Không có phiên hoạt động khác để hiển thị.</p></div> : <ul className="session-list">{sessions.map((session) => <li key={session.id}><div><strong>{session.current ? "Thiết bị hiện tại" : "Phiên đã đăng nhập"}</strong><span>{session.user_agent || "Thiết bị không xác định"}</span><small>Hoạt động {formatSessionTime(session.last_used_at)} · Hết hạn {formatSessionTime(session.expires_at)}</small></div><Button variant="destructive" size="sm" type="button" onClick={() => void revoke(session.id, session.current)} disabled={Boolean(actionPending)}>{actionPending === session.id ? <LoaderCircle className="spinner" size={15} /> : null}{session.current ? "Đăng xuất" : "Thu hồi"}</Button></li>)}</ul>}
        <AlertDialog><AlertDialogTrigger asChild><Button variant="secondary" type="button" disabled={Boolean(actionPending)}><LogOut size={16} />Đăng xuất khỏi tất cả thiết bị</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle className="text-lg font-bold">Đăng xuất khỏi tất cả thiết bị?</AlertDialogTitle><AlertDialogDescription className="mt-2 block leading-6 text-[color:var(--color-muted)]">Mọi phiên đăng nhập đang hoạt động của bạn sẽ được kết thúc. Bạn có thể đăng nhập lại bằng mật khẩu của mình.</AlertDialogDescription><div className="mt-6 flex justify-end gap-3"><AlertDialogCancel asChild><Button variant="secondary">Hủy</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" onClick={() => void handleLogoutAll()}>{actionPending === "all" ? <LoaderCircle className="spinner" size={16} /> : <LogOut size={16} />}Đăng xuất tất cả</Button></AlertDialogAction></div></AlertDialogContent></AlertDialog>
      </article>
    </div>
  </section>;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "không xác định" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
