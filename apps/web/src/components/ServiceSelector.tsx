import type { LucideIcon } from "lucide-react";
import { CalendarDays, CarFront, Stethoscope, Utensils } from "lucide-react";
import type { Domain } from "../types";

export interface ServiceDefinition {
  domain: Domain;
  label: string;
  shortLabel: string;
  description: string;
  examples: string[];
  prompt: string;
  icon: LucideIcon;
  accent: string;
}

export const SERVICE_CATALOG: ServiceDefinition[] = [
  {
    domain: "ride",
    label: "Đặt xe",
    shortLabel: "Xe",
    description: "Nhận báo giá và hoàn tất chuyến đi qua Gateway.",
    examples: ["Từ sân bay Nội Bài đến Hoàn Kiếm", "Xe 4 chỗ"],
    prompt: "Từ sân bay Nội Bài đến Hoàn Kiếm bằng xe 4 chỗ",
    icon: CarFront,
    accent: "blue",
  },
  {
    domain: "food",
    label: "Đặt đồ ăn",
    shortLabel: "Đồ ăn",
    description: "Tìm món, chọn quán, xem giỏ hàng và đặt món thật.",
    examples: ["Tìm phở bò ở Hà Nội", "Giao về nhà riêng"],
    prompt: "Tìm phở bò dưới 100 nghìn ở Hà Nội",
    icon: Utensils,
    accent: "orange",
  },
  {
    domain: "restaurant",
    label: "Đặt bàn",
    shortLabel: "Nhà hàng",
    description: "Tìm chỗ, giữ bàn và xác nhận đặt chỗ rõ ràng.",
    examples: ["2 người tối mai ở Hà Nội", "19:00"],
    prompt: "Đặt bàn cho 2 người tối mai ở Hà Nội",
    icon: CalendarDays,
    accent: "green",
  },
  {
    domain: "healthcare",
    label: "Đặt lịch khám",
    shortLabel: "Sức khỏe",
    description: "Chọn khoa, bác sĩ, khung giờ và xác nhận lịch khám.",
    examples: ["Tôi bị đau bụng", "Khoa tiêu hóa"],
    prompt: "Tôi bị mệt và muốn đặt lịch khám",
    icon: Stethoscope,
    accent: "violet",
  },
];

export function serviceDefinition(domain: Domain): ServiceDefinition {
  return SERVICE_CATALOG.find((item) => item.domain === domain) ?? SERVICE_CATALOG[0];
}

interface ServiceSelectorProps {
  activeDomain: Domain;
  onSelect: (domain: Domain) => void;
}

export function ServiceSelector({ activeDomain, onSelect }: ServiceSelectorProps) {
  return (
    <div className="service-selector" aria-label="Chọn dịch vụ">
      {SERVICE_CATALOG.map((service) => {
        const Icon = service.icon;
        return (
          <button
            className={`service-selector-item service-${service.accent} ${activeDomain === service.domain ? "active" : ""}`}
            key={service.domain}
            onClick={() => onSelect(service.domain)}
            type="button"
          >
            <Icon size={17} aria-hidden="true" />
            <span>{service.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ServiceHubProps {
  onStart: (domain: Domain) => void;
}

export function ServiceHub({ onStart }: ServiceHubProps) {
  return (
    <section className="service-hub" aria-labelledby="service-hub-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">DỊCH VỤ</span>
          <h1 id="service-hub-title">Một trợ lý cho mọi việc hằng ngày</h1>
          <p>Chọn một dịch vụ để bắt đầu cuộc trò chuyện với Gateway.</p>
        </div>
      </div>
      <div className="service-hub-grid">
        {SERVICE_CATALOG.map((service) => {
          const Icon = service.icon;
          return (
            <article className={`service-card service-${service.accent}`} key={service.domain}>
              <div className="service-card-icon"><Icon size={22} aria-hidden="true" /></div>
              <div className="service-card-copy">
                <h2>{service.label}</h2>
                <p>{service.description}</p>
                <div className="service-examples">
                  {service.examples.map((example) => <span key={example}>{example}</span>)}
                </div>
              </div>
              <button className="button button-secondary" onClick={() => onStart(service.domain)} type="button">
                Bắt đầu
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
