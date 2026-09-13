"use client";

import { LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { XOneMark } from "@/components/XOneMark";
import styles from "@/components/marketing/auth-dialog.module.css";
import { LoginForm, RegisterForm } from "@/features/auth/auth-pages";
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
      <DialogContent className={isLogin ? styles.dialogLogin : styles.dialogRegister}>
        <div className={styles.header}>
          <div className={styles.brandIcon} aria-hidden="true">
            <XOneMark size={24} />
          </div>
          <DialogTitle className={styles.title}>
            {isLogin ? "Đăng nhập" : "Bắt đầu với X-One"}
          </DialogTitle>
          <DialogDescription className={styles.subtitle}>
            {isLogin
              ? "Chào mừng bạn trở lại! Đặt xe, gọi món và khám bệnh trong một chạm."
              : "Một tài khoản duy nhất cho mọi dịch vụ di chuyển, ẩm thực và y tế."}
          </DialogDescription>
        </div>

        <div className={styles.formWrapper}>
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
              onSuccess={(authenticatedUser) => {
                onOpenChange(false);
                router.replace(destination(authenticatedUser));
              }}
              onSwitch={() => onModeChange("register")}
            />
          ) : (
            <RegisterForm
              onSuccess={(authenticatedUser) => {
                onOpenChange(false);
                router.replace(destination(authenticatedUser));
              }}
              onSwitch={() => onModeChange("login")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
