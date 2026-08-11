"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";

import styles from "@/components/marketing/floating-product-image.module.css";

interface FloatingProductImageProps {
  src: string;
  alt: string;
  fallback: ReactNode;
  className?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

const hoverTransition = { type: "spring" as const, stiffness: 280, damping: 22, mass: 0.7 };

export function FloatingProductImage({
  src,
  alt,
  fallback,
  className = "",
  sizes = "(max-width: 560px) 100vw, (max-width: 1200px) 45vw, 25vw",
  width = 720,
  height = 560,
}: FloatingProductImageProps) {
  const reduceMotion = useReducedMotion() === true;
  const [failed, setFailed] = useState(false);

  return (
    <motion.div
      className={`${styles.image} ${className} ${failed ? styles.imageFallback : ""}`}
      whileHover={reduceMotion || failed ? undefined : { y: -8, scale: 1.025, rotate: 0.45 }}
      transition={hoverTransition}
    >
      {failed ? fallback : <Image src={src} alt={alt} width={width} height={height} sizes={sizes} onError={() => setFailed(true)} />}
    </motion.div>
  );
}
