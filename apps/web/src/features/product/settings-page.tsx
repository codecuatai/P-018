"use client";

import { ChevronLeft, ChevronRight, KeyRound, LoaderCircle, LogOut, MonitorCog, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
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

const SESSION_PAGE_SIZE = 5;

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

  return <section className="settings-page" aria-labelledby="settings-title"><header className="section-heading"><div><span className="eyebrow">CÀI ĐẶT</span><h1 id="settings-title">Bảo mật tài khoản</h1><p>Quản lý mật khẩu và các phiên đăng nhập đang hoạt động của {user?.email}.</p></div></header><div className="settings-stack"><article className="settings-card"><div className="settings-card-title"><KeyRound size={20} /><div><h2>Đổi mật khẩu</h2><p>Đổi mật khẩu sẽ kết thúc các phiên cũ để bảo vệ tài khoản.</p></div></div><form className="settings-form" onSubmit={submitPassword}><div className="form-field"><Label htmlFor="current-password">Mật khẩu hiện tại</Label><Input id="current-password" type="password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); if (passwordError) setPasswordError(""); }} autoComplete="current-password" aria-invalid={passwordError && passwordError.includes("hiện tại") ? "true" : undefined} aria-describedby={passwordError && passwordError.includes("hiện tại") ? "current-password-error" : undefined} required />{passwordError && passwordError.includes("hiện tại") ? <p id="current-password-error" className="form-error" role="alert">{passwordError}</p> : null}</div><div className="form-field"><Label htmlFor="new-password">Mật khẩu mới</Label><Input id="new-password" type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); if (passwordError && !passwordError.includes("hiện tại")) setPasswordError(""); }} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required /></div><p className="field-hint">{PASSWORD_POLICY_HINT}</p>{passwordError && !passwordError.includes("hiện tại") ? <p className="form-error" role="alert">{passwordError}</p> : null}{passwordSuccess ? <p className="form-success" role="status">{passwordSuccess}</p> : null}<Button disabled={passwordPending} type="submit">{passwordPending ? <LoaderCircle className="spinner" size={16} /> : <KeyRound size={16} />}{passwordPending ? "Đang cập nhật…" : "Đổi mật khẩu"}</Button></form></article><article className="settings-card"><div className="settings-card-title"><MonitorCog size={20} /><div><h2>Phiên đang hoạt động</h2><p>Chỉ những phiên tài khoản của bạn mới xuất hiện ở đây.</p></div></div>{sessionsError ? <div className="form-error" role="alert">{sessionsError} <button className="inline-button" type="button" onClick={() => void loadSessions()}>Thử lại</button></div> : null}{sessionsLoading ? <div className="space-y-3" aria-label="Đang tải phiên"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : sessions.length === 0 ? <div className="settings-empty"><ShieldCheck size={22} /><p>Không có phiên hoạt động khác để hiển thị.</p></div> : <><div className="session-list-summary" aria-live="polite"><span>{sessions.length} {sessions.length === 1 ? "phiên" : "phiên đăng nhập"}</span><small>Phiên hiện tại được đánh dấu để bạn dễ nhận biết.</small></div><ul className="session-list">{visibleSessions.map((session) => <li key={session.id}><div><div className="session-row-heading"><strong>{session.current ? "Thiết bị hiện tại" : "Phiên đã đăng nhập"}</strong>{session.current ? <span className="session-current-badge">Đang dùng</span> : null}</div><span>{session.user_agent || "Thiết bị không xác định"}</span><small>Hoạt động {formatSessionTime(session.last_used_at)} · Hết hạn {formatSessionTime(session.expires_at)}</small></div><Button variant="destructive" size="sm" type="button" onClick={() => void revoke(session.id, session.current)} disabled={Boolean(actionPending)}>{actionPending === session.id ? <LoaderCircle className="spinner" size={15} /> : null}{session.current ? "Đăng xuất" : "Thu hồi"}</Button></li>)}</ul>{sessionPageCount > 1 ? <nav className="session-pagination" aria-label="Phân trang phiên đăng nhập"><button className="button button-secondary" type="button" onClick={() => setSessionPage((page) => Math.max(1, page - 1))} disabled={sessionPage === 1 || Boolean(actionPending)}><ChevronLeft size={16} /> Trước</button><span aria-live="polite">Trang {sessionPage} / {sessionPageCount} · {sessions.length} phiên</span><button className="button button-secondary" type="button" onClick={() => setSessionPage((page) => Math.min(sessionPageCount, page + 1))} disabled={sessionPage === sessionPageCount || Boolean(actionPending)}>Sau <ChevronRight size={16} /></button></nav> : null}</>}<AlertDialog><AlertDialogTrigger asChild><Button variant="secondary" type="button" disabled={Boolean(actionPending)}><LogOut size={16} />Đăng xuất khỏi tất cả thiết bị</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle className="text-lg font-bold">Đăng xuất khỏi tất cả thiết bị?</AlertDialogTitle><AlertDialogDescription className="mt-2 block leading-6 text-[color:var(--color-muted)]">Mọi phiên đăng nhập đang hoạt động của bạn sẽ được kết thúc. Bạn có thể đăng nhập lại bằng mật khẩu của mình.</AlertDialogDescription><div className="mt-6 flex justify-end gap-3"><AlertDialogCancel asChild><Button variant="secondary">Hủy</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" onClick={() => void handleLogoutAll()}>{actionPending === "all" ? <LoaderCircle className="spinner" size={16} /> : <LogOut size={16} />}Đăng xuất tất cả</Button></AlertDialogAction></div></AlertDialogContent></AlertDialog></article></div></section>;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "không xác định" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
