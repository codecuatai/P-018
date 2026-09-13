"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Award, CheckCheck, Copy, Gift, History, Ticket, Users } from "lucide-react";

import {
  errorText,
  getReferralInfo,
  getRewardsLedger,
  getRewardsSummary,
  getRewardsVouchers,
  type ReferralData,
  type RewardsLedgerItem,
  type RewardsSummary,
  type RewardVoucherItem,
} from "@/lib/api-client";

type MainTab = "overview" | "vouchers" | "ledger" | "referral";
type VoucherTab = "active" | "used" | "expired";

const TIER_ICONS: Record<string, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  diamond: "💎",
};

const SERVICE_COLORS: Record<string, string> = {
  ride: "#0284C7",
  food: "#EA580C",
  restaurant: "#E11D48",
  healthcare: "#059669",
};

const SERVICE_LABELS: Record<string, string> = {
  ride: "Chuyến xe",
  food: "Đồ ăn",
  restaurant: "Nhà hàng",
  healthcare: "Y tế",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDiscount(voucher: RewardVoucherItem): string {
  if (voucher.discount_type === "percent") return `Giảm ${voucher.discount_value}%`;
  return `Giảm ${formatCurrency(voucher.discount_value)}`;
}

export default function RewardsPage() {
  const [tab, setTab] = useState<MainTab>("overview");
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [referralFallback, setReferralFallback] = useState<ReferralData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const [result, referral] = await Promise.allSettled([getRewardsSummary(), getReferralInfo()]);
      if (result.status === "fulfilled") {
        setSummary(result.value);
      } else {
        setSummaryError(errorText(result.reason));
      }
      if (referral.status === "fulfilled") setReferralFallback(referral.value);
    } catch (reason) {
      setSummaryError(errorText(reason));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const unavailable = summaryError !== "";
  const tierIcon = summary ? (TIER_ICONS[summary.tier] ?? "🎖️") : "🎖️";

  return (
    <section className="route-shell rewards-page" aria-labelledby="rewards-title">
      <header className="section-heading">
        <div>
          <span className="eyebrow">ĐIỂM THƯỞNG &amp; ƯU ĐÃI</span>
          <h1 id="rewards-title">Điểm thưởng của bạn</h1>
          <p>Tích điểm mỗi lần dùng dịch vụ, đổi voucher và mời bạn bè cùng nhận quà.</p>
        </div>
      </header>

      <div className="notification-tabs" role="tablist" aria-label="Danh mục điểm thưởng">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<Award size={15} />}>
          Tổng quan
        </TabButton>
        <TabButton active={tab === "vouchers"} onClick={() => setTab("vouchers")} icon={<Ticket size={15} />}>
          Voucher
        </TabButton>
        <TabButton active={tab === "ledger"} onClick={() => setTab("ledger")} icon={<History size={15} />}>
          Lịch sử điểm
        </TabButton>
        <TabButton active={tab === "referral"} onClick={() => setTab("referral")} icon={<Users size={15} />}>
          Giới thiệu
        </TabButton>
      </div>

      {tab === "overview" ? (
        <OverviewTab
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          unavailable={unavailable}
          tierIcon={tierIcon}
          referralTotal={referralFallback?.total_referrals ?? 0}
          onRetry={() => void loadSummary()}
        />
      ) : null}
      {tab === "vouchers" ? <VouchersTab /> : null}
      {tab === "ledger" ? <LedgerTab /> : null}
      {tab === "referral" ? <ReferralTab /> : null}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? "is-active" : ""}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

function OverviewTab({
  summary,
  loading,
  error,
  unavailable,
  tierIcon,
  referralTotal,
  onRetry,
}: {
  summary: RewardsSummary | null;
  loading: boolean;
  error: string;
  unavailable: boolean;
  tierIcon: string;
  referralTotal: number;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div aria-live="polite" aria-busy="true">
        <div className="rewards-hero-card">
          <span className="sessions-skeleton" aria-hidden="true">
            <span />
            <span />
          </span>
          <p className="inline-note">Đang tải điểm thưởng…</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="empty-state" role="status">
        <Gift size={24} />
        <h2>Tính năng đang cập nhật</h2>
        <p>{error || "Chưa tải được thông tin điểm thưởng. Bạn quay lại sau nhé."}</p>
        <button className="button button-secondary" type="button" onClick={onRetry}>
          Thử lại
        </button>
      </div>
    );
  }

  const expiring = summary.points_expiring_soon > 0;
  const expiryText = summary.expiry_date ? formatDate(summary.expiry_date) : "";

  return (
    <div>
      {unavailable ? null : null}
      <div className="rewards-hero-card">
        <div className="rewards-hero-top">
          <span className="rewards-tier-badge" aria-label={`Hạng ${summary.tier_label}`}>
            <span aria-hidden="true">{tierIcon}</span>
            {summary.tier_label}
          </span>
          <span className="rewards-points">
            <strong>{summary.points.toLocaleString("vi-VN")}</strong>
            <small>điểm</small>
          </span>
        </div>
        <div className="tier-progress" aria-label="Tiến độ lên hạng">
          <div className="tier-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={50}>
            <span className="tier-progress-fill" />
          </div>
          <p>
            Chi tiêu thêm <strong>{formatCurrency(summary.next_tier_spend_remaining)}</strong> để lên{" "}
            <strong>{summary.next_tier_label}</strong>
          </p>
        </div>
        {expiring ? (
          <p className="rewards-expiry-warning" role="status">
            Sắp hết hạn {summary.points_expiring_soon.toLocaleString("vi-VN")} điểm
            {expiryText ? ` (trước ${expiryText})` : ""} — hãy dùng sớm nhé!
          </p>
        ) : (
          <p className="inline-note">Điểm của bạn đang an toàn, chưa có điểm nào sắp hết hạn.</p>
        )}
      </div>

      <div className="rewards-stat-grid">
        <div className="rewards-stat">
          <small>Điểm hiện tại</small>
          <strong>{summary.points.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="rewards-stat">
          <small>Hạng</small>
          <strong>
            {tierIcon} {summary.tier_label}
          </strong>
        </div>
        <div className="rewards-stat">
          <small>Điểm sắp hết hạn</small>
          <strong className={expiring ? "rewards-expiry-warning-text" : ""}>
            {summary.points_expiring_soon.toLocaleString("vi-VN")}
          </strong>
        </div>
        <div className="rewards-stat">
          <small>Tổng mời bạn</small>
          <strong>{referralTotal}</strong>
        </div>
      </div>
    </div>
  );
}

function VouchersTab() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<VoucherTab>("active");
  const [vouchers, setVouchers] = useState<RewardVoucherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async (status: VoucherTab) => {
    setLoading(true);
    setError("");
    try {
      const result = await getRewardsVouchers(status);
      setVouchers(result.items ?? []);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(subTab);
  }, [load, subTab]);

  async function copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  const subTabs: Array<{ key: VoucherTab; label: string }> = [
    { key: "active", label: "Khả dụng" },
    { key: "used", label: "Đã dùng" },
    { key: "expired", label: "Hết hạn" },
  ];

  return (
    <div>
      <div className="notification-tabs" role="tablist" aria-label="Trạng thái voucher">
        {subTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={subTab === item.key}
            className={subTab === item.key ? "is-active" : ""}
            onClick={() => setSubTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {copied ? (
        <p className="copy-toast" role="status">
          <CheckCheck size={15} /> Đã sao chép!
        </p>
      ) : null}

      {loading ? (
        <p className="inline-note" aria-live="polite">
          Đang tải voucher…
        </p>
      ) : error ? (
        <div className="error-panel" role="alert">
          <p>Tính năng đang cập nhật</p>
          <button className="button button-secondary" type="button" onClick={() => void load(subTab)}>
            Thử lại
          </button>
        </div>
      ) : vouchers.length === 0 ? (
        <div className="empty-state">
          <Ticket size={24} />
          <h2>Chưa có voucher</h2>
          <p>Tích điểm để đổi ưu đãi</p>
          <Link className="button button-primary" href="/app">
            Tích điểm ngay
          </Link>
        </div>
      ) : (
        <div className="activity-list">
          {vouchers.map((voucher) => {
            const color = SERVICE_COLORS[voucher.service] ?? "#4F46E5";
            return (
              <article
                key={voucher.id}
                className={`voucher-card service-${voucher.service}`}
                style={{ borderLeftColor: color }}
              >
                <div className="voucher-copy">
                  <span
                    className="voucher-service-badge"
                    style={{ color, borderColor: color, background: `${color}14` }}
                  >
                    {SERVICE_LABELS[voucher.service] ?? voucher.service}
                  </span>
                  <strong>{voucher.title}</strong>
                  <p>
                    {formatDiscount(voucher)} · Đơn tối thiểu {formatCurrency(voucher.min_order_value)}
                  </p>
                  <small>Hạn dùng: {formatDate(voucher.expires_at)} · Mã: {voucher.code}</small>
                </div>
                <div className="voucher-actions">
                  <button className="button button-secondary" type="button" onClick={() => void copyCode(voucher.code)}>
                    <Copy size={15} /> Sao chép mã
                  </button>
                  {voucher.status === "active" ? (
                    <button className="button button-primary" type="button" onClick={() => router.push("/app")}>
                      Dùng ngay
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LedgerTab() {
  const [entries, setEntries] = useState<RewardsLedgerItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError("");
    try {
      const result = await getRewardsLedger(currentPage);
      setEntries(result.items ?? []);
      setHasMore(result.has_more);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  if (loading) return <p className="inline-note">Đang tải lịch sử điểm…</p>;
  if (error) {
    return (
      <div className="error-panel" role="alert">
        <p>Tính năng đang cập nhật</p>
        <button className="button button-secondary" type="button" onClick={() => void load(page)}>
          Thử lại
        </button>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <History size={24} />
        <h2>Chưa có lịch sử điểm</h2>
        <p>Dùng dịch vụ để bắt đầu tích điểm nhé.</p>
        <Link className="button button-primary" href="/app">
          Khám phá dịch vụ
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="activity-list">
        {entries.map((entry) => {
          const earn = entry.type === "earn";
          return (
            <article key={entry.id} className="ledger-row">
              <span className={`ledger-icon ${earn ? "is-earn" : "is-burn"}`} aria-hidden="true">
                {earn ? "+" : "−"}
              </span>
              <span className="ledger-copy">
                <strong className={earn ? "ledger-earn" : "ledger-burn"}>
                  {earn ? "+" : "−"}
                  {entry.points.toLocaleString("vi-VN")} điểm
                </strong>
                <p>{entry.description}</p>
                <small>{formatDate(entry.created_at)}</small>
              </span>
            </article>
          );
        })}
      </div>
      <nav className="history-pagination" aria-label="Phân trang lịch sử điểm">
        <button
          className="button button-secondary"
          type="button"
          disabled={page === 1 || loading}
          onClick={() => setPage((current) => current - 1)}
        >
          Trang trước
        </button>
        <span>Trang {page}</span>
        <button
          className="button button-secondary"
          type="button"
          disabled={!hasMore || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          Trang sau
        </button>
      </nav>
    </div>
  );
}

function ReferralTab() {
  const [info, setInfo] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setInfo(await getReferralInfo());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyText(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  if (loading) return <p className="inline-note">Đang tải thông tin giới thiệu…</p>;
  if (!info) {
    return (
      <div className="error-panel" role="alert">
        <p>{error || "Tính năng đang cập nhật"}</p>
        <button className="button button-secondary" type="button" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div>
      {copied ? (
        <p className="copy-toast" role="status">
          <CheckCheck size={15} /> Đã sao chép!
        </p>
      ) : null}
      <div className="referral-card">
        <small>MÃ GIỚI THIỆU CỦA BẠN</small>
        <strong>{info.referral_code}</strong>
        <div className="referral-actions">
          <button className="button button-secondary" type="button" onClick={() => void copyText(info.referral_code)}>
            <Copy size={15} /> Sao chép mã
          </button>
          <button className="button button-primary" type="button" onClick={() => void copyText(info.referral_url)}>
            <Copy size={15} /> Sao chép link chia sẻ
          </button>
        </div>
        <p className="referral-guide">
          Bạn nhận 50k + bạn mình nhận 100 điểm khi hoàn thành dịch vụ đầu tiên.
        </p>
        <p className="inline-note">
          Đã mời {info.total_referrals} bạn · Nhận {info.total_points_earned.toLocaleString("vi-VN")} điểm
        </p>
      </div>

      {info.referrals.length === 0 ? (
        <div className="empty-state">
          <Users size={24} />
          <h2>Chưa có bạn nào tham gia</h2>
          <p>Chia sẻ mã của bạn để cùng nhận quà nhé.</p>
        </div>
      ) : (
        <div className="activity-list">
          {info.referrals.map((person, index) => (
            <article key={`${person.name}-${index}`} className="ledger-row">
              <span className="ledger-icon is-earn" aria-hidden="true">
                <Users size={16} />
              </span>
              <span className="ledger-copy">
                <strong>{person.name}</strong>
                <p>Tham gia {formatDate(person.joined_at)}</p>
              </span>
              <span className={`status-badge ${person.status === "rewarded" ? "" : "referral-pending"}`}>
                {person.status === "rewarded" ? "Đã nhận thưởng" : "Đang chờ"}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
