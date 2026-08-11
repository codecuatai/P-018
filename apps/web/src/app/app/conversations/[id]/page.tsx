import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  return <section className="route-shell"><span className="eyebrow">CUỘC TRÒ CHUYỆN</span><h1>Chi tiết cuộc trò chuyện</h1><p>Đường dẫn <code>{id}</code> đã được nhận, nhưng Phase 1 chưa cung cấp lịch sử hội thoại bền vững để tải lại nội dung này. Bạn có thể tiếp tục trong phiên hiện tại.</p><Link className="button button-primary" href="/app">Mở trợ lý</Link></section>;
}
