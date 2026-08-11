import { Navigation, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import styles from "@/components/marketing/how-it-works/how-it-works-carousel.module.css";

export function ProductPreviewFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.productFrame}>
      <div className={styles.productTopbar}>
        <div className={styles.productBrand}><XOneMark size={24} /><strong>X-One</strong></div>
        <span className={styles.productView}>{label}</span>
        <span className={styles.productStatus}><span aria-hidden="true" /> Đang ở trong luồng</span>
      </div>
      {children}
    </div>
  );
}

export function ServiceGlyph({ kind }: { kind: "restaurant" | "ride" }) {
  return kind === "restaurant" ? <UtensilsCrossed size={18} strokeWidth={1.8} /> : <Navigation size={18} strokeWidth={1.8} />;
}
