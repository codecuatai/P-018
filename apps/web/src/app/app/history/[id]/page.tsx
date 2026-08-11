import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

export default async function HistoryDetailPage({ params }: Props) {
  const { id } = await params;
  return <section className="route-shell"><span className="eyebrow">HOẠT ĐỘNG</span><h1>Chi tiết hoạt động chưa có nguồn dữ liệu.</h1><p>Hoạt động <code>{id}</code> chưa có nguồn lịch sử thống nhất trong Phase 1. X-One không tạo dữ liệu minh hoạ thay cho giao dịch thực tế.</p><Link className="button button-secondary" href="/app/history">Về lịch sử</Link></section>;
}
