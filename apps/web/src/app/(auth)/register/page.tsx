import type { Metadata } from "next";

import { RegisterPage } from "@/features/auth/auth-pages";

export const metadata: Metadata = { title: "Tạo tài khoản" };
export default function Page() { return <RegisterPage />; }
