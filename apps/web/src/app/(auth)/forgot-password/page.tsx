import type { Metadata } from "next";

import { ForgotPasswordPage } from "@/features/auth/auth-pages";

export const metadata: Metadata = { title: "Khôi phục mật khẩu" };
export default function Page() { return <ForgotPasswordPage />; }
