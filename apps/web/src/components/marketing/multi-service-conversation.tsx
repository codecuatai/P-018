"use client";

import { ArrowRight, Check, Navigation, UtensilsCrossed } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

import { XOneMark } from "@/components/XOneMark";
import { useDelayedReplay } from "@/components/marketing/scroll-focus-scene";
import styles from "@/components/marketing/multi-service-conversation.module.css";
import { usePrefersReducedMotion } from "@/components/marketing/use-motion-preference";

const revealTransition = { duration: 0.52, ease: [0.22, 1, 0.36, 1] as const };
const hiddenState = { opacity: 0, y: 20, scale: 0.985 };
const visibleState = { opacity: 1, y: 0, scale: 1 };

export function MultiServiceConversation({ className = "", replayOnReenter = false }: { className?: string; replayOnReenter?: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  const storyRef = useRef<HTMLDivElement>(null);
  const entered = useInView(storyRef, { once: !replayOnReenter, amount: 0.24, margin: "-10% 0px -10% 0px" });
  const delayedActive = useDelayedReplay(storyRef, replayOnReenter, undefined, reduceMotion);
  const visible = reduceMotion || (replayOnReenter ? delayedActive : entered);

  const reveal = (delay: number) => ({
    initial: reduceMotion ? false : hiddenState,
    animate: reduceMotion ? visibleState : visible ? visibleState : replayOnReenter ? hiddenState : undefined,
    transition: reduceMotion ? { duration: 0.01 } : { ...revealTransition, delay },
  });

  return (
    <div ref={storyRef} className={`${styles.conversation} ${className}`} aria-label="Minh hoạ một yêu cầu có nhiều dịch vụ" data-multi-service-conversation>
      <motion.div className={styles.userRow} {...reveal(0.08)}>
        <span className={styles.rowLabel}>Bạn</span>
        <p className={styles.userBubble}>Tối nay đặt bàn cho 2 người gần Hồ Gươm, rồi gọi xe đưa tôi tới đó.</p>
      </motion.div>

      <motion.div className={styles.assistantRow} {...reveal(0.26)}>
        <span className={styles.assistantAvatar}><XOneMark size={20} /></span>
        <div>
          <span className={styles.rowLabel}>X-One</span>
        <p className={styles.assistantBubble}>Mình sẽ giữ hai việc cạnh nhau để bạn dễ theo dõi.</p>
        </div>
      </motion.div>

      <motion.div className={styles.serviceCard} {...reveal(0.44)}>
        <div className={`${styles.serviceIcon} ${styles.restaurantIcon}`}><UtensilsCrossed size={18} aria-hidden="true" /></div>
        <div className={styles.serviceContent}>
          <span className={styles.serviceLabel}>Nhà hàng</span>
          <strong>Tìm lựa chọn phù hợp</strong>
          <p>19:30 · 2 người</p>
        </div>
        <span className={styles.serviceAction}>Xem lựa chọn <ArrowRight size={14} aria-hidden="true" /></span>
      </motion.div>

      <motion.div className={styles.connection} {...reveal(0.66)} aria-hidden="true">
        <span className={styles.connectionLine} />
        <span>Giữ thông tin cho bước tiếp theo</span>
      </motion.div>

      <motion.div className={`${styles.serviceCard} ${styles.rideCard}`} {...reveal(0.88)}>
        <div className={`${styles.serviceIcon} ${styles.rideIcon}`}><Navigation size={18} aria-hidden="true" /></div>
        <div className={styles.serviceContent}>
          <span className={styles.serviceLabel}>Chuyến xe</span>
          <strong>Điểm đến sẽ lấy từ nhà hàng bạn chọn</strong>
          <p>Chuẩn bị sau khi bạn xem lại lựa chọn.</p>
        </div>
        <span className={styles.serviceAction}>Chuẩn bị chuyến xe <ArrowRight size={14} aria-hidden="true" /></span>
      </motion.div>

      <motion.p className={styles.confirmationNote} {...reveal(1.08)}>
        <Check size={16} aria-hidden="true" /> Bạn vẫn xác nhận từng bước quan trọng.
      </motion.p>
    </div>
  );
}
