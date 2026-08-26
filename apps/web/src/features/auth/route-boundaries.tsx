"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/providers/auth-provider";

function LoadingState({ children }: { children: ReactNode }) {
  return <main className="screen-loading" aria-live="polite"><span className="loading-mark" />{children}</main>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") ? `/?auth=login&next=${encodeURIComponent(pathname)}` : "/?auth=login";
      router.replace(next);
    }
  }, [pathname, router, status]);
  if (status === "loading") return <LoadingState>Đang khôi phục phiên…</LoadingState>;
  if (status !== "authenticated") return <LoadingState>Đang chuyển tới đăng nhập…</LoadingState>;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace(user?.role === "admin" ? "/admin" : user?.onboarding_completed_at || user?.authentication_kind === "demo" ? "/app" : "/app/onboarding");
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
  const needsOnboarding = Boolean(user && user.role !== "admin" && !user.onboarding_completed_at && user.authentication_kind !== "demo");

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (needsOnboarding && !isOnboarding) router.replace("/app/onboarding");
    if (!needsOnboarding && isOnboarding) router.replace("/app");
  }, [isOnboarding, needsOnboarding, router, status, user]);

  if (status === "loading") return <LoadingState>Đang chuẩn bị hồ sơ của bạn…</LoadingState>;
  if (status === "authenticated" && needsOnboarding !== isOnboarding) return <LoadingState>Đang mở bước thiết lập đầu tiên…</LoadingState>;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") ? `/?auth=login&next=${encodeURIComponent(pathname)}` : "/?auth=login&next=%2Fadmin";
      router.replace(next);
    }
  }, [pathname, router, status]);
  if (status === "loading" || status === "unauthenticated") return <LoadingState>{status === "loading" ? "Đang kiểm tra quyền truy cập…" : "Đang chuyển tới đăng nhập…"}</LoadingState>;
  if (user?.role === "admin" && user.status !== "disabled") return <>{children}</>;
  return <main className="access-denied" id="main-content"><span className="eyebrow">403 · KHÔNG CÓ QUYỀN TRUY CẬP</span><h1>Khu vực này dành cho quản trị viên.</h1><p>Tài khoản hiện tại không có quyền mở trang quản trị.</p></main>;
}
