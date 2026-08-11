import { ArrowRight, CalendarDays, Check, ShieldCheck } from "lucide-react";
import Image from "next/image";

import { XOneMark } from "@/components/XOneMark";
import { FloatingProductImage } from "@/components/marketing/floating-product-image";
import { HowItWorksCarousel } from "@/components/marketing/how-it-works/how-it-works-carousel";
import { MarketingAuthTrigger } from "@/components/marketing/marketing-auth";
import { HeroComposer } from "@/components/marketing/hero-composer";
import { HeroMedia } from "@/components/marketing/media-slot";
import { hasLandingMedia } from "@/components/marketing/landing-media-availability";
import { LANDING_MEDIA } from "@/components/marketing/landing-media";
import { HanoiRouteStory } from "@/components/marketing/route-story";
import { RevealItem, RevealScene, ScrollFocusScene } from "@/components/marketing/scroll-focus-scene";
import styles from "@/components/marketing/landing-page.module.css";

const services = [
  { title: "Đồ ăn", copy: "Tìm món và chuẩn bị đơn giao theo lựa chọn của bạn.", imageKey: "serviceFood", imageAlt: "" },
  { title: "Chuyến xe", copy: "Đặt điểm đón, điểm đến và chuẩn bị chuyến đi.", imageKey: "serviceRide", imageAlt: "" },
  { title: "Nhà hàng", copy: "Tìm bàn phù hợp và giữ chỗ trước khi xác nhận.", imageKey: "serviceRestaurant", imageAlt: "" },
  { title: "Lịch khám", copy: "Tìm bác sĩ, thời gian và lựa chọn lịch phù hợp.", imageKey: "serviceHealthcare", imageAlt: "" },
] as const;

const serviceAccentClasses = {
  serviceFood: styles.serviceCardFood,
  serviceRide: styles.serviceCardRide,
  serviceRestaurant: styles.serviceCardRestaurant,
  serviceHealthcare: styles.serviceCardHealthcare,
} as const;

export function LandingPage() {
  return (
    <main id="main-content" className={styles.landingPage}>
      <section className={styles.hero}>
        <div className={styles.heroMediaBleed}><HeroMedia /></div>
        <div className={`${styles.container} ${styles.heroStage}`}>
          <div className={styles.heroKicker}>
            <span className="eyebrow">X-ONE / TRỢ LÝ DỊCH VỤ HẰNG NGÀY</span>
          </div>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleLine}>Một yêu cầu.</span>
              <span className={`${styles.heroTitleLine} ${styles.heroTitleSecond}`}>Nhiều việc được kết nối.</span>
            </h1>
            <p className={styles.heroLede}>X-One giúp bạn bắt đầu từ điều đang cần — từ bữa ăn, chuyến xe đến cuộc hẹn — rồi giữ các bước liên quan trong một trải nghiệm rõ ràng.</p>
            <HeroComposer />
            <p className={styles.heroNote}><ShieldCheck size={16} /> Bạn vẫn là người quyết định ở mỗi bước quan trọng.</p>
          </div>
        </div>
      </section>

      <RevealScene className={`${styles.section} ${styles.services}`} id="dich-vu" aria-labelledby="services-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={styles.container}>
            <RevealItem as="header" className={styles.servicesIntro}>
              <div className={styles.sectionHeading}><span className="eyebrow">DỊCH VỤ ĐƯỢC HỖ TRỢ</span><h2 id="services-title">Mọi nhu cầu hằng ngày, bắt đầu từ một nơi.</h2></div>
              <p className={styles.servicesLead}>Bốn ngữ cảnh quen thuộc, một cách bắt đầu rõ ràng để bạn không phải tự nối các bước lại với nhau.</p>
            </RevealItem>
            <div className={styles.serviceGrid}>
              {services.map(({ title, copy, imageKey, imageAlt }, index) => {
                const mediaAvailable = hasLandingMedia(LANDING_MEDIA[imageKey]);
                return (
                  <RevealItem as="article" className={`${styles.serviceCard} ${serviceAccentClasses[imageKey]}`} delay={0.08 + index * 0.09} key={title}>
                    <div className={styles.serviceMediaFrame}>
                      {mediaAvailable ? (
                        <FloatingProductImage src={LANDING_MEDIA[imageKey]} alt={imageAlt} fallback={<ServiceMediaFallback title={title} />} />
                      ) : <ServiceMediaFallback title={title} />}
                    </div>
                    <div className={styles.serviceCardBody}>
                      <span className={styles.serviceAccentMark} aria-hidden="true" />
                      <h3>{title}</h3>
                      <p>{copy}</p>
                    </div>
                  </RevealItem>
                );
              })}
            </div>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.how}`} id="cach-hoat-dong" aria-labelledby="how-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={styles.container}>
            <RevealItem as="header" className={`${styles.sectionHeading} ${styles.howHeading}`}>
              <h2 id="how-title">Ít chuyển màn hình hơn. Nhiều ngữ cảnh được giữ lại hơn.</h2>
              <p className={styles.howLead}>Một luồng sản phẩm rõ ràng từ lời bạn nói đến bước bạn kiểm tra.</p>
            </RevealItem>
            <RevealItem className={styles.howCarouselReveal} variant="scale"><HowItWorksCarousel /></RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.story}`} aria-labelledby="story-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.storyLayout}`}>
            <RevealItem className={styles.storyCopy} variant="left">
              <h2 id="story-title">Đặt bàn trước. Chuyến xe sau. Không mất mạch câu chuyện.</h2>
              <p>X-One đưa lựa chọn từ nhà hàng sang điểm đến của chuyến xe, và vẫn giữ ranh giới xác nhận của bạn ở đúng chỗ.</p>
            </RevealItem>
            <RevealItem className={styles.storyVisual} variant="right" delay={0.1}>
              {hasLandingMedia(LANDING_MEDIA.xoneMultiService) ? (
                <figure className={styles.storyMediaFrame}>
                  <Image src={LANDING_MEDIA.xoneMultiService} alt="Ví dụ luồng đa dịch vụ của X-One" width={1240} height={860} sizes="(max-width: 820px) 100vw, 58vw" />
                  <figcaption>Ví dụ luồng đa dịch vụ X-One</figcaption>
                </figure>
              ) : <StoryFlow />}
            </RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.map}`} aria-labelledby="map-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.mapLayout}`}>
            <RevealItem variant="scale"><HanoiRouteStory mediaAvailable={hasLandingMedia(LANDING_MEDIA.hanoiMap)} /></RevealItem>
            <RevealItem className={styles.mapCopy} variant="right" delay={0.1}>
              <h2 id="map-title">Nhìn nhanh phần cần biết trước khi lên đường.</h2>
              <p>Ảnh bản đồ Hà Nội là lớp minh hoạ marketing cho cách điểm đón, điểm đến và thông tin ngữ cảnh có thể được trình bày. Theo dõi trực tiếp thuộc phase sau.</p>
              <span className={styles.mediaNote}>Bản đồ minh hoạ · không theo dõi trực tiếp</span>
            </RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.safety}`} id="an-toan" aria-labelledby="safety-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.safetyPanel} ${styles.editorialSplit}`}>
            <RevealItem className={styles.safetyCopy} variant="left">
              <span className="eyebrow">AN TOÀN & XÁC NHẬN</span>
              <h2 id="safety-title">X-One chuẩn bị. Bạn quyết định.</h2>
              <p>Thông tin được gom lại để bạn dễ kiểm tra: lựa chọn nào, điều kiện nào và phần nào cần sự đồng ý của bạn.</p>
            </RevealItem>
            <RevealItem className={styles.safetyChecklist} variant="right" delay={0.11}>
              <div className={styles.safetyChecklistHeading}><ShieldCheck size={20} /><strong>Trước mỗi bước quan trọng</strong></div>
              <div className={styles.safetyChecklistItem}><Check size={17} /><span>Thông tin và điều kiện được hiển thị rõ ràng.</span></div>
              <div className={styles.safetyChecklistItem}><CalendarDays size={17} /><span>Thay đổi được cập nhật trước khi bạn đi tiếp.</span></div>
              <div className={styles.safetyChecklistItem}><ShieldCheck size={17} /><span>Xác nhận cuối cùng luôn thuộc về bạn.</span></div>
            </RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.assistant}`} aria-labelledby="assistant-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.editorialSplit} ${styles.assistantLayout}`}>
            <RevealItem className={styles.assistantSignal} variant="left">
              <XOneMark size={38} />
              <p>“Tối nay tìm nhà hàng cho 2 người ở Hà Nội.”</p>
              <span>X-One giữ lựa chọn và bước tiếp theo trong cùng một luồng.</span>
            </RevealItem>
            <RevealItem className={styles.assistantCopy} variant="right" delay={0.1}>
              <h2 id="assistant-title">Trò chuyện tự nhiên, nhưng luôn biết bạn đang ở bước nào.</h2>
              <p>Giao diện trợ lý ưu tiên kết quả, lựa chọn và điểm cần xác nhận — không phô bày chi tiết kỹ thuật không cần thiết.</p>
              <MarketingAuthTrigger className={`text-link arrow-link ${styles.textLink}`} mode="register">Bắt đầu cuộc trò chuyện <ArrowRight size={17} /></MarketingAuthTrigger>
            </RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={styles.cta} aria-labelledby="cta-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={styles.container}><XOneMark size={42} /><div><h2 id="cta-title">Một nơi để bắt đầu.<br />X-One lo phần kết nối còn lại.</h2><p>Bạn vẫn là người quyết định ở mỗi bước quan trọng.</p></div><div className={styles.ctaActions}><MarketingAuthTrigger className="button button-primary button-large" mode="register">Bắt đầu với X-One <ArrowRight size={18} /></MarketingAuthTrigger><MarketingAuthTrigger className={`button button-secondary button-large ${styles.buttonSecondary}`} mode="login">Đăng nhập</MarketingAuthTrigger></div></div>
        </ScrollFocusScene>
      </RevealScene>
      <Footer />
    </main>
  );
}

function ServiceMediaFallback({ title }: { title: string }) {
  return <div className={styles.serviceMediaFallback} aria-hidden="true"><span>{title}</span><small>Hình ảnh dịch vụ</small></div>;
}

function StoryFlow() {
  return (
    <div className={styles.storyFlow} aria-label="Luồng minh hoạ nhà hàng, xác nhận và chuyến xe">
      <div className={styles.storyFlowStep}><span>Nhà hàng</span><strong>Tìm bàn phù hợp</strong><p>Giữ lựa chọn trước khi đồng ý.</p></div>
      <div className={styles.storyFlowConnector} aria-hidden="true" />
      <div className={`${styles.storyFlowStep} ${styles.storyFlowActive}`}><span>Xác nhận</span><strong>Bạn xem lại trước</strong><p>Thông tin quan trọng nằm trong tầm mắt.</p></div>
      <div className={styles.storyFlowConnector} aria-hidden="true" />
      <div className={styles.storyFlowStep}><span>Chuyến xe</span><strong>Giữ lại điểm đến</strong><p>Không phải bắt đầu lại từ đầu.</p></div>
    </div>
  );
}

function Footer() {
  return <footer className={styles.footer}><div className={styles.container}><div className={styles.footerBrand}><XOneMark size={26} /><strong>X-One</strong></div><p>Một trải nghiệm thống nhất cho những việc cần được kết nối rõ ràng.</p><span>© X-One</span></div></footer>;
}
