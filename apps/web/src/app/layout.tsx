import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AuthProvider } from "@/providers/auth-provider";
import "./globals.css";
import "../styles/shared.css";
import "../styles/auth.css";
import "../styles/assistant.css";
import "../styles/product.css";
import "leaflet/dist/leaflet.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

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
  return (
    <html lang="vi" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
