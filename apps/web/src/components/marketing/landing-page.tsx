import { ArrowRight, CalendarDays, HeartPulse, Navigation, Salad, ShieldCheck, UtensilsCrossed } from "lucide-react";

import { XOneMark } from "@/components/XOneMark";
import { HeroComposer } from "@/components/marketing/hero-composer";
import { MarketingAuthTrigger } from "@/components/marketing/marketing-auth";
import { HeroMedia, HanoiMapMedia, ProductMediaSlot } from "@/components/marketing/media-slot";
import { ScrollFocusScene } from "@/components/marketing/scroll-focus-scene";

const services = [
  { index: "01", title: "Đồ ăn", copy: "Tìm món phù hợp và chuẩn bị đơn hàng theo lựa chọn của bạn.", icon: Salad, detail: "Tìm · chọn · giao" },
  { index: "02", title: "Chuyến xe", copy: "Sắp xếp điểm đón, điểm đến và lựa chọn chuyến đi rõ ràng.", icon: Navigation, detail: "Đón · đi · đến" },
  { index: "03", title: "Nhà hàng", copy: "Khám phá chỗ ngồi, thời gian phù hợp và giữ bàn trước khi xác nhận.", icon: UtensilsCrossed, detail: "Tìm · giữ · xác nhận" },
  { index: "04", title: "Lịch khám", copy: "Tìm lịch bác sĩ và xem lại thông tin trước những bước quan trọng.", icon: HeartPulse, detail: "Tìm · xem · chọn" },
] as const;

const steps = [
  ["01", "Nói điều bạn cần", "Dùng lời tự nhiên, như đang nhắn tin cho một người hỗ trợ."],
  ["02", "X-One kết nối các bước", "Các lựa chọn liên quan được sắp xếp trong cùng một luồng dễ theo dõi."],
  ["03", "Bạn kiểm tra và xác nhận", "Bạn luôn xem lại thông tin trước khi một bước quan trọng được thực hiện."],
] as const;

export function LandingPage() {
  return (
    <main id="main-content">
      <section className="landing-hero">
        <div className="hero-media-bleed"><HeroMedia /></div>
        <div className="landing-container hero-stage">
          <div className="hero-kicker">
            <span className="eyebrow">X-ONE / TRỢ LÝ DỊCH VỤ HẰNG NGÀY</span>
            <span className="hero-kicker-meta">HÀ NỘI · 01</span>
          </div>
          <div className="hero-copy">
            <h1>Một yêu cầu.<br />Nhiều việc được kết nối.</h1>
            <p className="hero-lede">X-One giúp bạn bắt đầu từ điều đang cần — từ bữa ăn, chuyến xe đến cuộc hẹn — rồi giữ các bước liên quan trong một trải nghiệm rõ ràng.</p>
            <HeroComposer />
            <p className="hero-note"><ShieldCheck size={16} /> Bạn vẫn là người quyết định ở mỗi bước quan trọng.</p>
          </div>
        </div>
        <div className="hero-bottom-note" aria-hidden="true">Cuộn để xem X-One giữ mạch trải nghiệm như thế nào</div>
      </section>

      <ScrollFocusScene className="landing-section service-section" id="dich-vu" aria-labelledby="services-title">
        <div className="landing-container">
          <div className="section-intro split-intro">
            <div><span className="eyebrow">BỐN NGỮ CẢNH, MỘT CÁCH BẮT ĐẦU</span><h2 id="services-title">Những việc khác nhau vẫn có thể bắt đầu từ cùng một nơi.</h2></div>
            <p>Mỗi dịch vụ có ngữ cảnh riêng, nhưng bạn không phải tự nối các bước lại với nhau.</p>
          </div>
          <div className="service-editorial-grid">
            {services.map(({ index, title, copy, icon: Icon, detail }) => (
              <article className="service-editorial-item" key={title}>
                <span className="service-index">{index}</span>
                <span className="service-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
                <div><h3>{title}</h3><p>{copy}</p></div>
                <span className="service-detail">{detail}</span>
              </article>
            ))}
          </div>
        </div>
      </ScrollFocusScene>

      <ScrollFocusScene className="landing-section how-section" id="cach-hoat-dong" aria-labelledby="how-title">
        <div className="landing-container">
          <div className="section-intro centered-intro"><span className="eyebrow">CÁCH X-ONE HOẠT ĐỘNG</span><h2 id="how-title">Ít chuyển màn hình hơn. Nhiều ngữ cảnh được giữ lại hơn.</h2></div>
          <div className="how-steps">
            {steps.map(([index, title, copy]) => <article className="how-step" key={index}><span className="how-step-index">{index}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
          </div>
        </div>
      </ScrollFocusScene>

      <ScrollFocusScene className="landing-section story-section" aria-labelledby="story-title">
        <div className="landing-container story-layout">
          <div className="story-copy"><span className="eyebrow">MỘT CÂU NÓI, NHIỀU BƯỚC LIÊN QUAN</span><h2 id="story-title">Đặt bàn trước. Chuyến xe sau. Không mất mạch câu chuyện.</h2><p>X-One đưa lựa chọn từ nhà hàng sang điểm đến của chuyến xe, và vẫn giữ ranh giới xác nhận của bạn ở đúng chỗ.</p></div>
          <div className="story-sequence" aria-label="Ví dụ luồng nhiều dịch vụ">
            <div className="story-sequence-heading"><span>LUỒNG LIÊN KẾT</span><span>HÀ NỘI / TỐI NAY</span></div>
            <div className="story-sequence-row"><span>01</span><strong>Nhà hàng</strong><span>Tìm bàn phù hợp</span></div>
            <div className="story-sequence-row is-active"><span>02</span><strong>Xác nhận</strong><span>Bạn xem lại trước</span></div>
            <div className="story-sequence-row"><span>03</span><strong>Chuyến xe</strong><span>Giữ lại điểm đến</span></div>
          </div>
        </div>
      </ScrollFocusScene>

      <ScrollFocusScene className="landing-section map-section" aria-labelledby="map-title">
        <div className="landing-container map-layout">
          <HanoiMapMedia />
          <div><span className="eyebrow">LỘ TRÌNH TRONG TRẢI NGHIỆM</span><h2 id="map-title">Nhìn nhanh phần cần biết trước khi lên đường.</h2><p>Ảnh bản đồ Hà Nội là lớp minh hoạ marketing cho cách điểm đón, điểm đến và thông tin ngữ cảnh có thể được trình bày. Theo dõi trực tiếp thuộc phase sau.</p><span className="media-note">Bản đồ minh hoạ · không phải Maps API</span></div>
        </div>
      </ScrollFocusScene>

      <ScrollFocusScene className="landing-section safety-section" id="an-toan" aria-labelledby="safety-title">
        <div className="landing-container editorial-split">
          <div className="safety-copy"><span className="eyebrow">AN TOÀN & XÁC NHẬN</span><h2 id="safety-title">X-One chuẩn bị. Bạn quyết định.</h2><p>Thông tin được gom lại để bạn dễ kiểm tra: lựa chọn nào, điều kiện nào và phần nào cần sự đồng ý của bạn.</p><div className="safety-points"><span><ShieldCheck size={18} /> Rõ thông tin trước khi xác nhận</span><span><CalendarDays size={18} /> Cập nhật khi điều kiện thay đổi</span></div></div>
          <ProductMediaSlot mediaKey="xoneConfirmationExample" title="Ảnh chụp bước xác nhận" description="Ảnh chụp sản phẩm thật sẽ xuất hiện ở đây khi được cung cấp." caption="Xác nhận cuối cùng luôn gắn với thông tin và điều kiện bạn đã xem." />
        </div>
      </ScrollFocusScene>

      <ScrollFocusScene className="landing-section assistant-preview-section" aria-labelledby="assistant-title">
        <div className="landing-container editorial-split assistant-preview-layout">
          <ProductMediaSlot mediaKey="xoneChatExample" title="Ảnh chụp trợ lý X-One" description="Ảnh chụp sản phẩm thật sẽ xuất hiện ở đây khi được cung cấp." caption="Trợ lý ưu tiên lựa chọn, kết quả và điểm cần xác nhận." />
          <div><span className="eyebrow">TRỢ LÝ X-ONE</span><h2 id="assistant-title">Trò chuyện tự nhiên, nhưng luôn biết bạn đang ở bước nào.</h2><p>Giao diện trợ lý ưu tiên kết quả, lựa chọn và điểm cần xác nhận — không phô bày chi tiết kỹ thuật không cần thiết.</p><MarketingAuthTrigger className="text-link arrow-link" mode="register">Bắt đầu cuộc trò chuyện <ArrowRight size={17} /></MarketingAuthTrigger></div>
        </div>
      </ScrollFocusScene>

      <ScrollFocusScene className="final-cta" aria-labelledby="cta-title">
        <div className="landing-container"><XOneMark size={42} /><div><h2 id="cta-title">Một nơi để bắt đầu.<br />X-One lo phần kết nối còn lại.</h2><p>Bạn vẫn là người quyết định ở mỗi bước quan trọng.</p></div><div className="hero-actions"><MarketingAuthTrigger className="button button-primary button-large" mode="register">Bắt đầu với X-One <ArrowRight size={18} /></MarketingAuthTrigger><MarketingAuthTrigger className="button button-secondary button-large" mode="login">Đăng nhập</MarketingAuthTrigger></div></div>
      </ScrollFocusScene>
      <Footer />
    </main>
  );
}

function Footer() {
  return <footer className="landing-footer"><div className="landing-container"><div className="footer-brand"><XOneMark size={26} /><strong>X-One</strong></div><p>Một trải nghiệm thống nhất cho những việc cần được kết nối rõ ràng.</p><span>© X-One</span></div></footer>;
}
