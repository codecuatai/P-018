"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { XOneMark } from "@/components/XOneMark";
import { useMarketingAuth, type AuthDialogMode } from "@/components/marketing/marketing-auth";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function MarketingHeader() {
  const [raised, setRaised] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sentinel = useRef<HTMLSpanElement>(null);
  const { openAuth } = useMarketingAuth();

  useEffect(() => {
    if (!sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setRaised(!entry.isIntersecting), { threshold: 0 });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);

  function triggerAuth(mode: AuthDialogMode) {
    setMenuOpen(false);
    openAuth(mode);
  }

  return <div className="marketing-shell">
    <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
    <span ref={sentinel} className="marketing-scroll-sentinel" aria-hidden="true" />
    <header className={`marketing-header ${raised ? "is-raised" : ""}`}>
      <div className="marketing-header-inner">
        <Link className="brand-link" href="/" aria-label="X-One trang chủ"><XOneMark size={30} /><span>X-One</span></Link>
        <nav className="marketing-nav" aria-label="Điều hướng chính"><a href="#dich-vu">Dịch vụ</a><a href="#cach-hoat-dong">Cách hoạt động</a><a href="#an-toan">An toàn</a></nav>
        <div className="marketing-actions"><button className="text-link marketing-auth-trigger" type="button" onClick={() => triggerAuth("login")}>Đăng nhập</button><button className="button button-primary" type="button" onClick={() => triggerAuth("register")}>Bắt đầu với X-One</button></div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild><button className="icon-button marketing-menu-button" type="button" aria-label="Mở menu"><Menu size={20} /></button></SheetTrigger>
          <SheetContent title="Điều hướng X-One">
            <nav className="marketing-mobile-nav" aria-label="Điều hướng di động">
              <SheetClose asChild><a href="#dich-vu">Dịch vụ</a></SheetClose>
              <SheetClose asChild><a href="#cach-hoat-dong">Cách hoạt động</a></SheetClose>
              <SheetClose asChild><a href="#an-toan">An toàn</a></SheetClose>
              <SheetClose asChild><button type="button" onClick={() => triggerAuth("login")}>Đăng nhập</button></SheetClose>
              <SheetClose asChild><button className="button button-primary" type="button" onClick={() => triggerAuth("register")}>Bắt đầu với X-One</button></SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  </div>;
}
