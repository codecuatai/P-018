"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({ children, className, title }: { children: ReactNode; className?: string; title: string }) {
  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-[#111827]/28 data-[state=open]:animate-in data-[state=closed]:animate-out" />
    <Dialog.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-[min(21rem,calc(100vw-1.25rem))] flex-col border-l border-[color:var(--border)] bg-white p-5 shadow-[-18px_0_40px_rgba(22,50,79,0.12)] outline-none", className)}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Dialog.Title className="font-semibold text-[color:var(--foreground)]">{title}</Dialog.Title>
        <Dialog.Close aria-label="Đóng điều hướng" className="grid size-10 place-items-center rounded-lg border border-[color:var(--border)] text-[color:var(--foreground)] transition-[background-color,border-color] hover:bg-[#F5F7F8]"><X size={18} /></Dialog.Close>
      </div>
      {children}
    </Dialog.Content>
  </Dialog.Portal>;
}
