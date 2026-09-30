"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { WifiOff } from "lucide-react";

import { useAuth } from "@/providers/auth-provider";

function LoadingState({ children, recoverable = false }: { children: ReactNode; recoverable?: boolean }) {
  if (recoverable) {
    return <main className="screen-loading screen-loading-recoverable" role="alert" aria-live="assertive"><section className="session-recovery-card"><span className="session-recovery-icon" aria-hidden="true"><WifiOff size={20} /></span><div className="session-recovery-copy"><p className="eyebrow">KẾT NỐI TẠM GIÁN ĐOẠN</p><h1>Chưa thể kết nối không gian của bạn.</h1><p>Phiên đăng nhập vẫn được giữ an toàn. Hãy thử kết nối lại.</p>{children}</div></section></main>;
  }
  return <main className="screen-loading" role="status" aria-live="polite"><span className="loading-mark" />{children}</main>;
}

function SessionRetry({ retrySession }: { retrySession: () => void }) {
  return <LoadingState recoverable><button className="button button-primary session-retry-button" type="button" onClick={retrySession}>Thử kết nối lại</button></LoadingState>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retrySession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") ? `/?auth=login&next=${encodeURIComponent(pathname)}&reason=session_expired` : "/?auth=login&reason=session_expired";
      router.replace(next);
    }
  }, [pathname, router, status]);
  if (status === "loading") return <LoadingState>Đang khôi phục phiên…</LoadingState>;
  if (status === "recoverable") return <SessionRetry retrySession={retrySession} />;
  if (status !== "authenticated") return <LoadingState>Đang chuyển tới đăng nhập…</LoadingState>;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") {
      const dest =
        user?.role === "admin" || user?.role === "manager"
          ? "/admin"
          : user?.role === "provider"
          ? "/app/provider"
          : user?.onboarding_completed_at || user?.authentication_kind === "demo"
          ? "/app"
          : "/app/onboarding";
      router.replace(dest);
    }
  }, [router, status, user]);
  if (status === "loading") return <LoadingState>Đang mở X-One…</LoadingState>;
  if (status === "authenticated") return <LoadingState>Đang chuyển tới không gian của bạn…</LoadingState>;
  return <>{children}</>;
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isOnboarding = pathname === "/app/onboarding";
  const isProviderRoute = pathname === "/app/provider" || pathname?.startsWith("/app/provider/");
  const isStaff = user?.role === "admin" || user?.role === "manager";
  const isProvider = user?.role === "provider";
  const needsOnboarding = Boolean(user && !isStaff && !isProvider && !user.onboarding_completed_at && user.authentication_kind !== "demo");

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    // Strictly isolate roles: Staff to /admin, Provider to /app/provider
    if (isStaff && !isProviderRoute) {
      router.replace("/admin");
      return;
    }
    if (isProvider && !isProviderRoute) {
      router.replace("/app/provider");
      return;
    }
    if (needsOnboarding && !isOnboarding && !isProviderRoute) {
      router.replace("/app/onboarding");
      return;
    }
    if (!needsOnboarding && isOnboarding) {
      router.replace("/app");
    }
  }, [isOnboarding, isProvider, isProviderRoute, isStaff, needsOnboarding, router, status, user]);

  if (status === "loading") return <LoadingState>Đang chuẩn bị không gian làm việc…</LoadingState>;
  if (status === "authenticated") {
    if (isStaff && !isProviderRoute) return <LoadingState>Đang chuyển tới Bảng điều khiển Quản trị…</LoadingState>;
    if (isProvider && !isProviderRoute) return <LoadingState>Đang chuyển tới Cổng Đối Tác…</LoadingState>;
    if (needsOnboarding !== isOnboarding && !isProviderRoute) return <LoadingState>Đang mở bước thiết lập đầu tiên…</LoadingState>;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user, retrySession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") ? `/?auth=login&next=${encodeURIComponent(pathname)}&reason=session_expired` : "/?auth=login&next=%2Fadmin&reason=session_expired";
      router.replace(next);
    }
  }, [pathname, router, status]);
  if (status === "loading") return <LoadingState>Đang kiểm tra quyền truy cập…</LoadingState>;
  if (status === "recoverable") return <SessionRetry retrySession={retrySession} />;
  if (status === "unauthenticated") return <LoadingState>Đang chuyển tới đăng nhập…</LoadingState>;
  if ((user?.role === "admin" || user?.role === "manager") && user.status !== "disabled") return <>{children}</>;
  return <main className="access-denied" id="main-content"><span className="eyebrow">403 · KHÔNG CÓ QUYỀN TRUY CẬP</span><h1>Khu vực này dành cho quản trị viên & quản lý.</h1><p>Tài khoản hiện tại không có quyền mở trang quản trị.</p></main>;
}

export function RequireRoles({ roles, children }: { roles: Array<"admin" | "manager" | "provider" | "user" | "customer">; children: ReactNode }) {
  const { status, user, retrySession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") ? `/?auth=login&next=${encodeURIComponent(pathname)}&reason=session_expired` : "/?auth=login&reason=session_expired";
      router.replace(next);
    }
  }, [pathname, router, status]);
  if (status === "loading") return <LoadingState>Đang kiểm tra quyền truy cập…</LoadingState>;
  if (status === "recoverable") return <SessionRetry retrySession={retrySession} />;
  if (status === "unauthenticated") return <LoadingState>Đang chuyển tới đăng nhập…</LoadingState>;
  const currentRole = user?.role === "customer" ? "user" : user?.role;
  const isAllowed = user && user.status !== "disabled" && roles.some((r) => (r === "customer" ? "user" : r) === currentRole);
  if (isAllowed) return <>{children}</>;
  return <main className="access-denied" id="main-content"><span className="eyebrow">403 · KHÔNG CÓ QUYỀN TRUY CẬP</span><h1>Khu vực yêu cầu quyền đặc biệt.</h1><p>Tài khoản hiện tại không có quyền truy cập vào chức năng này.</p></main>;
}

export function RequireProvider({ children }: { children: ReactNode }) {
  const { status, user, retrySession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") ? `/?auth=login&next=${encodeURIComponent(pathname)}&reason=session_expired` : "/?auth=login&reason=session_expired";
      router.replace(next);
    }
  }, [pathname, router, status]);
  if (status === "loading") return <LoadingState>Đang kiểm tra quyền đối tác…</LoadingState>;
  if (status === "recoverable") return <SessionRetry retrySession={retrySession} />;
  if (status === "unauthenticated") return <LoadingState>Đang chuyển tới đăng nhập…</LoadingState>;
  if (user?.role === "provider" && user.status !== "disabled") {
    return <>{children}</>;
  }
  return <main className="access-denied" id="main-content"><span className="eyebrow">403 · KHÔNG CÓ QUYỀN TRUY CẬP</span><h1>Khu vực dành riêng cho Đối tác dịch vụ.</h1><p>Tài khoản hiện tại không có quyền mở Cổng dịch vụ đối tác.</p></main>;
}

