"use client";

import { motion, useReducedMotion } from "motion/react";

import { XOneMark } from "@/components/XOneMark";

export function HeroNetwork() {
  const reduceMotion = useReducedMotion();
  const videoUrl = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;
  const posterUrl = process.env.NEXT_PUBLIC_HERO_POSTER_URL;

  return <div className="network-visual">
    {videoUrl && !reduceMotion ? <video className="hero-ambient-video" autoPlay muted loop playsInline poster={posterUrl} aria-hidden="true"><source src={videoUrl} /></video> : null}
    <svg className="network-rails" viewBox="0 0 500 350" aria-hidden="true">
      <motion.path d="M250 28V138M52 175H192M308 175H448M250 322V212" initial={{ pathLength: reduceMotion ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut" }} />
      {[[250, 28], [52, 175], [448, 175], [250, 322]].map(([cx, cy], index) => <motion.circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 0.6 + index * 0.08 }} />)}
    </svg>
    <span className="network-label network-food">ĐỒ ĂN</span><span className="network-label network-ride">CHUYẾN XE</span><span className="network-label network-restaurant">NHÀ HÀNG</span><span className="network-label network-health">LỊCH KHÁM</span>
    <motion.div className="network-core" initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : 0.22 }}><XOneMark size={48} /><strong>X-One</strong><span>một điểm kết nối</span></motion.div>
    {!reduceMotion ? <><motion.i className="signal signal-one" animate={{ y: [0, 92, 0], opacity: [0, 1, 0] }} transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }} /><motion.i className="signal signal-two" animate={{ x: [0, 116, 0], opacity: [0, 1, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} /></> : null}
  </div>;
}
