"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { LANDING_MEDIA, type LandingMediaKey } from "@/components/marketing/landing-media";
import { HanoiRouteStory } from "@/components/marketing/route-story";
import styles from "@/components/marketing/media-slot.module.css";
import { usePrefersReducedMotion } from "@/components/marketing/use-motion-preference";

type HeroMediaLifecycle = "video" | "transition-to-poster" | "poster-hold" | "restart";

export function HeroMedia() {
  const reduceMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const restartTimerRef = useRef<number | null>(null);
  const playRequestRef = useRef<Promise<void> | null>(null);
  const lifecycleRef = useRef<HeroMediaLifecycle>("video");
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [lifecycle, setLifecycle] = useState<HeroMediaLifecycle>("video");

  function updateLifecycle(next: HeroMediaLifecycle) {
    lifecycleRef.current = next;
    setLifecycle(next);
  }

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current === null) return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const handleVideoFailure = useCallback(() => {
    clearRestartTimer();
    playRequestRef.current = null;
    setVideoFailed(true);
    setVideoReady(false);
    setPlaybackBlocked(false);
    updateLifecycle("poster-hold");
  }, [clearRestartTimer]);

  const handlePlaybackRejection = useCallback(() => {
    playRequestRef.current = null;
    setPlaybackBlocked(true);
    setVideoReady(false);
  }, []);

  const attemptPlayback = useCallback((force = false) => {
    if (reduceMotion || videoFailed || document.visibilityState === "hidden") return;

    const lifecycle = lifecycleRef.current;
    if (lifecycle === "poster-hold" || lifecycle === "transition-to-poster") return;
    if (lifecycle === "video" && videoReady && !force) return;

    const video = videoRef.current;
    if (!video || typeof video.play !== "function") return;
    if (playRequestRef.current && !force) return;
    if (force) playRequestRef.current = null;

    let playResult: Promise<void>;
    try {
      playResult = video.play();
    } catch {
      handlePlaybackRejection();
      return;
    }

    const playRequest = Promise.resolve(playResult);
    playRequestRef.current = playRequest;
    void playRequest.then(
      () => {
        if (playRequestRef.current === playRequest) playRequestRef.current = null;
      },
      () => {
        if (playRequestRef.current === playRequest) handlePlaybackRejection();
      },
    );
  }, [handlePlaybackRejection, reduceMotion, videoFailed, videoReady]);

  const scheduleRestart = useCallback(() => {
    clearRestartTimer();
    if (reduceMotion || videoFailed || document.visibilityState === "hidden") return;

    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (reduceMotion || videoFailed || document.visibilityState === "hidden") return;
      const video = videoRef.current;
      if (!video) return;
      updateLifecycle("restart");
      setPlaybackBlocked(false);
      video.currentTime = 0;
      attemptPlayback(true);
    }, 2000);
  }, [attemptPlayback, clearRestartTimer, reduceMotion, videoFailed]);

  function handlePlaying() {
    playRequestRef.current = null;
    setVideoReady(true);
    setPlaybackBlocked(false);
    updateLifecycle("video");
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearRestartTimer();
        playRequestRef.current = null;
      } else if (lifecycleRef.current === "poster-hold") {
        scheduleRestart();
      } else {
        attemptPlayback(true);
      }
    }

    function handlePageShow() {
      if (document.visibilityState !== "hidden") attemptPlayback(true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    attemptPlayback();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      clearRestartTimer();
    };
  }, [attemptPlayback, clearRestartTimer, reduceMotion, scheduleRestart, videoFailed]);

  const videoVisible = !reduceMotion && !videoFailed && !playbackBlocked && lifecycle === "video";
  const posterVisible = reduceMotion || videoFailed || playbackBlocked || lifecycle !== "video";
  const videoType = getVideoType(LANDING_MEDIA.heroVideo);

  return (
    <div className={styles.heroMedia} aria-hidden="true">
      {!reduceMotion && !videoFailed ? (
        <video
          ref={videoRef}
          className={`${styles.heroMediaVideo} ${videoVisible ? styles.heroMediaVideoVisible : ""}`}
          data-hero-video-state={videoVisible ? "visible" : "waiting"}
          autoPlay
          loop={false}
          muted
          playsInline
          poster={LANDING_MEDIA.heroPoster}
          preload="auto"
          onLoadedMetadata={() => attemptPlayback(true)}
          onLoadedData={() => attemptPlayback(true)}
          onCanPlay={() => attemptPlayback(true)}
          onError={handleVideoFailure}
          onPlaying={handlePlaying}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (lifecycleRef.current === "video" && Number.isFinite(video.duration) && video.duration - video.currentTime <= 0.42) {
              updateLifecycle("transition-to-poster");
            }
          }}
          onEnded={() => {
            updateLifecycle("poster-hold");
            scheduleRestart();
          }}
        >
          <source src={LANDING_MEDIA.heroVideo} type={videoType} />
        </video>
      ) : null}
      {!posterFailed ? (
        <Image
          className={`${styles.heroMediaPoster} ${posterVisible ? "" : styles.heroMediaPosterHidden}`}
          data-hero-poster-state={posterVisible ? "visible" : "hidden"}
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

function getVideoType(source: string): "video/mp4" | "video/webm" | undefined {
  const pathname = source.split(/[?#]/, 1)[0].toLowerCase();
  if (pathname.endsWith(".webm")) return "video/webm";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  return undefined;
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
