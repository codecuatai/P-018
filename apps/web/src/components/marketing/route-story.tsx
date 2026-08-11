"use client";

import Image from "next/image";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";

import { LANDING_MEDIA } from "@/components/marketing/landing-media";
import styles from "@/components/marketing/route-story.module.css";

const routeTransition = { duration: 0.78, ease: [0.22, 1, 0.36, 1] as const };
const destinationTransition = { duration: 0.44, ease: [0.22, 1, 0.36, 1] as const };

interface HanoiRouteStoryProps {
  mediaAvailable?: boolean;
}

const destinations = [
  { id: "food", label: "Đồ ăn", x: 185, y: 152 },
  { id: "restaurant", label: "Nhà hàng", x: 250, y: 490 },
  { id: "ride", label: "Chuyến xe", x: 805, y: 150 },
  { id: "healthcare", label: "Lịch khám", x: 790, y: 465 },
] as const;

export function HanoiRouteStory({ mediaAvailable = true }: HanoiRouteStoryProps) {
  const reduceMotion = useReducedMotion() === true;
  const sceneRef = useRef<HTMLDivElement>(null);
  const entered = useInView(sceneRef, { once: true, amount: 0.24 });
  const [mediaFailed, setMediaFailed] = useState(false);
  const { scrollYProgress } = useScroll({ target: sceneRef, offset: ["start end", "end start"] });
  const mapScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.005, 1.015, 1.005]);
  const routesVisible = reduceMotion || entered;
  const showMedia = mediaAvailable && !mediaFailed;

  return (
    <div
      ref={sceneRef}
      className={`${styles.scene} ${!showMedia ? styles.sceneFallback : ""}`}
      role="img"
      aria-label="Bản đồ minh hoạ cách X-One kết nối các điểm dịch vụ tại Hà Nội, không phải theo dõi trực tiếp"
    >
      {showMedia ? (
        <motion.div className={styles.mapFrame} style={reduceMotion ? undefined : { scale: mapScale }}>
          <motion.div
            className={styles.mapImage}
            initial={reduceMotion ? false : { opacity: 0.75, scale: 1.035 }}
            animate={reduceMotion ? undefined : entered ? { opacity: 1, scale: 1 } : undefined}
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
          <svg className={styles.routeOverlay} viewBox="0 0 1000 620" aria-hidden="true" focusable="false">
            <motion.path
              className={styles.routePath}
              d="M505 320 C430 260 300 190 185 152"
              initial={reduceMotion ? { pathLength: 1, opacity: 0.88 } : { pathLength: 0, opacity: 0 }}
              animate={reduceMotion ? undefined : routesVisible ? { pathLength: 1, opacity: 0.88 } : { pathLength: 0, opacity: 0 }}
              transition={routeTransition}
            />
            <motion.path
              className={`${styles.routePath} ${styles.routePathTeal}`}
              d="M505 320 C425 380 330 455 250 490"
              initial={reduceMotion ? { pathLength: 1, opacity: 0.82 } : { pathLength: 0, opacity: 0 }}
              animate={reduceMotion ? undefined : routesVisible ? { pathLength: 1, opacity: 0.82 } : { pathLength: 0, opacity: 0 }}
              transition={{ ...routeTransition, delay: 0.14 }}
            />
            <motion.path
              className={styles.routePath}
              d="M505 320 C620 260 700 185 805 150"
              initial={reduceMotion ? { pathLength: 1, opacity: 0.88 } : { pathLength: 0, opacity: 0 }}
              animate={reduceMotion ? undefined : routesVisible ? { pathLength: 1, opacity: 0.88 } : { pathLength: 0, opacity: 0 }}
              transition={{ ...routeTransition, delay: 0.28 }}
            />
            <motion.path
              className={`${styles.routePath} ${styles.routePathTeal}`}
              d="M505 320 C620 385 705 445 790 465"
              initial={reduceMotion ? { pathLength: 1, opacity: 0.82 } : { pathLength: 0, opacity: 0 }}
              animate={reduceMotion ? undefined : routesVisible ? { pathLength: 1, opacity: 0.82 } : { pathLength: 0, opacity: 0 }}
              transition={{ ...routeTransition, delay: 0.42 }}
            />
            <motion.g
              className={styles.originMarker}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={reduceMotion ? undefined : routesVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
              transition={{ ...destinationTransition, delay: 0.5 }}
              style={{ transformOrigin: "505px 320px" }}
            >
              <circle cx="505" cy="320" r="18" />
              <circle className={styles.originCore} cx="505" cy="320" r="6" />
              <text x="505" y="356" textAnchor="middle">Bạn</text>
            </motion.g>
            {destinations.map((destination, index) => (
              <motion.g
                key={destination.id}
                className={styles.destinationMarker}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.75 }}
                animate={reduceMotion ? undefined : routesVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.75 }}
                transition={{ ...destinationTransition, delay: 0.62 + index * 0.12 }}
                style={{ transformOrigin: `${destination.x}px ${destination.y}px` }}
              >
                <circle cx={destination.x} cy={destination.y} r="10" />
                <circle className={styles.destinationCore} cx={destination.x} cy={destination.y} r="3.5" />
                <text x={destination.x + 18} y={destination.y + 5}>{destination.label}</text>
              </motion.g>
            ))}
          </svg>
          <span className={styles.sceneCaption}>Bản đồ minh hoạ · không theo dõi trực tiếp</span>
        </motion.div>
      ) : (
        <div className={styles.fallbackPanel}>
          <span className={styles.fallbackKicker}>X-ONE / LỘ TRÌNH</span>
          <strong>Bản đồ khu vực Hà Nội</strong>
          <p>Giữ các điểm liên quan trong cùng một ngữ cảnh khi media được cung cấp.</p>
        </div>
      )}
    </div>
  );
}
