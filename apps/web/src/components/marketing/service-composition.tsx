"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";

import { LANDING_MEDIA } from "@/components/marketing/landing-media";
import { useDelayedReplay } from "@/components/marketing/scroll-focus-scene";
import styles from "@/components/marketing/service-composition.module.css";

export const SERVICE_DEFINITIONS = [
  {
    id: "food",
    title: "Đồ ăn",
    copy: "Tìm món bạn muốn, chọn quán và chuẩn bị đơn giao.",
    image: LANDING_MEDIA.serviceFood,
    alt: "Món ăn được chuẩn bị để giao",
    position: "food",
  },
  {
    id: "ride",
    title: "Chuyến xe",
    copy: "Chọn điểm đón, điểm đến và xem chuyến xe phù hợp.",
    image: LANDING_MEDIA.serviceRide,
    alt: "Một chuyến xe sẵn sàng đón bạn",
    position: "ride",
  },
  {
    id: "restaurant",
    title: "Nhà hàng",
    copy: "Tìm nhà hàng, chọn thời gian và giữ bàn trước khi xác nhận.",
    image: LANDING_MEDIA.serviceRestaurant,
    alt: "Mặt tiền một nhà hàng",
    position: "restaurant",
  },
  {
    id: "healthcare",
    title: "Lịch khám",
    copy: "Tìm cơ sở, bác sĩ và khung giờ phù hợp để đặt lịch.",
    image: LANDING_MEDIA.serviceHealthcare,
    alt: "Một cơ sở y tế",
    position: "healthcare",
  },
] as const;

type ServiceId = (typeof SERVICE_DEFINITIONS)[number]["id"];
type ServicePosition = (typeof SERVICE_DEFINITIONS)[number]["position"];

const SERVICE_POSES: Record<ServicePosition, { rotateX: number; rotateY: number; rotateZ: number; z: number; scale: number }> = {
  restaurant: { rotateX: 2.5, rotateY: -5, rotateZ: -1.1, z: 18, scale: 1.04 },
  ride: { rotateX: -2, rotateY: 5.5, rotateZ: 1.1, z: 10, scale: 0.96 },
  healthcare: { rotateX: 1.5, rotateY: -3.5, rotateZ: 0.8, z: 4, scale: 0.88 },
  food: { rotateX: -1, rotateY: 4.5, rotateZ: -1.4, z: 12, scale: 0.91 },
};

const ENTRY_VECTORS: Record<ServicePosition, { x: number; y: number }> = {
  restaurant: { x: -18, y: 18 },
  ride: { x: 20, y: 10 },
  healthcare: { x: -12, y: 24 },
  food: { x: 16, y: 26 },
};

const physicalTransition = { type: "spring" as const, stiffness: 260, damping: 24, mass: 0.72 };
const reducedTransition = { duration: 0.01 };
const revealTransition = { duration: 0.62, ease: [0.22, 1, 0.36, 1] as const };

export function ServiceComposition() {
  const reduceMotion = useReducedMotion() === true;
  const compositionRef = useRef<HTMLDivElement>(null);
  const visible = useDelayedReplay(compositionRef, true, undefined, reduceMotion);
  const [activeId, setActiveId] = useState<ServiceId>("food");
  const [failedImages, setFailedImages] = useState<Set<ServiceId>>(() => new Set());

  const markImageFailed = useCallback((id: ServiceId) => {
    setFailedImages((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const activeService = SERVICE_DEFINITIONS.find((service) => service.id === activeId) ?? SERVICE_DEFINITIONS[0];

  return (
    <motion.div
      ref={compositionRef}
      className={styles.layout}
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.99 }}
      animate={reduceMotion || visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.99 }}
      transition={reduceMotion ? reducedTransition : revealTransition}
      data-service-composition
      data-service-autoplay="false"
      data-service-orbit="false"
      data-service-visible={visible ? "true" : "false"}
      data-selected-service={activeService.id}
    >
      <div className={styles.copyColumn} aria-live="polite">
        <h2 id="services-title">Những việc bạn cần mỗi ngày, bắt đầu từ một chỗ.</h2>
        <p className={styles.lead}>Ăn gì, đi đâu, đặt bàn hay đặt lịch khám, bạn có thể bắt đầu ngay trong X-One.</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeService.id}
            className={styles.activeCopy}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -7 }}
            transition={reduceMotion ? reducedTransition : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <h3>{activeService.title}</h3>
            <p>{activeService.copy}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={styles.scene} role="group" aria-label="Chọn một dịch vụ">
        <motion.div
          className={styles.sceneBaseReveal}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
          animate={reduceMotion || visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
          transition={reduceMotion ? reducedTransition : { ...revealTransition, delay: 0.04 }}
          aria-hidden="true"
        >
          <div className={styles.sceneBase} />
        </motion.div>

        {SERVICE_DEFINITIONS.map((service, index) => {
          const active = service.id === activeId;
          const pose = SERVICE_POSES[service.position];
          const restingPose = reduceMotion
            ? { rotateX: 0, rotateY: 0, rotateZ: 0, z: 0, scale: pose.scale * (active ? 1.025 : 1), opacity: 1 }
            : { ...pose, scale: pose.scale * (active ? 1.025 : 1), opacity: 1 };
          const entryVector = ENTRY_VECTORS[service.position];
          const entryPose = reduceMotion
            ? restingPose
            : { ...entryVector, z: pose.z - 6, scale: pose.scale * 0.975, opacity: 0 };
          const hoverPose = reduceMotion
            ? { scale: restingPose.scale + 0.015 }
            : {
                y: -7,
                z: pose.z + 24,
                scale: restingPose.scale + 0.018,
                rotateX: -2.5,
                rotateY: pose.rotateY + (service.position === "restaurant" || service.position === "healthcare" ? -1 : 1),
                rotateZ: pose.rotateZ,
              };

          return (
            <motion.button
              key={service.id}
              type="button"
              className={`${styles.slab} ${styles[`slab${capitalize(service.position)}`]} ${active ? styles.slabActive : ""}`}
              initial={reduceMotion ? false : entryPose}
              animate={reduceMotion || visible ? restingPose : entryPose}
              whileHover={hoverPose}
              whileFocus={hoverPose}
              whileTap={reduceMotion ? { scale: restingPose.scale * 0.99 } : { scale: restingPose.scale * 0.99, y: -2 }}
              transition={reduceMotion ? reducedTransition : { ...physicalTransition, delay: visible ? 0.1 + index * 0.08 : 0 }}
              aria-label={`Chọn dịch vụ ${service.title}`}
              aria-pressed={active}
              data-service-button
              data-service-id={service.id}
              data-service-active={active ? "true" : "false"}
              onClick={() => setActiveId(service.id)}
            >
              <span className={styles.slabMaterial}>
                <span className={styles.slabIndex} aria-hidden="true">0{index + 1}</span>
                <span className={styles.slabImage}>
                  {failedImages.has(service.id) ? (
                    <span className={styles.imageFallback}>{service.title}</span>
                  ) : (
                    <Image src={service.image} alt={service.alt} width={720} height={480} sizes="(max-width: 560px) 52vw, (max-width: 820px) 34vw, 24vw" onError={() => markImageFailed(service.id)} />
                  )}
                </span>
                <span className={styles.labelPlate}>{service.title}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
