import { ArrowUp } from "lucide-react";

import { XOneMark } from "@/components/XOneMark";
import { ProductPreviewFrame } from "@/components/marketing/how-it-works/product-preview";
import styles from "@/components/marketing/how-it-works/how-it-works-carousel.module.css";

export function AskPreview() {
  return (
    <ProductPreviewFrame label="Trợ lý X-One">
      <div className={styles.previewBody}>
        <div className={styles.previewGreeting}>
          <span>Xin chào, An</span>
          <strong>Bắt đầu từ điều bạn cần hôm nay.</strong>
        </div>
        <div className={styles.conversation} aria-label="Ví dụ hội thoại với X-One">
          <p className={styles.userBubble}>Tối nay tìm nhà hàng cho 2 người ở Hà Nội</p>
          <div className={styles.assistantMessage}>
            <span className={styles.assistantAvatar}><XOneMark size={22} /></span>
            <div>
              <strong>X-One</strong>
              <p>Mình sẽ tìm các lựa chọn phù hợp cho bạn.</p>
            </div>
          </div>
        </div>
        <div className={styles.composerBar} aria-label="Ô nhập yêu cầu minh hoạ">
          <span>Viết điều bạn cần...</span>
          <button type="button" aria-label="Gửi yêu cầu minh hoạ"><ArrowUp size={17} /></button>
        </div>
      </div>
    </ProductPreviewFrame>
  );
}
