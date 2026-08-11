"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

type ScrollFocusSceneProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/**
 * A bounded editorial focus treatment for meaningful landing scenes.
 * The section owns its progress; no React state is updated per scroll frame.
 */
export function ScrollFocusScene({ children, className, id, role, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }: ScrollFocusSceneProps) {
  const target = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start end", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.22, 0.5, 0.78, 1], [0.12, 0.42, 1, 0.42, 0.12]);
  const scale = useTransform(scrollYProgress, [0, 0.22, 0.5, 0.78, 1], [0.975, 0.99, 1, 0.99, 0.975]);
  const y = useTransform(scrollYProgress, [0, 0.22, 0.5, 0.78, 1], [40, 14, 0, -14, -40]);

  return (
    <motion.section
      ref={target}
      className={className}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={reduceMotion ? { opacity: 1, scale: 1, y: 0 } : { opacity, scale, y }}
    >
      {children}
    </motion.section>
  );
}
