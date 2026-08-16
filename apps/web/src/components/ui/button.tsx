import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-bold transition-[background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[color:var(--color-ring)] disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white hover:-translate-y-px hover:bg-[color:var(--color-primary-strong)]",
        secondary: "border-[color:var(--color-border)] bg-white text-[color:var(--color-ink)] hover:-translate-y-px hover:border-[color:var(--color-primary)] hover:bg-[color:var(--color-canvas)]",
        destructive: "border-[#edc5c0] bg-[color:var(--color-danger-surface)] text-[color:var(--color-danger)] hover:-translate-y-px hover:bg-[#ffebe7]",
        ghost: "border-transparent bg-transparent text-[color:var(--color-ink)] hover:bg-[#edf1f4]",
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
