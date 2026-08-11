import { ArrowRight, CalendarDays, HeartPulse, Navigation, Salad, ShieldCheck, UtensilsCrossed } from "lucide-react";

import { XOneMark } from "@/components/XOneMark";
import { MarketingAuthTrigger } from "@/components/marketing/marketing-auth";
import { HeroComposer } from "@/components/marketing/hero-composer";
import { HanoiMapMedia, HeroMedia, ProductMediaSlot } from "@/components/marketing/media-slot";
import { RevealItem, RevealLine, RevealScene, ScrollFocusScene } from "@/components/marketing/scroll-focus-scene";
import styles from "@/components/marketing/landing-page.module.css";

const services = [
  { title: "Đồ ăn", copy: "Tìm món và chuẩn bị đơn giao theo lựa chọn của bạn.", icon: Salad, accent: "food" },
  { title: "Chuyến xe", copy: "Đặt điểm đón, điểm đến và chuẩn bị chuyến đi.", icon: Navigation, accent: "ride" },
  { title: "Nhà hàng", copy: "Tìm bàn phù hợp và giữ chỗ trước khi xác nhận.", icon: UtensilsCrossed, accent: "restaurant" },
  { title: "Lịch khám", copy: "Tìm bác sĩ, thời gian và lựa chọn lịch phù hợp.", icon: HeartPulse, accent: "healthcare" },
] as const;

const serviceAccentClasses = {
  food: styles.serviceCardFood,
  ride: styles.serviceCardRide,
  restaurant: styles.serviceCardRestaurant,
  healthcare: styles.serviceCardHealthcare,
} as const;

const steps = [
  ["01", "Nói điều bạn cần", "Dùng lời tự nhiên, như đang nhắn tin cho một người hỗ trợ."],
  ["02", "X-One kết nối các bước", "Các lựa chọn liên quan được sắp xếp trong cùng một luồng dễ theo dõi."],
  ["03", "Bạn kiểm tra và xác nhận", "Bạn luôn xem lại thông tin trước khi một bước quan trọng được thực hiện."],
] as const;

export function LandingPage() {
  return (
    <main id="main-content" className={styles.landingPage}>
      <section className={styles.hero}>
        <div className={styles.heroMediaBleed}><HeroMedia /></div>
        <div className={`${styles.container} ${styles.heroStage}`}>
          <div className={styles.heroKicker}>
            <span className="eyebrow">X-ONE / TRỢ LÝ DỊCH VỤ HẰNG NGÀY</span>
            <span className={styles.heroKickerMeta}>HÀ NỘI · 01</span>
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
        <div className={styles.heroBottomNote} aria-hidden="true">Cuộn để xem X-One giữ mạch trải nghiệm như thế nào</div>
      </section>

      <RevealScene className={`${styles.section} ${styles.services}`} id="dich-vu" aria-labelledby="services-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={styles.container}>
            <RevealItem as="header" className={styles.servicesIntro}>
              <div className={styles.sectionHeading}><span className="eyebrow">DỊCH VỤ ĐƯỢC HỖ TRỢ</span><h2 id="services-title">Mọi nhu cầu hằng ngày, bắt đầu từ một nơi.</h2></div>
              <p className={styles.servicesLead}>Bốn ngữ cảnh quen thuộc, một cách bắt đầu rõ ràng để bạn không phải tự nối các bước lại với nhau.</p>
            </RevealItem>
            <div className={styles.serviceGrid}>
              {services.map(({ title, copy, icon: Icon, accent }, index) => (
                <RevealItem as="article" className={`${styles.serviceCard} ${serviceAccentClasses[accent]}`} delay={0.08 + index * 0.09} key={title}>
                  <span className={styles.serviceIcon} aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </RevealItem>
              ))}
            </div>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.how}`} id="cach-hoat-dong" aria-labelledby="how-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={styles.container}>
            <RevealItem as="header" className={`${styles.sectionHeading} ${styles.howHeading}`}>
              <span className="eyebrow">CÁCH X-ONE HOẠT ĐỘNG</span>
              <h2 id="how-title">Ít chuyển màn hình hơn. Nhiều ngữ cảnh được giữ lại hơn.</h2>
            </RevealItem>
            <div className={styles.howRail}><RevealLine className={styles.howRailFill} /></div>
            <div className={styles.howSteps}>
              {steps.map(([index, title, copy], stepIndex) => (
                <RevealItem as="article" className={styles.howStep} delay={0.08 + stepIndex * 0.1} key={index}>
                  <span className={styles.howStepIndex}>{index}</span>
                  <div><h3>{title}</h3><p>{copy}</p></div>
                </RevealItem>
              ))}
            </div>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.story}`} aria-labelledby="story-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.storyLayout}`}>
            <RevealItem className={styles.storyCopy} variant="left">
              <span className="eyebrow">MỘT CÂU NÓI, NHIỀU BƯỚC LIÊN QUAN</span>
              <h2 id="story-title">Đặt bàn trước. Chuyến xe sau. Không mất mạch câu chuyện.</h2>
              <p>X-One đưa lựa chọn từ nhà hàng sang điểm đến của chuyến xe, và vẫn giữ ranh giới xác nhận của bạn ở đúng chỗ.</p>
            </RevealItem>
            <RevealItem className={styles.storySequence} variant="right" delay={0.1}>
              <div className={styles.storySequenceHeading}><span>LUỒNG LIÊN KẾT</span><span>HÀ NỘI / TỐI NAY</span></div>
              <div className={styles.storyRow}><span>01</span><strong>Nhà hàng</strong><span>Tìm bàn phù hợp</span></div>
              <div className={`${styles.storyRow} ${styles.storyRowActive}`}><span>02</span><strong>Xác nhận</strong><span>Bạn xem lại trước</span><RevealLine className={styles.storySweep} delay={0.28} /></div>
              <div className={styles.storyRow}><span>03</span><strong>Chuyến xe</strong><span>Giữ lại điểm đến</span></div>
            </RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.map}`} aria-labelledby="map-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.mapLayout}`}>
            <RevealItem variant="scale"><HanoiMapMedia /></RevealItem>
            <RevealItem className={styles.mapCopy} variant="right" delay={0.1}>
              <span className="eyebrow">LỘ TRÌNH TRONG TRẢI NGHIỆM</span>
              <h2 id="map-title">Nhìn nhanh phần cần biết trước khi lên đường.</h2>
              <p>Ảnh bản đồ Hà Nội là lớp minh hoạ marketing cho cách điểm đón, điểm đến và thông tin ngữ cảnh có thể được trình bày. Theo dõi trực tiếp thuộc phase sau.</p>
              <span className={styles.mediaNote}>Bản đồ minh hoạ · không phải Maps API</span>
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
              <div className={styles.safetyPoints}><span><ShieldCheck size={18} /> Rõ thông tin trước khi xác nhận</span><span><CalendarDays size={18} /> Cập nhật khi điều kiện thay đổi</span></div>
            </RevealItem>
            <RevealItem variant="right" delay={0.11}>
              <ProductMediaSlot mediaKey="xoneConfirmationExample" title="Bước xác nhận rõ ràng" description="Thông tin quan trọng nằm cùng một chỗ để bạn kiểm tra trước khi đồng ý." caption="Xác nhận cuối cùng luôn gắn với thông tin và điều kiện bạn đã xem." />
            </RevealItem>
          </div>
        </ScrollFocusScene>
      </RevealScene>

      <RevealScene className={`${styles.section} ${styles.assistant}`} aria-labelledby="assistant-title">
        <ScrollFocusScene className={styles.focusScene}>
          <div className={`${styles.container} ${styles.editorialSplit} ${styles.assistantLayout}`}>
            <RevealItem variant="left"><ProductMediaSlot mediaKey="xoneChatExample" title="Luồng trợ lý rõ ràng" description="Các lựa chọn và bước tiếp theo được sắp xếp trong một bố cục dễ theo dõi." caption="Trợ lý ưu tiên lựa chọn, kết quả và điểm cần xác nhận." /></RevealItem>
            <RevealItem className={styles.assistantCopy} variant="right" delay={0.1}>
              <span className="eyebrow">TRỢ LÝ X-ONE</span>
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

function Footer() {
  return <footer className={styles.footer}><div className={styles.container}><div className={styles.footerBrand}><XOneMark size={26} /><strong>X-One</strong></div><p>Một trải nghiệm thống nhất cho những việc cần được kết nối rõ ràng.</p><span>© X-One</span></div></footer>;
}
