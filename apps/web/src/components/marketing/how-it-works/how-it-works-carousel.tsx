"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type FocusEvent } from "react";

import { AskPreview } from "@/components/marketing/how-it-works/ask-preview";
import { ConfirmPreview } from "@/components/marketing/how-it-works/confirm-preview";
import { ConnectPreview } from "@/components/marketing/how-it-works/connect-preview";
import styles from "@/components/marketing/how-it-works/how-it-works-carousel.module.css";

export const HOW_IT_WORKS_STAGES = [
  { id: "ask", label: "Nói điều bạn cần", description: "Nói điều bạn cần bằng cách tự nhiên nhất.", preview: <AskPreview /> },
  { id: "connect", label: "Kết nối các bước", description: "Các lựa chọn liên quan được giữ trong cùng một luồng.", preview: <ConnectPreview /> },
  { id: "confirm", label: "Kiểm tra và xác nhận", description: "Bạn luôn xem lại trước khi một bước quan trọng được thực hiện.", preview: <ConfirmPreview /> },
] as const;

type StageId = (typeof HOW_IT_WORKS_STAGES)[number]["id"];

const slideTransition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };

export function HowItWorksCarousel() {
  const reduceMotion = useReducedMotion() === true;
  const [activeId, setActiveId] = useState<StageId>("ask");
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [timerReset, setTimerReset] = useState(0);
  const activeStage = useMemo(() => HOW_IT_WORKS_STAGES.find((stage) => stage.id === activeId) ?? HOW_IT_WORKS_STAGES[0], [activeId]);

  useEffect(() => {
    function updateVisibility() {
      setDocumentVisible(document.visibilityState !== "hidden");
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (reduceMotion || hovering || focused || !documentVisible) return;
    const timer = window.setInterval(() => {
      setActiveId((current) => {
        const index = HOW_IT_WORKS_STAGES.findIndex((stage) => stage.id === current);
        return HOW_IT_WORKS_STAGES[(index + 1) % HOW_IT_WORKS_STAGES.length].id;
      });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [documentVisible, focused, hovering, reduceMotion, timerReset]);

  const selectStage = useCallback((nextId: StageId) => {
    setActiveId(nextId);
    setTimerReset((value) => value + 1);
  }, []);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }

  return (
    <div
      className={styles.carousel}
      aria-label="Cách X-One hoạt động"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      data-how-it-works-carousel
    >
      <div className={styles.previewColumn}>
        <div className={styles.stageIntro}>
          <span className={styles.stageEyebrow}>ĐANG XEM</span>
          <h3>{activeStage.label}</h3>
          <p>{activeStage.description}</p>
        </div>
        <div className={styles.previewViewport} id="how-it-works-preview" role="tabpanel" aria-labelledby={`how-it-works-stage-${activeStage.id}`} aria-live={reduceMotion ? "off" : "polite"}>
          <AnimatePresence initial={false}>
            <motion.div
              key={activeStage.id}
              className={styles.previewSlide}
              initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 26 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: -24 }}
              transition={reduceMotion ? { duration: 0.01 } : slideTransition}
            >
              {activeStage.preview}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className={styles.stageControls} role="tablist" aria-label="Các giai đoạn của X-One">
        {HOW_IT_WORKS_STAGES.map((stage) => {
          const active = stage.id === activeId;
          return (
            <button
              key={stage.id}
              id={`how-it-works-stage-${stage.id}`}
              className={`${styles.stageButton} ${active ? styles.stageButtonActive : ""}`}
              type="button"
              role="tab"
              aria-current={active ? "step" : undefined}
              aria-selected={active}
              aria-controls="how-it-works-preview"
              onClick={() => selectStage(stage.id)}
            >
              <span>{stage.label}</span>
              <span className={styles.stageProgress} aria-hidden="true"><span /></span>
            </button>
          );
        })}
        <p className={styles.controlHint}>Tự chuyển sau vài giây · có thể chọn trực tiếp</p>
      </div>
    </div>
  );
}
