import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, HeartPulse, MapPin, Navigation, Salad, ShieldCheck, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { XOneMark } from "@/components/XOneMark";
import { HeroNetwork } from "@/components/marketing/hero-network";
import { StoryBoard } from "@/components/marketing/story-board";

export function LandingPage() {
  return <main id="main-content">
    <section className="landing-hero"><div className="landing-container hero-grid"><div className="hero-copy"><p className="eyebrow">TRỢ LÝ DỊCH VỤ ĐA NHIỆM</p><h1>Từ một câu nói<br />đến việc được hoàn tất.</h1><p className="hero-lede">X-One kết nối đồ ăn, chuyến xe, nhà hàng và lịch khám trong một trải nghiệm duy nhất — bạn luôn xem và xác nhận trước những bước quan trọng.</p><div className="hero-actions"><Link className="button button-primary button-large" href="/register">Bắt đầu với X-One <ArrowRight size={18} /></Link><a className="button button-secondary button-large" href="#cach-hoat-dong">Xem cách hoạt động</a></div><p className="hero-note"><ShieldCheck size={16} /> Rõ ràng ở mỗi bước xác nhận</p></div><div className="hero-signature" aria-label="X-One kết nối bốn dịch vụ"><HeroNetwork /><div className="hero-conversation"><p>“Tối nay đặt bàn cho 2 người rồi gọi xe đưa tôi tới đó.”</p><ol><li><Check size={14} /> Tìm nhà hàng</li><li><Check size={14} /> Giữ lựa chọn</li><li><Check size={14} /> Chuyển điểm đến</li><li><Check size={14} /> Chuẩn bị chuyến xe</li></ol></div></div></div></section>
    <ServiceQuartet />
    <HowItWorks />
    <MultiServiceStory />
    <MapPreview />
    <SafetySection />
    <AssistantPreview />
    <FinalCta />
    <Footer />
  </main>;
}

function ServiceQuartet() {
  const services = [
    { title: "Đồ ăn", copy: "Tìm món phù hợp và chuẩn bị đơn hàng theo lựa chọn của bạn.", icon: <Salad size={24} />, className: "food", detail: <><i /><i /><i /></> },
    { title: "Chuyến xe", copy: "Sắp xếp điểm đón, điểm đến và lựa chọn chuyến đi rõ ràng.", icon: <Navigation size={24} />, className: "ride", detail: <><span>Điểm đón</span><b /><span>Điểm đến</span></> },
    { title: "Nhà hàng", copy: "Khám phá chỗ ngồi, thời gian phù hợp và giữ bàn trước khi xác nhận.", icon: <UtensilsCrossed size={24} />, className: "restaurant", detail: <><b>2</b><span>chỗ cho buổi tối</span></> },
    { title: "Lịch khám", copy: "Tìm lịch bác sĩ và xem lại thông tin trước những bước quan trọng.", icon: <HeartPulse size={24} />, className: "healthcare", detail: <><CalendarDays size={18} /><span>Chọn lịch phù hợp</span></> },
  ];
  return <section className="landing-section service-section" id="dich-vu"><div className="landing-container"><div className="section-intro split-intro"><div><span className="eyebrow">BỐN DỊCH VỤ, MỘT LUỒNG XỬ LÝ</span><h2>Việc riêng lẻ hay kế tiếp nhau, X-One đều giữ cho bạn một mạch rõ ràng.</h2></div><p>Mỗi dịch vụ có ngữ cảnh riêng, nhưng không buộc bạn phải tự nối các bước lại với nhau.</p></div><div className="service-quartet">{services.map((service) => <article className={`service-block service-${service.className}`} key={service.title}><div className="service-icon">{service.icon}</div><h3>{service.title}</h3><p>{service.copy}</p><div className="service-detail" aria-hidden="true">{service.detail}</div></article>)}</div></div></section>;
}

function HowItWorks() {
  const steps = [["Nói điều bạn cần", "Dùng lời tự nhiên, như đang nhắn tin cho một người hỗ trợ."], ["X-One kết nối các bước", "Các lựa chọn liên quan được sắp xếp trong cùng một luồng dễ theo dõi."], ["Bạn kiểm tra và xác nhận", "Bạn luôn xem lại thông tin trước khi một bước quan trọng được thực hiện."]];
  return <section className="landing-section how-section" id="cach-hoat-dong"><div className="landing-container"><div className="section-intro centered-intro"><span className="eyebrow">CÁCH X-ONE HOẠT ĐỘNG</span><h2>Ít chuyển màn hình hơn. Nhiều ngữ cảnh được giữ lại hơn.</h2></div><ol className="how-steps">{steps.map(([title, copy], index) => <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol></div></section>;
}

function MultiServiceStory() {
  return <section className="landing-section story-section"><div className="landing-container story-layout"><div className="story-copy"><span className="eyebrow">MỘT CÂU NÓI, NHIỀU BƯỚC LIÊN QUAN</span><h2>Đặt bàn trước. Chuyến xe sau. Không mất mạch câu chuyện.</h2><p>X-One đưa lựa chọn từ nhà hàng sang điểm đến của chuyến xe, và vẫn giữ ranh giới xác nhận của bạn ở đúng chỗ.</p></div><StoryBoard /></div></section>;
}

function MapPreview() {
  return <section className="landing-section map-section"><div className="landing-container map-layout"><div><span className="eyebrow">LỘ TRÌNH TRONG TRẢI NGHIỆM</span><h2>Nhìn nhanh phần cần biết trước khi lên đường.</h2><p>Đây là minh hoạ cho cách thông tin điểm đón và điểm đến có thể được trình bày trong X-One. Bản đồ và theo dõi trực tiếp sẽ được bổ sung ở phase sau.</p></div><div className="map-preview" role="img" aria-label="Minh hoạ lộ trình từ điểm đón đến điểm đến"><svg viewBox="0 0 500 320" aria-hidden="true"><path className="map-grid" d="M25 52H475M25 112H475M25 172H475M25 232H475M90 20V300M180 20V300M270 20V300M360 20V300M450 20V300" /><path className="map-route" d="M85 238c72-56 74-126 144-120 70 6 63 91 136 55 42-21 55-77 83-106" /><circle className="map-pickup" cx="85" cy="238" r="9" /><circle className="map-destination" cx="448" cy="67" r="11" /><circle className="map-driver" cx="276" cy="154" r="6" /></svg><span className="map-label pickup"><MapPin size={14} /> Điểm đón</span><span className="map-label destination"><UtensilsCrossed size={14} /> Điểm đến</span><span className="map-caption">Minh hoạ trải nghiệm · chưa phải theo dõi trực tiếp</span></div></div></section>;
}

function SafetySection() {
  return <section className="landing-section safety-section" id="an-toan"><div className="landing-container safety-layout"><div className="safety-copy"><span className="eyebrow">AN TOÀN & XÁC NHẬN</span><h2>X-One chuẩn bị. Bạn quyết định.</h2><p>Thông tin được gom lại để bạn dễ kiểm tra: lựa chọn nào, điều kiện nào và phần nào cần sự đồng ý của bạn.</p><div className="safety-points"><span><ShieldCheck size={18} /> Rõ thông tin trước khi xác nhận</span><span><Clock3 size={18} /> Cập nhật khi điều kiện thay đổi</span></div></div><article className="confirmation-preview"><div className="confirmation-heading"><ShieldCheck size={20} /><div><span>XÁC NHẬN BƯỚC QUAN TRỌNG</span><h3>Giữ bàn cho 2 người</h3></div></div><dl><div><dt>Nhà hàng</dt><dd>Không gian phù hợp</dd></div><div><dt>Thời gian</dt><dd>Tối nay · 19:00</dd></div><div><dt>Chi tiết</dt><dd>2 người</dd></div></dl><div className="confirmation-actions"><a className="button button-secondary" href="#cach-hoat-dong">Tìm hiểu quy trình</a><Link className="button button-primary" href="/register">Bắt đầu với X-One</Link></div></article></div></section>;
}

function AssistantPreview() {
  return <section className="landing-section assistant-preview-section"><div className="landing-container assistant-preview-layout"><div><span className="eyebrow">TRỢ LÝ X-ONE</span><h2>Trò chuyện tự nhiên, nhưng luôn biết bạn đang ở bước nào.</h2><p>Giao diện trợ lý ưu tiên kết quả, lựa chọn và điểm cần xác nhận — không phô bày chi tiết kỹ thuật không cần thiết.</p><Link className="text-link arrow-link" href="/register">Bắt đầu cuộc trò chuyện <ArrowRight size={17} /></Link></div><div className="assistant-preview-card"><div className="preview-topline"><XOneMark size={24} /><span>Cuộc trò chuyện mới</span><i /></div><div className="preview-message user">Tối nay tìm một chỗ ăn cho 2 người nhé.</div><div className="preview-message assistant">Mình đã tìm được một vài lựa chọn phù hợp. Bạn muốn xem theo khu vực nào?</div><div className="preview-result"><div><UtensilsCrossed size={19} /><span><strong>Nhà hàng phù hợp</strong><small>Thông tin để bạn xem trước</small></span></div><span className="button button-secondary">Xem lựa chọn <ChevronRight size={15} /></span></div><div className="preview-confirm"><ShieldCheck size={16} /> Bạn sẽ xác nhận trước khi giữ bàn.</div></div></div></section>;
}

function FinalCta() {
  return <section className="final-cta"><div className="landing-container"><XOneMark size={42} /><div><h2>Một nơi để bắt đầu.<br />X-One lo phần kết nối còn lại.</h2><p>Bạn vẫn là người quyết định ở mỗi bước quan trọng.</p></div><div className="hero-actions"><Link className="button button-primary button-large" href="/register">Bắt đầu với X-One <ArrowRight size={18} /></Link><Link className="button button-secondary button-large" href="/login">Đăng nhập</Link></div></div></section>;
}

function Footer() {
  return <footer className="landing-footer"><div className="landing-container"><div className="footer-brand"><XOneMark size={26} /><strong>X-One</strong></div><p>Một trải nghiệm thống nhất cho những việc cần được kết nối rõ ràng.</p><span>© X-One</span></div></footer>;
}
