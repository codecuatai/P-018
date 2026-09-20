import {
  Activity,
  CreditCard,
  Database,
  Gauge,
  HeartPulse,
  Key,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Star,
  Users,
  Workflow,
} from "lucide-react";

import type { TabDefinition } from "./admin.types";

export const CONSOLIDATED_TABS: TabDefinition[] = [
  {
    id: "overview",
    label: "Tổng quan & Hạ tầng",
    subtitle: "Chỉ số tổng hợp, sức khỏe microservices và trạng thái dataset",
    icon: Gauge,
    subtabs: [
      { id: "summary", label: "Tổng quan", icon: LayoutDashboard, hashName: "overview" },
      { id: "health", label: "Sức khỏe hệ thống", icon: HeartPulse, hashName: "health" },
      { id: "datasets", label: "Dataset & độ tươi", icon: Database, hashName: "datasets" },
      { id: "feature-flags", label: "Feature Flags", icon: Sliders, hashName: "feature-flags" },
    ],
  },
  {
    id: "users",
    label: "Người dùng & Phân quyền",
    subtitle: "Danh sách người dùng và quản lý quyền truy cập dịch vụ",
    icon: Users,
    subtabs: [
      { id: "user-list", label: "Người dùng", icon: Users, hashName: "users" },
      { id: "user-services", label: "Dịch vụ User", icon: ShieldCheck, hashName: "user-services" },
      { id: "provider-documents", label: "Hồ sơ đối tác", icon: ShieldCheck, hashName: "provider-documents" },
    ],
  },
  {
    id: "transactions",
    label: "Giao dịch & Vận hành",
    subtitle: "Đơn hàng domain, dòng tiền thanh toán và đối soát workflow",
    icon: Activity,
    subtabs: [
      { id: "domain-trans", label: "Giao dịch domain", icon: ShoppingBag, hashName: "transactions" },
      { id: "payments-list", label: "Thanh toán & hoàn tiền", icon: CreditCard, hashName: "payments" },
      { id: "dispatch", label: "Điều phối & Phân công", icon: Workflow, hashName: "dispatch" },
      { id: "workflow-reconciliation", label: "Workflow reconciliation", icon: Workflow, hashName: "workflows" },
    ],
  },
  {
    id: "ai-integrations",
    label: "AI Engine & API Keys",
    subtitle: "Quản lý khóa API đối tác, token usage và dự toán chi phí AI",
    icon: Sparkles,
    subtabs: [
      { id: "api-keys", label: "Quản lý API Keys", icon: Key, hashName: "api-keys" },
      { id: "token-usage", label: "Tokens & AI Cost", icon: Sparkles, hashName: "token-usage" },
    ],
  },
  {
    id: "support",
    label: "Hỗ trợ & Đánh giá",
    subtitle: "Xử lý hàng đợi support tickets và theo dõi đánh giá dịch vụ",
    icon: LifeBuoy,
    subtabs: [
      { id: "support-queue", label: "Support queue", icon: LifeBuoy, hashName: "support" },
      { id: "feedback-ratings", label: "Đánh giá & Phản hồi", icon: Star, hashName: "feedback" },
    ],
  },
  {
    id: "system-logs",
    label: "System Logs & Audit",
    subtitle: "Truy vết nhật ký vận hành và audit trail thời gian thực",
    icon: ScrollText,
    subtabs: [
      { id: "logs-view", label: "System Logs", icon: ScrollText, hashName: "system-logs" },
      { id: "audit-trail", label: "Audit Trail CSDL", icon: ShieldCheck, hashName: "audit-logs" },
    ],
  },
];

export const MANAGER_FLAT_TABS: TabDefinition[] = [
  {
    id: "overview",
    label: "Tổng quan ca trực",
    subtitle: "Chỉ số tổng hợp và tình hình vận hành ca trực theo thời gian thực",
    icon: Gauge,
    subtabs: [
      { id: "summary", label: "Tổng quan vận hành", icon: LayoutDashboard, hashName: "overview" },
    ],
  },
  {
    id: "domain-orders",
    label: "Đơn hàng domain",
    subtitle: "Theo dõi đơn hàng đa dịch vụ: Gọi xe, Giao đồ ăn, Đặt bàn, Khám y tế",
    icon: ShoppingBag,
    subtabs: [
      { id: "domain-trans", label: "Đơn hàng domain", icon: ShoppingBag, hashName: "domain-orders" },
    ],
  },
  {
    id: "dispatch",
    label: "Điều phối & Phân công",
    subtitle: "Hàng đợi điều phối provider, phân công công việc và quản lý SLA",
    icon: Workflow,
    subtabs: [
      { id: "dispatch", label: "Điều phối & Phân công", icon: Workflow, hashName: "dispatch" },
    ],
  },
  {
    id: "payments",
    label: "Thanh toán & Hoàn tiền",
    subtitle: "Dòng tiền giao dịch thanh toán và xử lý tra soát lệnh hoàn tiền",
    icon: CreditCard,
    subtabs: [
      { id: "payments-list", label: "Thanh toán & hoàn tiền", icon: CreditCard, hashName: "payments" },
    ],
  },
  {
    id: "incident-recovery",
    label: "Khắc phục sự cố & Bồi thường",
    subtitle: "Xử lý workflow lỗi, đối soát sự cố và phát hành voucher bồi thường khách hàng",
    icon: ShieldAlert,
    subtabs: [
      { id: "workflow-reconciliation", label: "Khắc phục sự cố", icon: ShieldAlert, hashName: "incident-recovery" },
    ],
  },
  {
    id: "support",
    label: "Hàng đợi hỗ trợ",
    subtitle: "Tiếp nhận và phản hồi yêu cầu hỗ trợ khách hàng theo thời gian thực",
    icon: LifeBuoy,
    subtabs: [
      { id: "support-queue", label: "Hàng đợi hỗ trợ", icon: LifeBuoy, hashName: "support" },
    ],
  },
  {
    id: "feedback",
    label: "Đánh giá & Phản hồi",
    subtitle: "Theo dõi điểm số chất lượng dịch vụ và ý kiến đóng góp từ người dùng",
    icon: Star,
    subtabs: [
      { id: "feedback-ratings", label: "Đánh giá & Phản hồi", icon: Star, hashName: "feedback" },
    ],
  },
  {
    id: "provider-verification",
    label: "Duyệt hồ sơ đối tác",
    subtitle: "Thẩm định giấy tờ pháp lý, bằng lái và chứng chỉ hoạt động của đối tác",
    icon: ShieldCheck,
    subtabs: [
      { id: "provider-documents", label: "Duyệt hồ sơ đối tác", icon: ShieldCheck, hashName: "provider-verification" },
    ],
  },
];

export function getConsolidatedTabs(userRole?: string): TabDefinition[] {
  if (userRole === "manager") {
    // Manager Console: only operational duties (shift overview, domain orders, dispatch, payments,
    // incident recovery, support queue, feedback, provider document verification).
    // Technical modules (microservice health, datasets, feature flags, users, AI keys, system logs)
    // are restricted to Admin IT.
    return MANAGER_FLAT_TABS;
  }
  return CONSOLIDATED_TABS;
}

