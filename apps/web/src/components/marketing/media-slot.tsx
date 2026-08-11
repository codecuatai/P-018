"use client";

import { MapPin, Navigation } from "lucide-react";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { useState } from "react";

import { LANDING_MEDIA, type LandingMediaKey } from "@/components/marketing/landing-media";

export function HeroMedia() {
  const reduceMotion = useReducedMotion() === true;
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <div className="hero-media" aria-hidden="true">
      {!reduceMotion && !videoFailed ? (
        <video
          className="hero-media-video"
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
      {(reduceMotion || videoFailed) && !posterFailed ? (
        <Image
          className="hero-media-poster"
          src={LANDING_MEDIA.heroPoster}
          alt=""
          fill
          priority
          sizes="100vw"
          onError={() => setPosterFailed(true)}
        />
      ) : null}
      {(reduceMotion || videoFailed) && posterFailed ? <div className="hero-media-fallback" /> : null}
      <div className="hero-media-veil" />
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
    <figure className={`product-media-slot ${className} ${failed ? "is-fallback" : ""}`}>
      {failed ? (
        <div className="media-slot-fallback">
          <span className="media-slot-kicker">MEDIA SLOT</span>
          <strong>{title}</strong>
          <p>{description}</p>
          <code>{src}</code>
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
  const [failed, setFailed] = useState(false);

  return (
    <div className={`map-media ${failed ? "is-fallback" : ""}`} role="img" aria-label="Bản đồ minh hoạ khu vực Hồ Hoàn Kiếm">
      {failed ? (
        <div className="media-slot-fallback">
          <span className="media-slot-kicker">MEDIA SLOT</span>
          <strong>Bản đồ khu vực Hà Nội</strong>
          <p>Ảnh minh hoạ bản đồ sẽ xuất hiện khi media marketing được cung cấp.</p>
          <code>{LANDING_MEDIA.hanoiMap}</code>
        </div>
      ) : (
        <Image
          src={LANDING_MEDIA.hanoiMap}
          alt="Bản đồ minh hoạ khu vực Hồ Hoàn Kiếm"
          width={1240}
          height={760}
          sizes="(max-width: 820px) 100vw, 58vw"
          onError={() => setFailed(true)}
        />
      )}
      {!failed ? (
        <>
          <span className="map-route-accent" aria-hidden="true" />
          <span className="map-marker map-marker-pickup"><MapPin size={15} /> Điểm đón</span>
          <span className="map-marker map-marker-destination"><Navigation size={15} /> Điểm đến</span>
          <span className="map-caption">Bản đồ minh hoạ Hà Nội · không phải theo dõi trực tiếp</span>
        </>
      ) : null}
    </div>
  );
}
