"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function MarketingHeader() {
  const [raised, setRaised] = useState(false);

  useEffect(() => {
    const update = () => setRaised(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return <div className="marketing-shell">
    <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
    <header className={`marketing-header ${raised ? "is-raised" : ""}`}>
      <div className="marketing-header-inner">
        <Link className="brand-link" href="/" aria-label="X-One trang chủ"><XOneMark size={30} /><span>X-One</span></Link>
        <nav className="marketing-nav" aria-label="Điều hướng chính"><a href="#dich-vu">Dịch vụ</a><a href="#cach-hoat-dong">Cách hoạt động</a><a href="#an-toan">An toàn</a></nav>
        <div className="marketing-actions"><Link className="text-link" href="/login">Đăng nhập</Link><Link className="button button-primary" href="/register">Bắt đầu với X-One</Link></div>
        <Sheet>
          <SheetTrigger asChild><button className="icon-button marketing-menu-button" type="button" aria-label="Mở menu"><Menu size={20} /></button></SheetTrigger>
          <SheetContent title="Điều hướng X-One">
            <nav className="flex flex-col gap-2" aria-label="Điều hướng di động">
              <SheetClose asChild><a className="rounded-lg px-3 py-3 font-semibold hover:bg-[#F5F7F8]" href="#dich-vu">Dịch vụ</a></SheetClose>
              <SheetClose asChild><a className="rounded-lg px-3 py-3 font-semibold hover:bg-[#F5F7F8]" href="#cach-hoat-dong">Cách hoạt động</a></SheetClose>
              <SheetClose asChild><a className="rounded-lg px-3 py-3 font-semibold hover:bg-[#F5F7F8]" href="#an-toan">An toàn</a></SheetClose>
              <SheetClose asChild><Link className="rounded-lg px-3 py-3 font-semibold hover:bg-[#F5F7F8]" href="/login">Đăng nhập</Link></SheetClose>
              <SheetClose asChild><Link className="button button-primary mt-2" href="/register">Bắt đầu với X-One</Link></SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  </div>;
}
