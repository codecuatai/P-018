import Link from "next/link";

export default function NotFound() {
  return <main className="route-shell" id="main-content"><span className="eyebrow">404 · KHÔNG TÌM THẤY</span><h1>Đường dẫn này không có trong X-One.</h1><p>Trang có thể đã thay đổi, hoặc chưa thuộc phạm vi sản phẩm hiện tại.</p><Link className="button button-primary" href="/">Về trang chủ</Link></main>;
}
