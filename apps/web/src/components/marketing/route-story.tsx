"use client";

import Image from "next/image";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";

import { LANDING_MEDIA } from "@/components/marketing/landing-media";
import { useDelayedReplay } from "@/components/marketing/scroll-focus-scene";
import styles from "@/components/marketing/route-story.module.css";

const routeTransition = { duration: 0.78, ease: [0.22, 1, 0.36, 1] as const };
const destinationTransition = { duration: 0.44, ease: [0.22, 1, 0.36, 1] as const };

interface HanoiRouteStoryProps {
  mediaAvailable?: boolean;
}

export const MAP_DESTINATIONS = [
  { id: "northwest", x: 128, y: 126 },
  { id: "north", x: 380, y: 96 },
  { id: "northeast", x: 770, y: 130 },
  { id: "west", x: 160, y: 310 },
  { id: "center", x: 500, y: 285 },
  { id: "southwest", x: 270, y: 470 },
  { id: "south", x: 610, y: 430 },
] as const;

export const MAP_ROUTES = [
  { id: "northwest", d: "M870 520 C760 390 360 120 128 126", delay: 0 },
  { id: "north", d: "M870 520 C770 320 540 120 380 96", delay: 0.1 },
  { id: "northeast", d: "M870 520 C900 360 850 200 770 130", delay: 0.2 },
  { id: "west", d: "M870 520 C650 520 330 300 160 310", delay: 0.3 },
  { id: "center", d: "M870 520 C760 420 640 300 500 285", delay: 0.4 },
  { id: "southwest", d: "M870 520 C660 560 400 530 270 470", delay: 0.5 },
  { id: "south", d: "M870 520 C780 500 680 450 610 430", delay: 0.6 },
] as const;

export function HanoiRouteStory({ mediaAvailable = true }: HanoiRouteStoryProps) {
  const reduceMotion = useReducedMotion() === true;
  const sceneRef = useRef<HTMLDivElement>(null);
  const entered = useInView(sceneRef, { once: false, amount: 0.24, margin: "-10% 0px -10% 0px" });
  const delayedActive = useDelayedReplay(sceneRef, true, undefined, reduceMotion);
  const [mediaFailed, setMediaFailed] = useState(false);
  const { scrollYProgress } = useScroll({ target: sceneRef, offset: ["start end", "end start"] });
  const mapScale = useTransform(scrollYProgress, [0, 0.34, 0.5, 1], [1.045, 1.02, 1, 1.015]);
  const sceneVisible = reduceMotion || delayedActive;
  const showMedia = mediaAvailable && !mediaFailed;

  return (
    <div
      ref={sceneRef}
      className={`${styles.scene} ${!showMedia ? styles.sceneFallback : ""}`}
      role="img"
      aria-label="Bản đồ minh hoạ cách X-One kết nối các điểm dịch vụ tại Hà Nội, không phải theo dõi trực tiếp"
    >
      {showMedia ? (
        <motion.div
          className={styles.mapFrame}
          initial={reduceMotion ? false : { clipPath: "inset(5% 7%)" }}
          animate={reduceMotion ? undefined : sceneVisible ? { clipPath: "inset(0% 0%)" } : { clipPath: "inset(5% 7%)" }}
          transition={routeTransition}
        >
          <motion.div className={styles.mapArt} style={reduceMotion ? undefined : { scale: mapScale }}>
          <motion.div
            className={styles.mapImage}
            initial={reduceMotion ? false : { opacity: 0.75, scale: 1.035 }}
            animate={reduceMotion ? undefined : sceneVisible ? { opacity: 1, scale: 1 } : { opacity: 0.75, scale: 1.035 }}
            transition={routeTransition}
          >
            <Image
              src={LANDING_MEDIA.hanoiMap}
              alt=""
              fill
              sizes="(max-width: 820px) 100vw, 58vw"
              onError={() => setMediaFailed(true)}
            />
          </motion.div>
          <svg className={styles.routeOverlay} viewBox="0 0 1000 620" aria-hidden="true" focusable="false" data-route-motion={reduceMotion ? "reduced" : "continuous"} data-route-repeat={reduceMotion ? "false" : entered ? "true" : "false"}>
            {MAP_ROUTES.map((route) => (
              <g key={route.id}>
                <path className={styles.routePathBase} data-route-base="true" d={route.d} />
                <motion.path
                  className={styles.routePathTracer}
                  data-route-tracer="true"
                  d={route.d}
                  initial={reduceMotion ? { pathLength: 1, opacity: 0 } : { pathLength: 0, opacity: 0 }}
                  animate={reduceMotion ? { pathLength: 1, opacity: 0 } : entered ? { pathLength: [0, 1, 1], opacity: [0, 0.84, 0] } : { pathLength: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0.01 } : { duration: 1.5, delay: route.delay, repeat: Infinity, repeatDelay: 0.12, ease: "easeInOut", times: [0, 0.8, 1] }}
                />
              </g>
            ))}
            <motion.g
              className={styles.originMarker}
              data-origin-marker="true"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={reduceMotion ? undefined : sceneVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
              transition={{ ...destinationTransition, delay: 0.1 }}
              style={{ transformOrigin: "870px 520px" }}
            >
              <circle cx="870" cy="520" r="18" />
              <circle className={styles.originCore} cx="870" cy="520" r="6" />
              <text x="870" y="556" textAnchor="middle">Bạn</text>
            </motion.g>
            {MAP_DESTINATIONS.map((destination, index) => (
              <motion.g
                key={destination.id}
                className={styles.destinationMarker}
                data-destination-marker="true"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.75 }}
                animate={reduceMotion ? undefined : sceneVisible ? { opacity: 1, scale: entered ? [1, 1.06, 1] : 1 } : { opacity: 0, scale: 0.75 }}
                transition={reduceMotion ? destinationTransition : entered ? { duration: 1.5, delay: 1.1 + index * 0.12, repeat: Infinity, repeatDelay: 0.12, ease: "easeInOut", times: [0, 0.5, 1] } : destinationTransition}
                style={{ transformOrigin: `${destination.x}px ${destination.y}px` }}
              >
                <circle cx={destination.x} cy={destination.y} r="10" />
                <circle className={styles.destinationCore} cx={destination.x} cy={destination.y} r="3.5" />
              </motion.g>
            ))}
          </svg>
          <span className={styles.sceneCaption}>Minh hoạ cách X-One hiển thị địa điểm và lộ trình.</span>
          </motion.div>
        </motion.div>
      ) : (
        <div className={styles.fallbackPanel}>
          <strong>Bản đồ khu vực Hà Nội</strong>
          <p>Điểm đón, điểm đến và những địa điểm liên quan được đặt cạnh nhau để bạn dễ hình dung hành trình.</p>
        </div>
      )}
    </div>
  );
}
