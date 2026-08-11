import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("flex h-11 w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--foreground)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[color:var(--muted-foreground)] focus:border-[color:var(--primary)] focus:ring-3 focus:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-60", className)} {...props} />;
});
