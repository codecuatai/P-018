import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={cn("rounded-xl border border-[color:var(--border)] bg-white shadow-[0_12px_28px_rgba(22,50,79,0.06)]", className)} {...props} />;
}
