"use client";

import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LoginForm, RegisterForm } from "@/features/auth/auth-pages";
import type { AuthDialogMode } from "@/components/marketing/marketing-auth";

interface AuthDialogProps {
  open: boolean;
  mode: AuthDialogMode;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AuthDialogMode) => void;
}

export function AuthDialog({ open, mode, onOpenChange, onModeChange }: AuthDialogProps) {
  const router = useRouter();
  const isLogin = mode === "login";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="auth-dialog-heading">
          <span className="eyebrow">X-ONE / TÀI KHOẢN</span>
          <DialogTitle>{isLogin ? "Đăng nhập" : "Bắt đầu với X-One"}</DialogTitle>
          <DialogDescription>{isLogin ? "Tiếp tục những việc bạn đang làm cùng X-One." : "Một nơi để giữ các bước dịch vụ của bạn rõ ràng."}</DialogDescription>
        </div>
        <div className="auth-dialog-form">
          {isLogin ? (
            <LoginForm
              onSuccess={() => { onOpenChange(false); router.replace("/app"); }}
              onSwitch={() => onModeChange("register")}
            />
          ) : (
            <RegisterForm
              onSuccess={() => { onOpenChange(false); router.replace("/app"); }}
              onSwitch={() => onModeChange("login")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
