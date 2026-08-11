"use client";

import { ArrowLeft, ArrowRight, Link2, MessageCircle, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { AskPreview } from "@/components/marketing/how-it-works/ask-preview";
import { ConfirmPreview } from "@/components/marketing/how-it-works/confirm-preview";
import { ConnectPreview } from "@/components/marketing/how-it-works/connect-preview";
import styles from "@/components/marketing/how-it-works/how-it-works-carousel.module.css";

export const HOW_IT_WORKS_STAGES = [
  { id: "ask", label: "Nói điều bạn cần", description: "Bắt đầu bằng một yêu cầu tự nhiên.", icon: MessageCircle, preview: <AskPreview /> },
  { id: "connect", label: "Kết nối các bước", description: "Giữ các lựa chọn liên quan cạnh nhau.", icon: Link2, preview: <ConnectPreview /> },
  { id: "confirm", label: "Xác nhận", description: "Xem lại trước khi tiếp tục.", icon: ShieldCheck, preview: <ConfirmPreview /> },
] as const;

type StageId = (typeof HOW_IT_WORKS_STAGES)[number]["id"];
type Direction = 1 | -1;

const slideTransition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
const sectionTransition = { duration: 0.56, ease: [0.22, 1, 0.36, 1] as const };
const slideVariants = {
  enter: (direction: Direction) => ({ opacity: 0, x: direction > 0 ? 48 : -48, scale: 0.985, clipPath: "inset(3% 2% 3% 2%)" }),
  center: { opacity: 1, x: 0, scale: 1, clipPath: "inset(0% 0% 0% 0%)" },
  exit: (direction: Direction) => ({ opacity: 0, x: direction > 0 ? -48 : 48, scale: 0.985, clipPath: "inset(3% 2% 3% 2%)" }),
};

export function HowItWorksCarousel() {
  const reduceMotion = useReducedMotion() === true;
  const carouselRef = useRef<HTMLDivElement>(null);
  const stageButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timerRef = useRef<number | null>(null);
  const inView = useInView(carouselRef, { once: false, amount: 0.25, margin: "-10% 0px -10% 0px" });
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>(1);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const activeStage = useMemo(() => HOW_IT_WORKS_STAGES[activeIndex], [activeIndex]);
  const contentVisible = reduceMotion || inView;

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    function updateVisibility() {
      setDocumentVisible(document.visibilityState !== "hidden");
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const scheduleTimer = useCallback(() => {
    clearTimer();
    if (reduceMotion || hovering || focused || !documentVisible || !inView) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setDirection(1);
      setActiveIndex((index) => (index + 1) % HOW_IT_WORKS_STAGES.length);
    }, 2200);
  }, [clearTimer, documentVisible, focused, hovering, inView, reduceMotion]);

  useEffect(() => {
    scheduleTimer();
    return clearTimer;
  }, [activeIndex, clearTimer, scheduleTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const moveTo = useCallback((nextIndex: number, nextDirection: Direction) => {
    clearTimer();
    setDirection(nextDirection);
    setActiveIndex(nextIndex);
  }, [clearTimer]);

  const selectStage = useCallback((nextId: StageId) => {
    const nextIndex = HOW_IT_WORKS_STAGES.findIndex((stage) => stage.id === nextId);
    if (nextIndex < 0) return;
    moveTo(nextIndex, nextIndex >= activeIndex ? 1 : -1);
  }, [activeIndex, moveTo]);

  const goPrevious = useCallback(() => {
    moveTo((activeIndex - 1 + HOW_IT_WORKS_STAGES.length) % HOW_IT_WORKS_STAGES.length, -1);
  }, [activeIndex, moveTo]);

  const goNext = useCallback(() => {
    moveTo((activeIndex + 1) % HOW_IT_WORKS_STAGES.length, 1);
  }, [activeIndex, moveTo]);

  function handleStageKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % HOW_IT_WORKS_STAGES.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + HOW_IT_WORKS_STAGES.length) % HOW_IT_WORKS_STAGES.length;
    if (nextIndex === null) return;

    event.preventDefault();
    moveTo(nextIndex, nextIndex >= currentIndex ? 1 : -1);
    stageButtonRefs.current[nextIndex]?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
      scheduleTimer();
    }
  }

  return (
    <div
      ref={carouselRef}
      className={styles.carousel}
      aria-labelledby="how-title"
      role="region"
      data-carousel-in-view={inView ? "true" : "false"}
      data-carousel-paused={reduceMotion || hovering || focused || !documentVisible || !inView ? "true" : "false"}
      onMouseEnter={() => { clearTimer(); setHovering(true); }}
      onMouseLeave={() => { setHovering(false); scheduleTimer(); }}
      onFocus={() => { clearTimer(); setFocused(true); }}
      onBlur={handleBlur}
      data-how-it-works-carousel
    >
      <motion.header
        className={styles.sectionHeading}
        initial={reduceMotion ? false : { opacity: 0, x: -24 }}
        animate={contentVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
        transition={sectionTransition}
      >
        <h2 id="how-title">Bạn nói một lần. X-One suy luận những bước tiếp theo.</h2>
        <p>Từ điều bạn nói đến lúc xem lại và xác nhận, mọi thứ được giữ trong cùng một trải nghiệm.</p>
      </motion.header>

      <div className={styles.stageLayout}>
        <motion.div
          className={styles.previewColumn}
          initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.99 }}
          animate={contentVisible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.99 }}
          transition={{ ...sectionTransition, delay: 0.08 }}
        >
          <div className={styles.stageIntro}>
            <h3>{activeStage.label}</h3>
            <p>{activeStage.description}</p>
          </div>
          <div className={styles.previewStage}>
            <button className={styles.carouselArrow} type="button" aria-label="Bước trước" aria-controls="how-it-works-preview" onClick={goPrevious}>
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <div className={styles.previewViewport} id="how-it-works-preview" role="tabpanel" aria-labelledby={`how-it-works-stage-${activeStage.id}`} aria-live={reduceMotion ? "off" : "polite"}>
              <AnimatePresence initial={false} custom={direction} mode="sync">
                <motion.div
                  key={activeStage.id}
                  className={styles.previewSlide}
                  custom={direction}
                  variants={reduceMotion ? undefined : slideVariants}
                  initial={reduceMotion ? false : "enter"}
                  animate="center"
                  exit={reduceMotion ? undefined : "exit"}
                  transition={reduceMotion ? { duration: 0.01 } : slideTransition}
                >
                  {activeStage.preview}
                </motion.div>
              </AnimatePresence>
            </div>
            <button className={styles.carouselArrow} type="button" aria-label="Bước tiếp theo" aria-controls="how-it-works-preview" onClick={goNext}>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </motion.div>

        <motion.div
          className={styles.stageControls}
          role="tablist"
          aria-label="Các giai đoạn của X-One"
          initial={reduceMotion ? false : { opacity: 0, x: 18 }}
          animate={contentVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 18 }}
          transition={{ ...sectionTransition, delay: 0.16 }}
        >
          {HOW_IT_WORKS_STAGES.map((stage, index) => {
            const active = stage.id === activeStage.id;
            const StageIcon = stage.icon;
            return (
              <button
                key={stage.id}
                ref={(node) => { stageButtonRefs.current[index] = node; }}
                id={`how-it-works-stage-${stage.id}`}
                className={`${styles.stageButton} ${active ? styles.stageButtonActive : ""}`}
                type="button"
                role="tab"
                tabIndex={active ? 0 : -1}
                aria-current={active ? "step" : undefined}
                aria-selected={active}
                aria-label={stage.label}
                aria-controls="how-it-works-preview"
                onClick={() => selectStage(stage.id)}
                onKeyDown={(event) => handleStageKeyDown(event, index)}
              >
                {active ? <motion.span className={styles.stageSelection} layoutId="how-stage-selection" aria-hidden="true" /> : null}
                <span className={styles.stageIcon}><StageIcon size={18} aria-hidden="true" /></span>
                <span className={styles.stageContent}>
                  <span className={styles.stageLabel}>{stage.label}</span>
                  <span className={styles.stageSupport}>{stage.description}</span>
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
