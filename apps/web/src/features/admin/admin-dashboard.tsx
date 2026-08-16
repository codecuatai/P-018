"use client";

import { Activity, AlertTriangle, CheckCircle2, Database, ExternalLink, Gauge, LifeBuoy, RefreshCw, ShieldCheck, Users, Workflow } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorText, getAdminDatasets, getAdminPayments, getAdminSupportTickets, getAdminSummary, getAdminSystemHealth, getAdminTransactions, getAdminUsers, getAdminWorkflows, updateAdminSupportTicket } from "@/lib/api-client";
import type { AdminHealthCheck, AdminPayments, AdminSummary, AdminTransactionRecord, AdminUserRecord, AdminWorkflowRecord, SupportPriority, SupportTicket, SupportTicketStatus } from "@/types";

type Loadable<T> = { data?: T; loading: boolean; error?: string };

const navItems = [
  ["overview", "Tổng quan"],
  ["users", "Người dùng"],
  ["transactions", "Giao dịch domain"],
  ["payments", "Thanh toán & hoàn tiền"],
  ["workflows", "Workflow"],
  ["health", "Sức khỏe hệ thống"],
  ["datasets", "Dataset"],
  ["support", "Support"],
] as const;

export function AdminDashboard() {
  const [summary, setSummary] = useState<Loadable<AdminSummary>>({ loading: true });
  const [users, setUsers] = useState<Loadable<{ items: AdminUserRecord[]; total: number; page: number; page_size: number }>>({ loading: true });
  const [transactions, setTransactions] = useState<Loadable<{ items: AdminTransactionRecord[]; page: number; page_size: number; partial: boolean; unavailable: string[] }>>({ loading: true });
  const [payments, setPayments] = useState<Loadable<AdminPayments>>({ loading: true });
  const [workflows, setWorkflows] = useState<Loadable<{ items: AdminWorkflowRecord[]; total: number; page: number; page_size: number }>>({ loading: true });
  const [datasets, setDatasets] = useState<Loadable<{ items: AdminSummary["datasets"] }>>({ loading: true });
  const [health, setHealth] = useState<Loadable<{ items: AdminHealthCheck[] }>>({ loading: true });
  const [support, setSupport] = useState<Loadable<{ items: SupportTicket[]; total: number }>>({ loading: true });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const requests = await Promise.allSettled([
      getAdminSummary(),
      getAdminUsers(),
      getAdminTransactions(),
      getAdminPayments(),
      getAdminWorkflows(),
      getAdminDatasets(),
      getAdminSystemHealth(),
      getAdminSupportTickets(),
    ]);
    const [summaryResult, usersResult, transactionResult, paymentsResult, workflowsResult, datasetsResult, healthResult, supportResult] = requests;
    setSummary(loadable(summaryResult));
    setUsers(loadable(usersResult));
    setTransactions(loadable(transactionResult));
    setPayments(loadable(paymentsResult));
    setWorkflows(loadable(workflowsResult));
    setDatasets(loadable(datasetsResult));
    setHealth(loadable(healthResult));
    setSupport(loadable(supportResult));
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) {
    try {
      const updated = await updateAdminSupportTicket(id, patch);
      setSupport((current) => ({ ...current, data: current.data ? { ...current.data, items: current.data.items.map((ticket) => ticket.id === id ? updated : ticket) } : current.data }));
    } catch (error) {
      setSupport((current) => ({ ...current, error: errorText(error) }));
    }
  }

  const overviewError = summary.error;
  return <main className="admin-page" id="main-content">
    <header className="admin-header">
      <div>
        <span className="eyebrow">OPS · ADMIN</span>
        <h1>Trung tâm vận hành X-One</h1>
        <p>Theo dõi dữ liệu thật từ Gateway và các domain. Trạng thái thiếu dữ liệu được giữ nguyên để không nhầm với số 0.</p>
      </div>
      <button className="button button-secondary" type="button" onClick={() => void load()} disabled={refreshing} aria-label="Làm mới dashboard">
        <RefreshCw size={16} className={refreshing ? "spin" : undefined} /> {refreshing ? "Đang tải…" : "Làm mới"}
      </button>
    </header>

    <nav className="admin-nav" aria-label="Các khu vực vận hành">
      {navItems.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
    </nav>

    <section className="admin-section" id="overview" aria-labelledby="overview-title">
      <SectionHeading icon={<Gauge size={18} />} title="Tổng quan" id="overview-title" />
      {overviewError ? <ErrorPanel message={overviewError} onRetry={() => void load()} /> : summary.loading ? <LoadingPanel /> : summary.data ? <>
        <div className="admin-metric-grid">
          <Metric label="Tài khoản" value={summary.data.counts.total_users} icon={<Users size={17} />} />
          <Metric label="Thanh toán" value={summary.data.counts.payments} icon={<Activity size={17} />} />
          <Metric label="Hoàn tiền" value={summary.data.counts.refunds} icon={<RefreshCw size={17} />} />
          <Metric label="Support đang mở" value={summary.data.counts.open_support_tickets} icon={<LifeBuoy size={17} />} />
          <Metric label="Workflow lỗi" value={summary.data.counts.failed_workflows} icon={<AlertTriangle size={17} />} tone="warning" />
          <Metric label="Workflow partial" value={summary.data.counts.partial_success_workflows} icon={<Workflow size={17} />} tone="warning" />
        </div>
        <div className="admin-two-column">
          <div className="admin-card">
            <CardTitle title="Domain summary" note="Nguồn: endpoint ops nội bộ" />
            <div className="admin-domain-list">{summary.data.domains.map((domain) => <DomainRow key={domain.domain} label={domain.domain} status={domain.status} detail={domain.data ? compactCounts(domain.data.counts) : domain.error} />)}</div>
          </div>
          <div className="admin-card">
            <CardTitle title="Tín hiệu hệ thống" note="Probe tại thời điểm tải trang" />
            <HealthList items={summary.data.health.items} compact />
          </div>
        </div>
      </> : <EmptyPanel label="Chưa có dữ liệu tổng quan." />}
    </section>

    <section className="admin-section" id="users" aria-labelledby="users-title">
      <SectionHeading icon={<Users size={18} />} title="Người dùng" id="users-title" />
      <PanelState state={users} empty="Chưa có tài khoản." retry={() => void load()}>
        {(data) => <DataTable caption={`${data.total} tài khoản`} headers={["Email", "Tên", "Vai trò", "Trạng thái", "Tạo lúc"]} rows={data.items.map((user) => [user.email, user.full_name, user.role, user.status, formatDate(user.created_at)])} />}
      </PanelState>
    </section>

    <section className="admin-section" id="transactions" aria-labelledby="transactions-title">
      <SectionHeading icon={<Activity size={18} />} title="Giao dịch domain" id="transactions-title" />
      <PanelState state={transactions} empty="Chưa có giao dịch domain." retry={() => void load()}>
        {(data) => <>
          {data.partial ? <InlineNotice>Chưa thể đọc: {data.unavailable.join(", ")}. Các dòng còn lại là dữ liệu đã đọc được.</InlineNotice> : null}
          <DataTable caption={`${data.items.length} dòng trong trang hiện tại`} headers={["Domain", "Mã giao dịch", "Trạng thái", "Thời điểm"]} rows={data.items.map((item) => [item.domain, transactionId(item.transaction), valueText(item.transaction.status), formatDate(valueText(item.transaction.created_at ?? item.transaction.createdAt))])} />
        </>}
      </PanelState>
    </section>

    <section className="admin-section" id="payments" aria-labelledby="payments-title">
      <SectionHeading icon={<ShieldCheck size={18} />} title="Thanh toán & hoàn tiền" id="payments-title" />
      <PanelState state={payments} empty="Chưa có dữ liệu thanh toán." retry={() => void load()}>
        {(data) => <div className="admin-two-column">
          <DataTable caption={`Thanh toán · ${data.payments.total}`} headers={["Mã", "Số tiền", "Trạng thái", "Tạo lúc"]} rows={data.payments.items.map((item) => [valueText(item.id), money(item.amount, item.currency), valueText(item.status), formatDate(valueText(item.createdAt ?? item.created_at))])} />
          <DataTable caption={`Hoàn tiền · ${data.refunds.total}`} headers={["Mã", "Payment", "Số tiền", "Trạng thái"]} rows={data.refunds.items.map((item) => [valueText(item.id), valueText(item.paymentId ?? item.payment_id), money(item.amount, item.currency), valueText(item.status)])} />
        </div>}
      </PanelState>
    </section>

    <section className="admin-section" id="workflows" aria-labelledby="workflows-title">
      <SectionHeading icon={<Workflow size={18} />} title="Workflow reconciliation" id="workflows-title" />
      <PanelState state={workflows} empty="Chưa có workflow cần reconciliation." retry={() => void load()}>
        {(data) => <DataTable caption={`${data.total} workflow`} headers={["Order", "Status", "Lần thử", "Lỗi gần nhất", "Cập nhật"]} rows={data.items.map((item) => [item.orderId, item.status, String(item.attemptCount), item.lastErrorCode ?? "—", formatDate(item.completedAt ?? item.claimedAt)])} />}
      </PanelState>
    </section>

    <section className="admin-section" id="health" aria-labelledby="health-title">
      <SectionHeading icon={<Activity size={18} />} title="Sức khỏe hệ thống" id="health-title" />
      <PanelState state={health} empty="Không nhận được dữ liệu health." retry={() => void load()}>
        {(data) => <HealthList items={data.items} />}
      </PanelState>
    </section>

    <section className="admin-section" id="datasets" aria-labelledby="datasets-title">
      <SectionHeading icon={<Database size={18} />} title="Dataset & độ tươi" id="datasets-title" />
      <PanelState state={datasets} empty="Chưa có trạng thái dataset." retry={() => void load()}>
        {(data) => <div className="admin-domain-list">{data.items.map((item) => <DomainRow key={item.domain} label={item.domain} status={item.status} detail={item.data ? datasetDetail(item.data) : item.error} />)}</div>}
      </PanelState>
    </section>

    <section className="admin-section" id="support" aria-labelledby="support-title">
      <SectionHeading icon={<LifeBuoy size={18} />} title="Support queue" id="support-title" />
      <PanelState state={support} empty="Chưa có support ticket." retry={() => void load()}>
        {(data) => <div className="admin-support-list">{data.items.map((ticket) => <SupportRow key={ticket.id} ticket={ticket} onUpdate={updateTicket} />)}</div>}
      </PanelState>
    </section>
  </main>;
}

function loadable<T>(result: PromiseSettledResult<T>): Loadable<T> {
  return result.status === "fulfilled" ? { data: result.value, loading: false } : { loading: false, error: errorText(result.reason) };
}

function SectionHeading({ icon, title, id }: { icon: React.ReactNode; title: string; id: string }) {
  return <div className="admin-section-heading"><span className="admin-section-icon">{icon}</span><div><span className="eyebrow">X-ONE OPS</span><h2 id={id}>{title}</h2></div></div>;
}

function CardTitle({ title, note }: { title: string; note: string }) {
  return <div className="admin-card-title"><h3>{title}</h3><span>{note}</span></div>;
}

function Metric({ label, value, icon, tone = "default" }: { label: string; value: unknown; icon: React.ReactNode; tone?: "default" | "warning" }) {
  return <article className={`admin-metric admin-metric-${tone}`}><span className="admin-metric-icon">{icon}</span><span>{label}</span><strong>{valueNumber(value)}</strong></article>;
}

function DomainRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  return <div className="admin-domain-row"><span className={`admin-status-dot status-${status}`} aria-hidden="true" /><strong>{label}</strong><span className="admin-domain-detail">{detail ?? "Chưa có dữ liệu"}</span><span className={`admin-badge status-${status}`}>{status === "healthy" ? "Sẵn sàng" : "Suy giảm"}</span></div>;
}

function HealthList({ items, compact = false }: { items: AdminHealthCheck[]; compact?: boolean }) {
  return <div className={`admin-health-list${compact ? " is-compact" : ""}`}>{items.map((item) => <div className="admin-health-row" key={item.service}><span className={`admin-status-dot status-${item.status}`} aria-hidden="true" /><strong>{item.service}</strong><span>{item.status === "healthy" ? `${item.latency_ms} ms` : item.error ?? "Unavailable"}</span><time dateTime={item.checked_at}>{formatDate(item.checked_at)}</time></div>)}</div>;
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><caption>{caption}</caption><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${caption}-${index}`}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell || "—"}</td>)}</tr>) : <tr><td colSpan={headers.length}>Không có dòng trong trang hiện tại.</td></tr>}</tbody></table></div>;
}

function SupportRow({ ticket, onUpdate }: { ticket: SupportTicket; onUpdate: (id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) => Promise<void> }) {
  return <article className="admin-support-row"><div><span className="eyebrow">{ticket.id}</span><h3>{ticket.subject}</h3><p>{ticket.description}</p><small>{ticket.actor_id} · {formatDate(ticket.updated_at)}</small></div><div className="admin-support-controls"><label>Trạng thái<select value={ticket.status} onChange={(event) => void onUpdate(ticket.id, { status: event.target.value as SupportTicketStatus })}><option value="OPEN">Mở</option><option value="IN_PROGRESS">Đang xử lý</option><option value="RESOLVED">Đã xử lý</option><option value="CLOSED">Đóng</option></select></label><label>Ưu tiên<select value={ticket.priority} onChange={(event) => void onUpdate(ticket.id, { priority: event.target.value as SupportPriority })}><option value="LOW">Thấp</option><option value="NORMAL">Thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option></select></label></div></article>;
}

function PanelState<T>({ state, empty, retry, children }: { state: Loadable<T>; empty: string; retry: () => void; children: (data: T) => React.ReactNode }) {
  if (state.loading) return <LoadingPanel />;
  if (state.error) return <ErrorPanel message={state.error} onRetry={retry} />;
  if (!state.data) return <EmptyPanel label={empty} />;
  return <>{children(state.data)}</>;
}

function LoadingPanel() { return <div className="admin-card admin-loading" role="status"><span className="loading-mark" />Đang tải dữ liệu vận hành…</div>; }
function EmptyPanel({ label }: { label: string }) { return <div className="admin-card admin-empty">{label}</div>; }
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="admin-card admin-error"><AlertTriangle size={18} /><span>{message}</span><button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button></div>; }
function InlineNotice({ children }: { children: React.ReactNode }) { return <p className="admin-inline-notice"><AlertTriangle size={15} />{children}</p>; }

function valueNumber(value: unknown): string { return typeof value === "number" ? new Intl.NumberFormat("vi-VN").format(value) : valueText(value, "—"); }
function valueText(value: unknown, fallback = "—"): string { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function transactionId(value: Record<string, unknown>): string { return valueText(value.id ?? value.order_id ?? value.orderId); }
function money(amount: unknown, currency: unknown): string { return typeof amount === "number" ? `${new Intl.NumberFormat("vi-VN").format(amount)} ${valueText(currency, "VND")}` : "—"; }
function formatDate(value: unknown): string { if (!value) return "—"; const parsed = new Date(String(value)); return Number.isNaN(parsed.valueOf()) ? "—" : parsed.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }); }
function compactCounts(value: unknown): string { if (!value || typeof value !== "object") return "Đã kết nối"; return Object.entries(value as Record<string, unknown>).map(([key, entry]) => `${key}: ${valueNumber(entry)}`).join(" · "); }
function datasetDetail(value: Record<string, unknown>): string { return [valueText(value.dataset_name ?? value.dataset), valueText(value.version), value.row_count !== undefined ? `${valueNumber(value.row_count)} dòng` : undefined, valueText(value.freshness_status, "")].filter(Boolean).join(" · ") || "Đã kết nối"; }

