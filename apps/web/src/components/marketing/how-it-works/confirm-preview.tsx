import { Check, Clock3, PencilLine, ShieldCheck } from "lucide-react";

import { ProductPreviewFrame, ServiceGlyph } from "@/components/marketing/how-it-works/product-preview";
import styles from "@/components/marketing/how-it-works/how-it-works-carousel.module.css";

export function ConfirmPreview() {
  return (
    <ProductPreviewFrame label="Kiểm tra trước khi xác nhận">
      <div className={styles.previewBody}>
        <div className={styles.confirmationStatus}><span><Clock3 size={16} /> Chờ bạn xác nhận</span><ShieldCheck size={18} /></div>
        <div className={styles.confirmationRows} aria-label="Thông tin minh hoạ cần kiểm tra">
          <div className={styles.confirmationRow}>
            <span className={`${styles.serviceGlyph} ${styles.restaurantGlyph}`}><ServiceGlyph kind="restaurant" /></span>
            <div><strong>Nhà hàng</strong><p>19:30 · 2 người</p></div>
          </div>
          <div className={styles.confirmationRow}>
            <span className={`${styles.serviceGlyph} ${styles.rideGlyph}`}><ServiceGlyph kind="ride" /></span>
            <div><strong>Chuyến xe</strong><p>VinUni → Nhà hàng</p></div>
            <strong className={styles.confirmationPrice}>124.000đ</strong>
          </div>
        </div>
        <div className={styles.confirmationActions}>
          <button type="button" className={styles.editButton}><PencilLine size={15} /> Chỉnh sửa</button>
          <button type="button" className={styles.confirmButton}><Check size={16} /> Xác nhận</button>
        </div>
        <p className={styles.confirmationNote}>Chưa có bước nào được thực hiện.</p>
      </div>
    </ProductPreviewFrame>
  );
}
