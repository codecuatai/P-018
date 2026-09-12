import { ArrowRight, CalendarDays, Check, ShieldCheck } from "lucide-react";
import Image from "next/image";

import { XOneMark } from "@/components/XOneMark";
import { HowItWorksCarousel } from "@/components/marketing/how-it-works/how-it-works-carousel";
import { MarketingAuthTrigger } from "@/components/marketing/marketing-auth";
import { HeroComposer } from "@/components/marketing/hero-composer";
import { HeroMedia } from "@/components/marketing/media-slot";
import { hasLandingMedia } from "@/components/marketing/landing-media-availability";
import { LANDING_MEDIA } from "@/components/marketing/landing-media";
import { MultiServiceConversation } from "@/components/marketing/multi-service-conversation";
import { HanoiRouteStory } from "@/components/marketing/route-story";
import { ServiceComposition } from "@/components/marketing/service-composition";
import { RevealItem, RevealLine, RevealScene } from "@/components/marketing/scroll-focus-scene";
import styles from "@/components/marketing/landing-page.module.css";

const SAFETY_ROWS = [
  { icon: ShieldCheck, copy: "Bạn luôn có thời gian để xem lại." },
  { icon: Check, copy: "Xem lại lựa chọn trước khi tiếp tục." },
  { icon: CalendarDays, copy: "Biết rõ thời gian, địa điểm và chi phí khi có." },
  { icon: ShieldCheck, copy: "Chỉ thực hiện khi bạn xác nhận." },
] as const;

export function LandingPage() {
  return (
    <main id="main-content" className={styles.landingPage}>
      <section className={styles.hero}>
        <div className={styles.heroMediaBleed}><HeroMedia /></div>
        <div className={`${styles.container} ${styles.heroStage}`}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleLine}>Một yêu cầu.</span>
              <span className={`${styles.heroTitleLine} ${styles.heroTitleSecond}`}>Nhiều việc được kết nối.</span>
            </h1>
            <p className={styles.heroLede}>Một tài khoản, xong cả xe, món và lịch khám. Nhờ X-One lo việc lặp lại, bạn giữ quyết định cuối cùng.</p>

            <HeroComposer />
            <p className={styles.heroNote}><ShieldCheck size={16} /> Bạn vẫn là người quyết định ở mỗi bước quan trọng.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.services}`} id="dich-vu" aria-labelledby="services-title">
        <div className={styles.container}>
          <ServiceComposition />
        </div>
      </section>

      <section className={`${styles.section} ${styles.how}`} id="cach-hoat-dong" aria-labelledby="how-title">
        <div className={styles.container}>
          <HowItWorksCarousel />
        </div>
      </section>

      <section className={`${styles.section} ${styles.story}`} aria-labelledby="story-title">
        <div className={`${styles.container} ${styles.storyLayout}`}>
          <RevealItem className={styles.storyCopy}>
            <h2 id="story-title">Một yêu cầu có thể gồm nhiều việc.</h2>
            <p>Bạn có thể nhờ X-One tìm nhà hàng cho tối nay rồi chuẩn bị chuyến xe đến đó, mà không phải nhập lại từ đầu.</p>
          </RevealItem>
          <MultiServiceConversation replayOnReenter className={styles.storyVisual} />
        </div>
      </section>

      <section className={`${styles.section} ${styles.map}`} aria-labelledby="map-title">
        <div className={`${styles.container} ${styles.mapLayout}`}>
          <RevealItem variant="scale"><HanoiRouteStory mediaAvailable={hasLandingMedia(LANDING_MEDIA.hanoiMap)} /></RevealItem>
          <RevealItem className={styles.mapCopy} variant="right" delay={0.1}>
            <h2 id="map-title">Mọi điểm cần nhớ, ngay trên cùng một bản đồ.</h2>
            <p>Điểm đón, điểm đến và những địa điểm liên quan được đặt cạnh nhau để bạn dễ hình dung hành trình.</p>
            <span className={styles.mediaNote}>Minh hoạ cách X-One hiển thị địa điểm và lộ trình.</span>
          </RevealItem>
        </div>
      </section>

      <RevealScene replayOnReenter className={`${styles.section} ${styles.safety}`} id="an-toan" aria-labelledby="safety-title">
        <div className={`${styles.container} ${styles.safetyPanel} ${styles.editorialSplit}`}>
          <RevealItem className={styles.safetyCopy} variant="left">
            <span className="eyebrow">AN TOÀN & XÁC NHẬN</span>
            <h2 id="safety-title">Việc quan trọng luôn chờ bạn xác nhận.</h2>
            <p>Trước khi đặt xe, giữ bàn, đặt lịch hay thanh toán, X-One hiển thị lại thông tin để bạn kiểm tra.</p>
          </RevealItem>
          <div className={styles.safetyChecklist}>
            {SAFETY_ROWS.map(({ icon: Icon, copy }, index) => (
              <RevealItem key={copy} className={styles.safetyChecklistItem} delay={0.1 + index * 0.09}>
                <span className={styles.safetyIcon}><Icon size={17} aria-hidden="true" /></span>
                <span>{copy}</span>
              </RevealItem>
            ))}
          </div>
        </div>
      </RevealScene>

      <RevealScene replayOnReenter className={`${styles.section} ${styles.assistant}`} aria-labelledby="assistant-title">
        <div className={`${styles.container} ${styles.editorialSplit} ${styles.assistantLayout}`}>
          <RevealItem className={styles.assistantCopy} variant="left">
            <h2 id="assistant-title">Chỉ cần nói như bạn vẫn nói hằng ngày.</h2>
            <RevealLine className={styles.assistantUnderline} delay={0.22} />
            <p>X-One giữ lại những thông tin liên quan để bạn không phải lặp lại ở bước tiếp theo.</p>
            <MarketingAuthTrigger className={`button button-primary ${styles.textLink}`} mode="register">Bắt đầu với X-One <ArrowRight size={17} /></MarketingAuthTrigger>
          </RevealItem>
          <RevealItem className={styles.assistantSignal} variant="right" delay={0.12}>
            <XOneMark size={38} />
            <p>“Tối nay tìm nhà hàng cho 2 người ở Hà Nội.”</p>
            <span>X-One giữ lại điều bạn đã nói để bước tiếp theo bắt đầu dễ hơn.</span>
          </RevealItem>
        </div>
      </RevealScene>

      <RevealScene replayOnReenter className={styles.cta} aria-labelledby="cta-title">
        <div className={styles.finalCtaLayout}>
          <RevealItem className={styles.finalCtaCopy} variant="left">
            <XOneMark size={50} />
            <h2 id="cta-title">Một nơi để bắt đầu.<br />X-One giúp nối những việc còn lại.</h2>
            <div className={styles.ctaActions}>
              <MarketingAuthTrigger className="button button-primary button-large" mode="register">Bắt đầu với X-One <ArrowRight size={18} /></MarketingAuthTrigger>
            </div>
          </RevealItem>
          <RevealItem className={styles.finalCtaObject} variant="object" delay={0.12}>
            {hasLandingMedia(LANDING_MEDIA.finalObject) ? (
              <Image src={LANDING_MEDIA.finalObject} alt="" width={1024} height={1024} sizes="(max-width: 820px) 82vw, 52vw" />
            ) : <div className={styles.finalObjectFallback} aria-hidden="true" />}
          </RevealItem>
        </div>
        <Footer />
      </RevealScene>
    </main>
  );
}

function Footer() {
  return <footer className={styles.footer}><div className={styles.container}><span>X-One</span><span>© X-One</span></div></footer>;
}
