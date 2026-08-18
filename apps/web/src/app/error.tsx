"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-shell" id="main-content"><span className="eyebrow">KẾT NỐI TẠM GIÁN ĐOẠN</span><h1>X-One chưa thể mở phần này.</h1><p>Bạn có thể thử lại. Thông tin riêng tư hoặc chi tiết kỹ thuật sẽ không được hiển thị ở đây.</p><button className="button button-primary" type="button" onClick={() => reset()}>Thử lại</button></main>;
}
