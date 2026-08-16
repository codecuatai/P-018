"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#111827]/30" />
    <AlertDialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[min(29rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--color-border)] bg-white p-6 shadow-[0_24px_70px_rgba(22,50,79,0.18)] outline-none", className)}>{children}</AlertDialogPrimitive.Content>
  </AlertDialogPrimitive.Portal>;
}

export const AlertDialogTitle = AlertDialogPrimitive.Title;
export const AlertDialogDescription = AlertDialogPrimitive.Description;
