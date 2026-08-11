"use client";

import { useReducedMotion } from "motion/react";
import Image from "next/image";
import { useRef, useState } from "react";

import { LANDING_MEDIA, type LandingMediaKey } from "@/components/marketing/landing-media";
import { HanoiRouteStory } from "@/components/marketing/route-story";
import styles from "@/components/marketing/media-slot.module.css";

export function HeroMedia() {
  const reduceMotion = useReducedMotion() === true;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [loopCrossfading, setLoopCrossfading] = useState(false);
  const loopFadeStarted = useRef(false);

  function startLoopCrossfade() {
    if (loopFadeStarted.current) return;
    loopFadeStarted.current = true;
    setLoopCrossfading(true);
  }

  function restartVideo() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => setVideoFailed(true));
  }

  function handlePlaying() {
    if (loopFadeStarted.current && (videoRef.current?.currentTime ?? 1) < 0.35) {
      loopFadeStarted.current = false;
      setLoopCrossfading(false);
    }
    setVideoReady(true);
  }

  return (
    <div className={styles.heroMedia} aria-hidden="true">
      {!reduceMotion && !videoFailed ? (
        <video
          ref={videoRef}
          className={`${styles.heroMediaVideo} ${videoReady && !loopCrossfading ? styles.heroMediaVideoReady : ""}`}
          autoPlay
          muted
          playsInline
          preload="auto"
          poster={posterFailed ? undefined : LANDING_MEDIA.heroPoster}
          onError={() => setVideoFailed(true)}
          onPlaying={handlePlaying}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration) && video.duration - video.currentTime <= 0.68) startLoopCrossfade();
          }}
          onEnded={() => {
            startLoopCrossfade();
            restartVideo();
          }}
        >
          <source src={LANDING_MEDIA.heroVideo} type="video/mp4" />
        </video>
      ) : null}
      {!posterFailed ? (
        <Image
          className={`${styles.heroMediaPoster} ${videoReady && !loopCrossfading ? styles.heroMediaPosterCovered : ""}`}
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
  return <HanoiRouteStory />;
}
