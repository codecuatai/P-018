"use client";

import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
    if (!authenticatedUser.onboarding_completed_at && authenticatedUser.authentication_kind !== "demo") return "/app/onboarding";
    return nextPath ?? "/app";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className={styles.heading}>
          <span className="eyebrow">X-ONE / TÀI KHOẢN</span>
          <DialogTitle>{isLogin ? "Đăng nhập" : "Bắt đầu với X-One"}</DialogTitle>
          <DialogDescription>{isLogin ? "Tiếp tục những việc bạn đang làm cùng X-One." : "Một nơi để giữ các bước dịch vụ của bạn rõ ràng."}</DialogDescription>
        </div>
        <div className={styles.form}>
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
      </DialogContent>
    </Dialog>
  );
}
