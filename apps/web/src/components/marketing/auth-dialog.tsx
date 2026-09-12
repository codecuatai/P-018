"use client";

import { LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { XOneMark } from "@/components/XOneMark";
import styles from "@/components/marketing/auth-dialog.module.css";
import { AuthHero, LoginForm, RegisterForm } from "@/features/auth/auth-pages";
import type { AuthDialogMode } from "@/components/marketing/marketing-auth";
import type { AuthUser } from "@/types";

interface AuthDialogProps {
  open: boolean;
  mode: AuthDialogMode;
  nextPath?: string;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AuthDialogMode) => void;
}

export function AuthDialog({ open, mode, nextPath, onOpenChange, onModeChange }: AuthDialogProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const destination = (authenticatedUser: AuthUser) => {
    if ((authenticatedUser.role === "admin" || authenticatedUser.role === "manager") && authenticatedUser.status !== "disabled") {
      return nextPath ?? "/admin";
    }
    if (authenticatedUser.role === "provider" && authenticatedUser.status !== "disabled") {
      return nextPath ?? "/app/provider";
    }
    if (!authenticatedUser.onboarding_completed_at && authenticatedUser.authentication_kind !== "demo") {
      return "/app/onboarding";
    }
    return nextPath ?? "/app";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isLogin ? styles.dialogNarrow : styles.dialogWide}>
        <div className={styles.srHeading}>
          <DialogTitle className={styles.title}>{isLogin ? "Đăng nhập" : "Bắt đầu với X-One"}</DialogTitle>
          <DialogDescription className={styles.subtitle}>
            {isLogin
              ? "Tiếp tục đặt xe, gọi món và khám bệnh trong một chạm."
              : "Một tài khoản cho mọi dịch vụ — tạo xong là dùng được ngay."}
          </DialogDescription>
        </div>
        <div className={styles.dialogBody}>
          <AuthHero
            title={isLogin ? "Đăng nhập" : "Bắt đầu với X-One"}
            subtitle={
              isLogin
                ? "Tiếp tục đặt xe, gọi món và khám bệnh trong một chạm."
                : "Một tài khoản cho mọi dịch vụ — tạo xong là dùng được ngay."
            }
          />
          <div className={styles.form}>
            <div className={styles.modeSwitch} role="tablist" aria-label="Chọn Đăng nhập hoặc Đăng ký">
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                aria-label="Chuyển sang đăng nhập"
                data-active={isLogin}
                className={styles.modeOption}
                onClick={() => onModeChange("login")}
              >
                <LogIn size={15} aria-hidden="true" />
                Đăng nhập
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                aria-label="Chuyển sang đăng ký"
                data-active={!isLogin}
                className={styles.modeOption}
                onClick={() => onModeChange("register")}
              >
                <UserPlus size={15} aria-hidden="true" />
                Đăng ký
              </button>
            </div>
            {isLogin ? (
              <LoginForm
                onSuccess={(authenticatedUser) => { onOpenChange(false); router.replace(destination(authenticatedUser)); }}
                onSwitch={() => onModeChange("register")}
              />
            ) : (
              <RegisterForm
                onSuccess={(authenticatedUser) => { onOpenChange(false); router.replace(destination(authenticatedUser)); }}
                onSwitch={() => onModeChange("login")}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
