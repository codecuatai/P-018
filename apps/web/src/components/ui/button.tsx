import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-bold transition-[background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "border-[color:var(--primary)] bg-[color:var(--primary)] text-white hover:-translate-y-px hover:bg-[#274BC4]",
        secondary: "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:-translate-y-px hover:border-[color:var(--primary)] hover:bg-[#F5F7F8]",
        destructive: "border-[#edc5c0] bg-[#fff5f3] text-[color:var(--danger)] hover:-translate-y-px hover:bg-[#ffebe7]",
        ghost: "border-transparent bg-transparent text-[color:var(--foreground)] hover:bg-[#edf1f4]",
      },
      size: {
        default: "",
        sm: "min-h-8 px-2.5 py-1 text-xs",
        lg: "min-h-12 px-4.5 py-3 text-[0.95rem]",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
