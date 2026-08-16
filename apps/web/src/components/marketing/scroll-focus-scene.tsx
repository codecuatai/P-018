"use client";

import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type SceneProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  replayOnReenter?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

type RevealElement = "article" | "div" | "header";
type RevealVariant = "up" | "left" | "right" | "scale" | "object";

const enterTransition = {
  duration: 0.56,
  ease: [0.22, 1, 0.36, 1] as const,
};

const visibleState = { opacity: 1, x: 0, y: 0, scale: 1 };

const oneShotViewport = { once: true, amount: 0.18 } as const;
type MotionMarginValue = `${number}${"px" | "%"}`;
type MotionMargin = MotionMarginValue | `${MotionMarginValue} ${MotionMarginValue}` | `${MotionMarginValue} ${MotionMarginValue} ${MotionMarginValue}` | `${MotionMarginValue} ${MotionMarginValue} ${MotionMarginValue} ${MotionMarginValue}`;
export const DEFAULT_REPLAY_RESET_MARGIN: MotionMargin = "150% 0px 150% 0px";

export function resolveDelayedReplayActive(previousActive: boolean, entered: boolean, insideResetZone: boolean, reduceMotion = false) {
  if (reduceMotion) return true;
  if (entered) return true;
  if (!insideResetZone) return false;
  return previousActive;
}

/**
 * Keeps a replay-capable presentation visible through its normal viewport exit.
 * It only resets once the element has left the larger reset zone.
 */
export function useDelayedReplay(ref: RefObject<Element | null>, enabled = true, resetMargin: MotionMargin = DEFAULT_REPLAY_RESET_MARGIN, reduceMotion = false) {
  const entered = useInView(ref, { once: false, amount: 0.18, margin: "-10% 0px -10% 0px" });
  const insideResetZone = useInView(ref, { once: false, amount: 0.01, margin: resetMargin });
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setActive((previousActive) => resolveDelayedReplayActive(previousActive, entered, insideResetZone, reduceMotion));
  }, [enabled, entered, insideResetZone, reduceMotion]);

  return enabled ? reduceMotion || active : false;
}

/**
 * The scene owns a safe one-time entrance by default. Marketing sections may
 * opt into a controlled replay when they leave and re-enter the viewport.
 */
export function RevealScene({ children, className, id, role, replayOnReenter = false, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }: SceneProps) {
  const reduceMotion = useReducedMotion() === true;
  const target = useRef<HTMLDivElement>(null);
  const delayedActive = useDelayedReplay(target, replayOnReenter, DEFAULT_REPLAY_RESET_MARGIN, reduceMotion);

  return (
    <motion.section
      ref={target}
      className={className}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-motion-scene
      data-replay-on-reenter={replayOnReenter ? "true" : "false"}
      data-motion-active={replayOnReenter ? delayedActive : undefined}
      initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.99 }}
      animate={replayOnReenter && !reduceMotion ? (delayedActive ? visibleState : { opacity: 0, y: 28, scale: 0.99 }) : undefined}
      whileInView={!replayOnReenter && !reduceMotion ? visibleState : undefined}
      viewport={!replayOnReenter ? oneShotViewport : undefined}
      transition={enterTransition}
    >
      {children}
    </motion.section>
  );
}

/** A local reading-order reveal for headings, cards, rows and media. */
export function RevealItem({ children, className, as = "div", delay = 0, variant = "up", replayOnReenter = false }: { children: ReactNode; className?: string; as?: RevealElement; delay?: number; variant?: RevealVariant; replayOnReenter?: boolean }) {
  const reduceMotion = useReducedMotion() === true;
  const target = useRef<HTMLDivElement>(null);
  const delayedActive = useDelayedReplay(target, replayOnReenter, DEFAULT_REPLAY_RESET_MARGIN, reduceMotion);
  const hiddenState = {
    up: { opacity: 0, y: 28, scale: 0.99 },
    left: { opacity: 0, x: -30, scale: 0.99 },
    right: { opacity: 0, x: 30, scale: 0.99 },
    scale: { opacity: 0, scale: 0.965 },
    object: { opacity: 0, y: 32, scale: 0.97 },
  }[variant];
  const MotionElement = as === "article" ? motion.article : as === "header" ? motion.header : motion.div;

  return (
    <MotionElement
      ref={target}
      className={className}
      data-motion-item
      data-replay-on-reenter={replayOnReenter ? "true" : "false"}
      data-motion-active={replayOnReenter ? delayedActive : undefined}
      initial={reduceMotion ? false : hiddenState}
      animate={replayOnReenter && !reduceMotion ? (delayedActive ? visibleState : hiddenState) : undefined}
      whileInView={!replayOnReenter && !reduceMotion ? visibleState : undefined}
      viewport={!replayOnReenter ? { ...oneShotViewport, amount: 0.2 } : undefined}
      transition={{ ...enterTransition, delay }}
    >
      {children}
    </MotionElement>
  );
}

/**
 * A restrained post-entry focus treatment. It is intentionally separate from
 * RevealScene so content enters at full readability before it gains depth as
 * the reader moves through the page.
 */
export function ScrollFocusScene({ children, className }: { children: ReactNode; className?: string }) {
  const target = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const hasEntered = useInView(target, { once: true, amount: 0.2 });
  const { scrollYProgress } = useScroll({ target, offset: ["start end", "end start"] });
  const opacity = useTransform(scrollYProgress, [0, 0.22, 0.5, 0.78, 1], [0.62, 0.82, 1, 0.82, 0.62]);
  const scale = useTransform(scrollYProgress, [0, 0.22, 0.5, 0.78, 1], [0.985, 0.995, 1, 0.995, 0.985]);
  const y = useTransform(scrollYProgress, [0, 0.22, 0.5, 0.78, 1], [16, 6, 0, -8, -16]);

  return (
    <motion.div
      ref={target}
      className={className}
      data-scroll-focus
      style={reduceMotion || !hasEntered ? undefined : { opacity, scale, y }}
    >
      {children}
    </motion.div>
  );
}

export function RevealLine({ className, delay = 0, replayOnReenter = false }: { className?: string; delay?: number; replayOnReenter?: boolean }) {
  const reduceMotion = useReducedMotion() === true;
  const target = useRef<HTMLSpanElement>(null);
  const delayedActive = useDelayedReplay(target, replayOnReenter, DEFAULT_REPLAY_RESET_MARGIN, reduceMotion);

  return (
    <motion.span
      ref={target}
      className={className}
      aria-hidden="true"
      data-motion-line
      data-replay-on-reenter={replayOnReenter ? "true" : "false"}
      data-motion-active={replayOnReenter ? delayedActive : undefined}
      initial={reduceMotion ? false : { opacity: 0, scaleX: 0 }}
      animate={replayOnReenter && !reduceMotion ? (delayedActive ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }) : undefined}
      whileInView={!replayOnReenter && !reduceMotion ? { opacity: 1, scaleX: 1 } : undefined}
      viewport={!replayOnReenter ? { ...oneShotViewport, amount: 0.25 } : undefined}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "left center" }}
    />
  );
}
