import type { Metadata } from "next";

import { LoginPage } from "@/features/auth/auth-pages";

export const metadata: Metadata = { title: "Đăng nhập" };
export default function Page() { return <LoginPage />; }
