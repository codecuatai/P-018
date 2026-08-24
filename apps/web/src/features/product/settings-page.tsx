"use client";

import { KeyRound, LoaderCircle, LogOut, MonitorCog, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { changePassword, errorText, getSessions, logoutAll as apiLogoutAll, revokeSession } from "@/lib/api-client";
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
    if (Array.from(newPassword).length < 8) { setPasswordError("Dùng mật khẩu hoặc cụm mật khẩu từ 8 ký tự trở lên."); return; }
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

  return (
    <section className="w-full flex flex-col gap-6" aria-labelledby="settings-title">
      <header className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">CÀI ĐẶT</span>
        <h1 id="settings-title" className="text-2xl font-bold text-slate-900 tracking-tight">Bảo mật tài khoản</h1>
        <p className="text-sm font-medium text-slate-500">Quản lý mật khẩu và các phiên đăng nhập đang hoạt động của {user?.email}.</p>
      </header>

      <div className="flex flex-col gap-6">
        <article className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">Đổi mật khẩu</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Đổi mật khẩu sẽ kết thúc các phiên cũ để bảo vệ tài khoản.</p>
            </div>
          </div>
          
          <form className="flex flex-col gap-5" onSubmit={submitPassword}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password" className="text-xs font-bold text-slate-700">Mật khẩu hiện tại</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required className="bg-slate-50 border-slate-200 rounded-xl h-11 focus-visible:ring-blue-600/20 focus-visible:border-blue-600" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password" className="text-xs font-bold text-slate-700">Mật khẩu mới</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required className="bg-slate-50 border-slate-200 rounded-xl h-11 focus-visible:ring-blue-600/20 focus-visible:border-blue-600" />
            </div>
            <p className="text-[11px] font-medium text-slate-400">Dùng mật khẩu hoặc cụm mật khẩu từ 15 ký tự trở lên.</p>
            
            {passwordError ? <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100" role="alert">{passwordError}</p> : null}
            {passwordSuccess ? <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100" role="status">{passwordSuccess}</p> : null}
            
            <div className="mt-2">
              <Button disabled={passwordPending} type="submit" className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold active:scale-95 transition-all shadow-sm shadow-blue-600/20 h-11 px-6">
                {passwordPending ? <LoaderCircle className="animate-spin mr-2" size={16} /> : <KeyRound className="mr-2" size={16} />}
                {passwordPending ? "Đang cập nhật…" : "Đổi mật khẩu"}
              </Button>
            </div>
          </form>
        </article>

        <article className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <MonitorCog size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">Phiên đang hoạt động</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Chỉ những phiên tài khoản của bạn mới xuất hiện ở đây.</p>
            </div>
          </div>

          {sessionsError ? (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-6 flex flex-col items-start gap-2" role="alert">
              <span className="text-sm font-semibold text-red-600">{sessionsError}</span>
              <button className="text-xs font-bold text-red-700 hover:underline" type="button" onClick={() => void loadSessions()}>Thử lại</button>
            </div>
          ) : null}

          {sessionsLoading ? (
            <div className="space-y-3" aria-label="Đang tải phiên">
              <Skeleton className="h-16 w-full rounded-2xl bg-slate-100" />
              <Skeleton className="h-16 w-full rounded-2xl bg-slate-100" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
              <ShieldCheck size={32} strokeWidth={1.5} />
              <p className="text-sm font-medium">Không có phiên hoạt động khác để hiển thị.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3 mb-6">
              {sessions.map((session) => (
                <li key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
                  <div className="flex flex-col gap-0.5">
                    <strong className={`text-sm font-bold ${session.current ? "text-blue-700" : "text-slate-900"}`}>{session.current ? "Thiết bị hiện tại" : "Phiên đã đăng nhập"}</strong>
                    <span className="text-sm font-medium text-slate-600 truncate">{session.user_agent || "Thiết bị không xác định"}</span>
                    <small className="text-[11px] font-medium text-slate-400 mt-1">Hoạt động {formatSessionTime(session.last_used_at)} · Hết hạn {formatSessionTime(session.expires_at)}</small>
                  </div>
                  <Button variant="destructive" size="sm" type="button" className="rounded-xl font-bold shrink-0" onClick={() => void revoke(session.id, session.current)} disabled={Boolean(actionPending)}>
                    {actionPending === session.id ? <LoaderCircle className="animate-spin mr-2" size={15} /> : null}
                    {session.current ? "Đăng xuất" : "Thu hồi"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary" type="button" className="rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 h-11 px-6" disabled={Boolean(actionPending)}>
                  <LogOut size={16} className="mr-2" />
                  Đăng xuất khỏi tất cả thiết bị
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl border-slate-200/60 p-6 shadow-2xl">
                <AlertDialogTitle className="text-xl font-bold text-slate-900">Đăng xuất khỏi tất cả thiết bị?</AlertDialogTitle>
                <AlertDialogDescription className="text-sm font-medium text-slate-500 mt-2">
                  Mọi phiên đăng nhập đang hoạt động của bạn sẽ được kết thúc. Bạn có thể đăng nhập lại bằng mật khẩu của mình.
                </AlertDialogDescription>
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialogCancel asChild>
                    <Button variant="secondary" className="rounded-xl font-bold h-11 px-6">Hủy</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button variant="destructive" className="rounded-xl font-bold h-11 px-6" onClick={() => void handleLogoutAll()}>
                      {actionPending === "all" ? <LoaderCircle className="animate-spin mr-2" size={16} /> : <LogOut className="mr-2" size={16} />}
                      Đăng xuất tất cả
                    </Button>
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </article>
      </div>
    </section>
  );
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "không xác định" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
