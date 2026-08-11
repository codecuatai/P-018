"use client";

import { MapPin, Navigation } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useState } from "react";

import { LANDING_MEDIA, type LandingMediaKey } from "@/components/marketing/landing-media";
import styles from "@/components/marketing/media-slot.module.css";

const mediaTransition = { duration: 0.62, ease: [0.22, 1, 0.36, 1] as const };

export function HeroMedia() {
  const reduceMotion = useReducedMotion() === true;
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <div className={styles.heroMedia} aria-hidden="true">
      {!reduceMotion && !videoFailed ? (
        <video
          className={styles.heroMediaVideo}
          autoPlay
          muted
          loop
          playsInline
          poster={posterFailed ? undefined : LANDING_MEDIA.heroPoster}
          onError={() => setVideoFailed(true)}
        >
          <source src={LANDING_MEDIA.heroVideo} type="video/mp4" />
        </video>
      ) : null}
      {!posterFailed ? (
        <Image
          className={styles.heroMediaPoster}
          src={LANDING_MEDIA.heroPoster}
          alt=""
          fill
          priority
          sizes="100vw"
          onError={() => setPosterFailed(true)}
        />
      ) : <div className={styles.heroMediaFallback} />}
      <div className={styles.heroMediaVeil} />
    </div>
  );
}

interface ProductMediaSlotProps {
  mediaKey: Extract<LandingMediaKey, "xoneChatExample" | "xoneConfirmationExample">;
  title: string;
  description: string;
  caption: string;
  className?: string;
}

export function ProductMediaSlot({ mediaKey, title, description, caption, className = "" }: ProductMediaSlotProps) {
  const [failed, setFailed] = useState(false);
  const src = LANDING_MEDIA[mediaKey];

  return (
    <figure className={`${styles.productMediaSlot} ${className} ${failed ? styles.productMediaSlotFallback : ""}`}>
      {failed ? (
        <div className={styles.productFallback}>
          <span className={styles.fallbackKicker}>TRẢI NGHIỆM X-ONE</span>
          <div className={styles.fallbackWindow} aria-hidden="true">
            <div className={styles.fallbackWindowBar}><span /><span /></div>
            <span className={styles.fallbackWindowLine} />
            <span className={styles.fallbackWindowLineShort} />
            <span className={styles.fallbackWindowAction} />
          </div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      ) : (
        <Image
          src={src}
          alt={title}
          width={1240}
          height={860}
          sizes="(max-width: 820px) 100vw, 55vw"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function HanoiMapMedia() {
  const reduceMotion = useReducedMotion() === true;
  const [failed, setFailed] = useState(false);

  return (
    <div className={`${styles.mapMedia} ${failed ? styles.mapFallback : ""}`} role="img" aria-label="Bản đồ minh hoạ khu vực Hồ Hoàn Kiếm">
      {failed ? (
        <div className={styles.mapFallbackPanel}>
          <div className={styles.mapFallbackGrid} aria-hidden="true" />
          <strong>Bản đồ khu vực Hà Nội</strong>
          <p>Bản minh hoạ giúp đặt điểm đón và điểm đến trong cùng một ngữ cảnh.</p>
        </div>
      ) : (
        <motion.div
          className={styles.mapImage}
          initial={reduceMotion ? false : { opacity: 0.78, scale: 1.035 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={mediaTransition}
        >
          <Image
            src={LANDING_MEDIA.hanoiMap}
            alt="Bản đồ minh hoạ khu vực Hồ Hoàn Kiếm"
            fill
            sizes="(max-width: 820px) 100vw, 58vw"
            onError={() => setFailed(true)}
          />
        </motion.div>
      )}
      {!failed ? (
        <>
          <motion.span className={styles.routeAccent} aria-hidden="true" initial={reduceMotion ? false : { opacity: 0, scaleX: 0 }} whileInView={reduceMotion ? undefined : { opacity: 0.92, scaleX: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ ...mediaTransition, delay: 0.28 }} />
          <motion.span className={`${styles.marker} ${styles.markerPickup}`} initial={reduceMotion ? false : { opacity: 0, scale: 0.82 }} whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ ...mediaTransition, delay: 0.42 }}><MapPin size={15} /> Điểm đón</motion.span>
          <motion.span className={`${styles.marker} ${styles.markerDestination}`} initial={reduceMotion ? false : { opacity: 0, scale: 0.82 }} whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ ...mediaTransition, delay: 0.5 }}><Navigation size={15} /> Điểm đến</motion.span>
          <span className={styles.mapCaption}>Bản đồ minh hoạ Hà Nội · không phải theo dõi trực tiếp</span>
        </>
      ) : null}
    </div>
  );
}
