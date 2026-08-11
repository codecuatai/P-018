import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "../styles.css";

export const metadata: Metadata = {
  title: {
    default: "X-One — Một yêu cầu, nhiều dịch vụ",
    template: "%s | X-One",
  },
  description: "X-One kết nối đồ ăn, chuyến xe, nhà hàng và lịch khám trong một trải nghiệm rõ ràng, có xác nhận ở những bước quan trọng.",
  openGraph: {
    title: "X-One — Một yêu cầu, nhiều dịch vụ",
    description: "Kết nối đồ ăn, chuyến xe, nhà hàng và lịch khám trong một trải nghiệm rõ ràng.",
    type: "website",
    locale: "vi_VN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F7F8",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
