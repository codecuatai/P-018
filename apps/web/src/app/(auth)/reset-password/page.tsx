import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordPage } from "@/features/auth/auth-pages";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };
export default function Page() { return <Suspense fallback={<main className="screen-loading" aria-live="polite"><span className="loading-mark" />Đang kiểm tra liên kết…</main>}><ResetPasswordPage /></Suspense>; }
