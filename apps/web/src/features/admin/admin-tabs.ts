import {
  Activity,
  Database,
  HeartPulse,
  Key,
  LayoutDashboard,
  LifeBuoy,
  ShoppingBag,
  Sliders,
  Sparkles,
  Star,
  ScrollText,
  ShieldCheck,
  Users,
  Workflow,
  CreditCard,
  Gauge,
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

export function getConsolidatedTabs(userRole?: string): TabDefinition[] {
  if (userRole === "manager") {
    // Manager Console: only operational duties (shift overview, transactions, support queue)
    // Technical modules (microservice health, datasets, feature flags, users, AI keys, system logs)
    // are restricted to Admin IT.
    return [
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
        id: "transactions",
        label: "Giao dịch & Vận hành",
        subtitle: "Đơn hàng domain, dòng tiền thanh toán và đối soát workflow",
        icon: Activity,
        subtabs: [
          { id: "domain-trans", label: "Giao dịch domain", icon: ShoppingBag, hashName: "transactions" },
          { id: "payments-list", label: "Thanh toán & hoàn tiền", icon: CreditCard, hashName: "payments" },
          { id: "workflow-reconciliation", label: "Workflow reconciliation", icon: Workflow, hashName: "workflows" },
        ],
      },
      {
        id: "support",
        label: "Hỗ trợ & Đánh giá",
        subtitle: "Xử lý hàng đợi support tickets và theo dõi đánh giá dịch vụ",
        icon: LifeBuoy,
        subtabs: [
          { id: "support-queue", label: "Hàng đợi hỗ trợ", icon: LifeBuoy, hashName: "support" },
          { id: "feedback-ratings", label: "Đánh giá & Phản hồi", icon: Star, hashName: "feedback" },
        ],
      },
    ];
  }
  return CONSOLIDATED_TABS;
}

