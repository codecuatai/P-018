"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/providers/auth-provider";

function LoadingState({ children }: { children: ReactNode }) {
  return <main className="screen-loading" aria-live="polite"><span className="loading-mark" />{children}</main>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);
  if (status === "loading") return <LoadingState>Đang khôi phục phiên…</LoadingState>;
  if (status !== "authenticated") return <LoadingState>Đang chuyển tới đăng nhập…</LoadingState>;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace("/app");
  }, [router, status]);
  if (status === "loading") return <LoadingState>Đang mở X-One…</LoadingState>;
  if (status === "authenticated") return <LoadingState>Đang chuyển tới không gian của bạn…</LoadingState>;
  return <>{children}</>;
}

export function RequireAdmin() {
  const { status, user } = useAuth();
  if (status === "loading") return <LoadingState>Đang kiểm tra quyền truy cập…</LoadingState>;
  if (user?.role === "admin") return <main className="route-shell" id="main-content"><span className="eyebrow">QUẢN TRỊ</span><h1>Khu vực quản trị chưa được triển khai</h1><p>Quyền truy cập đã được xác thực, nhưng dashboard quản trị thuộc một phase sau.</p></main>;
  return <main className="access-denied" id="main-content"><span className="eyebrow">403 · KHÔNG CÓ QUYỀN TRUY CẬP</span><h1>Khu vực này dành cho quản trị viên.</h1><p>Tài khoản hiện tại không có quyền mở trang quản trị.</p></main>;
}
