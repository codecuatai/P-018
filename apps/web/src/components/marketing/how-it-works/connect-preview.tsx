import { ArrowDown } from "lucide-react";

import { ProductPreviewFrame, ServiceGlyph } from "@/components/marketing/how-it-works/product-preview";
import styles from "@/components/marketing/how-it-works/how-it-works-carousel.module.css";

export function ConnectPreview() {
  return (
    <ProductPreviewFrame label="Các lựa chọn liên quan">
      <div className={styles.previewBody}>
        <div className={styles.previewGreeting}>
          <span>Trong cùng một trải nghiệm</span>
          <strong>X-One giữ những bước liên quan ở cạnh nhau.</strong>
        </div>
        <div className={styles.resultStack} aria-label="Ví dụ kết nối nhà hàng và chuyến xe">
          <div className={styles.resultCard}>
            <span className={`${styles.serviceGlyph} ${styles.restaurantGlyph}`}><ServiceGlyph kind="restaurant" /></span>
            <div><strong>Nhà hàng</strong><p>Đã tìm thấy 3 lựa chọn phù hợp</p></div>
            <span className={styles.resultAction}>Xem lựa chọn</span>
          </div>
          <div className={styles.connector} aria-hidden="true"><span /><ArrowDown size={15} /></div>
          <div className={styles.resultCard}>
            <span className={`${styles.serviceGlyph} ${styles.rideGlyph}`}><ServiceGlyph kind="ride" /></span>
            <div><strong>Chuyến xe</strong><p>Điểm đến đã sẵn sàng</p></div>
            <span className={styles.resultAction}>Xem lại</span>
          </div>
        </div>
        <p className={styles.previewHint}>Bạn có thể xem từng lựa chọn trước khi đi tiếp.</p>
      </div>
    </ProductPreviewFrame>
  );
}
