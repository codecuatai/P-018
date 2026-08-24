"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { errorText } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams?.get("code");
    const oauthError = searchParams?.get("error");

    if (oauthError) {
      setError(`Google OAuth từ chối xác thực: ${oauthError}`);
      return;
    }

    if (!code) {
      setError("Thiếu mã xác thực từ Google.");
      return;
    }

    const authCode = code;
    let active = true;

    async function handleAuth() {
      try {
        await loginWithGoogle(authCode);
        if (active) {
          router.replace("/");
        }
      } catch (err) {
        if (active) {
          setError(errorText(err));
        }
      }
    }

    void handleAuth();

    return () => {
      active = false;
    };
  }, [loginWithGoogle, router, searchParams]);

  if (error) {
    return (
      <div className="auth-card" style={{ maxWidth: 440, margin: "60px auto", textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: 12, borderRadius: "50%", background: "#FEE2E2", color: "#DC2626", marginBottom: 16 }}>
          <AlertCircle size={28} />
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 8, color: "var(--color-navy)" }}>
          Đăng nhập Google không thành công
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginBottom: 24, lineHeight: 1.5 }}>
          {error}
        </p>
        <Link href="/?auth=login" className="button button-primary button-wide">
          Quay lại Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card" style={{ maxWidth: 440, margin: "80px auto", textAlign: "center", padding: "40px 24px" }}>
      <LoaderCircle className="spinner" size={36} style={{ color: "var(--color-primary)", margin: "0 auto 16px" }} />
      <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--color-navy)", marginBottom: 6 }}>
        Đang xử lý đăng nhập Google...
      </h2>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
        Vui lòng đợi trong giây lát, hệ thống đang hoàn tất phiên làm việc.
      </p>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <div className="auth-layout-shell">
      <Suspense
        fallback={
          <div className="auth-card" style={{ maxWidth: 440, margin: "80px auto", textAlign: "center", padding: "40px 24px" }}>
            <LoaderCircle className="spinner" size={36} style={{ color: "var(--color-primary)", margin: "0 auto 16px" }} />
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>Đang tải...</p>
          </div>
        }
      >
        <GoogleCallbackContent />
      </Suspense>
    </div>
  );
}
