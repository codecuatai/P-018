"use client";

import { ArrowUp, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { useMarketingAuth } from "@/components/marketing/marketing-auth";
import styles from "@/components/marketing/hero-composer.module.css";
import { useAuth } from "@/providers/auth-provider";
import { usePrefersReducedMotion } from "@/components/marketing/use-motion-preference";

export const HERO_PROMPTS = [
  "Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ",
  "Tìm phở bò giao về nhà",
  "Tối nay tìm nhà hàng cho 2 người ở Hà Nội",
  "Tìm lịch khám thần kinh sáng mai",
  "Đặt bàn tối nay rồi gọi xe đưa tôi tới đó",
] as const;

export function HeroComposer() {
  const router = useRouter();
  const { status } = useAuth();
  const { openAuth } = useMarketingAuth();
  const reduceMotion = usePrefersReducedMotion();
  const [draft, setDraft] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (reduceMotion || hasInteracted) return;
    const timer = window.setInterval(() => setPromptIndex((index) => (index + 1) % HERO_PROMPTS.length), 3200);
    return () => window.clearInterval(timer);
  }, [hasInteracted, reduceMotion]);

  function stopPromptRotation() {
    setHasInteracted(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    if (status === "authenticated") {
      router.replace("/app");
      return;
    }
    openAuth("login");
  }

  return (
    <form className={styles.composer} onSubmit={submit} aria-label="Bắt đầu yêu cầu với X-One">
      <div className={styles.topline}>
        <label htmlFor="hero-composer-input">X-One có thể giúp gì cho bạn?</label>
        <span>Trợ lý dịch vụ</span>
      </div>
      <div className={styles.field}>
        {!draft && !hasInteracted ? (
          <div className={styles.prompt} aria-hidden="true">
            {reduceMotion ? (
              <span>{HERO_PROMPTS[0]}</span>
            ) : (
              <AnimatePresence initial={false} mode="wait">
                <motion.span key={HERO_PROMPTS[promptIndex]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }}>
                  {HERO_PROMPTS[promptIndex]}
                </motion.span>
              </AnimatePresence>
            )}
          </div>
        ) : null}
        <textarea
          id="hero-composer-input"
          value={draft}
          onFocus={stopPromptRotation}
          onChange={(event) => { stopPromptRotation(); setDraft(event.target.value); }}
          rows={2}
          aria-label="Nhập yêu cầu của bạn"
        />
        <button className={styles.submit} type="submit" aria-label="Gửi yêu cầu">
          <ArrowUp size={22} strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}
