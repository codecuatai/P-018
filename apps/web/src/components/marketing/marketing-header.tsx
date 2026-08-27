"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { XOneMark } from "@/components/XOneMark";
import { useMarketingAuth, type AuthDialogMode } from "@/components/marketing/marketing-auth";
import styles from "@/components/marketing/marketing-header.module.css";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/providers/auth-provider";

export function MarketingHeader() {
  const [raised, setRaised] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sentinel = useRef<HTMLSpanElement>(null);
  const { openAuth } = useMarketingAuth();
  const { user } = useAuth();

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

  return <>
    <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
    <span ref={sentinel} className={styles.scrollSentinel} aria-hidden="true" />
    <header className={`${styles.header} ${raised ? styles.headerRaised : ""}`}>
      <div className={styles.headerFrame}>
        <div className={styles.brandIsland}>
          <Link className={styles.brand} href="/" aria-label="X-One trang chủ"><XOneMark size={30} /><span>X-One</span></Link>
        </div>
        <div className={styles.navIsland}>
          <nav className={styles.nav} aria-label="Điều hướng chính"><a href="#dich-vu">Dịch vụ</a><a href="#cach-hoat-dong">Cách hoạt động</a><a href="#an-toan">An toàn</a></nav>
          <div className={styles.actions}>
            {user ? (
              <Link className="button button-primary" href="/app">Vào ứng dụng Chat</Link>
            ) : (
              <>
                <button className={`text-link ${styles.authTrigger}`} type="button" onClick={() => triggerAuth("login")}>Đăng nhập</button>
                <button className="button button-primary" type="button" onClick={() => triggerAuth("register")}>Bắt đầu với X-One</button>
              </>
            )}
          </div>
        </div>
        <div className={styles.mobileMenuIsland}>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild><button className={`icon-button ${styles.menuButton}`} type="button" aria-label="Mở menu"><Menu size={20} /></button></SheetTrigger>
            <SheetContent title="Điều hướng X-One">
              <nav className={styles.mobileNav} aria-label="Điều hướng di động">
                <SheetClose asChild><a href="#dich-vu">Dịch vụ</a></SheetClose>
                <SheetClose asChild><a href="#cach-hoat-dong">Cách hoạt động</a></SheetClose>
                <SheetClose asChild><a href="#an-toan">An toàn</a></SheetClose>
                {user ? (
                  <SheetClose asChild><Link className="button button-primary" href="/app">Vào ứng dụng Chat</Link></SheetClose>
                ) : (
                  <>
                    <SheetClose asChild><button type="button" onClick={() => triggerAuth("login")}>Đăng nhập</button></SheetClose>
                    <SheetClose asChild><button className="button button-primary" type="button" onClick={() => triggerAuth("register")}>Bắt đầu với X-One</button></SheetClose>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  </>;
}
