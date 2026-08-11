"use client";

import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

type SceneProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

type RevealElement = "article" | "div" | "header";
type RevealVariant = "up" | "left" | "right" | "scale";

const enterTransition = {
  duration: 0.56,
  ease: [0.22, 1, 0.36, 1] as const,
};

const visibleState = { opacity: 1, x: 0, y: 0, scale: 1 };

/**
 * The scene owns the one-time section entrance. It does not dim future content
 * on page load; Motion only runs the entrance when the section approaches the
 * viewport.
 */
export function RevealScene({ children, className, id, role, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }: SceneProps) {
  const reduceMotion = useReducedMotion() === true;

  return (
    <motion.section
      className={className}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-motion-scene
      initial={reduceMotion ? false : { opacity: 0, y: 34, scale: 0.985 }}
      whileInView={reduceMotion ? undefined : visibleState}
      viewport={{ once: true, amount: 0.18 }}
      transition={enterTransition}
    >
      {children}
    </motion.section>
  );
}

/** A local reading-order reveal for headings, cards, rows and media. */
export function RevealItem({ children, className, as = "div", delay = 0, variant = "up" }: { children: ReactNode; className?: string; as?: RevealElement; delay?: number; variant?: RevealVariant }) {
  const reduceMotion = useReducedMotion() === true;
  const hiddenState = {
    up: { opacity: 0, y: 28, scale: 0.99 },
    left: { opacity: 0, x: -30, scale: 0.99 },
    right: { opacity: 0, x: 30, scale: 0.99 },
    scale: { opacity: 0, scale: 0.965 },
  }[variant];
  const MotionElement = as === "article" ? motion.article : as === "header" ? motion.header : motion.div;

  return (
    <MotionElement
      className={className}
      data-motion-item
      initial={reduceMotion ? false : hiddenState}
      whileInView={reduceMotion ? undefined : visibleState}
      viewport={{ once: true, amount: 0.2 }}
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

export function RevealLine({ className, delay = 0 }: { className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion() === true;

  return (
    <motion.span
      className={className}
      aria-hidden="true"
      data-motion-line
      initial={reduceMotion ? false : { opacity: 0, scaleX: 0 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, scaleX: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "left center" }}
    />
  );
}
