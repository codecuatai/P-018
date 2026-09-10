# Plan Redesign Toàn Bộ Giao Diện Customer X-One (Responsive)

Ngày: 2026-09-10 — Dự án P-018, scope: `apps/web/src/app/app/**` (customer), trọng tâm là màn Assistant `/app` trong ảnh chụp.

## 1. Chẩn đoán nhanh từ ảnh chụp + code hiện tại

Layout hiện tại là 3 cột cùng lúc: sidebar trái 240px + cột chat giữa + rail phải 280px. Trên màn hình 1440px thì cột chat chỉ còn khoảng 500-600px nên card chuyến xe bị bóp, chữ 15px chen chúc, giá 139.000đ không nổi bật. Rail phải lặp lại đúng thông tin đã có ở giữa (chuyến xe, chờ xác nhận, hủy chuyến) nên gây nhiễu.

Câu trả lời agent xấu vì mỗi loại card (ride, food, restaurant, healthcare) tự vẽ kiểu riêng, lẫn lộn CSS file và inline style (ví dụ `JourneyTimeline` và banner proactive trong `chat-dashboard.tsx` viết style trực tiếp trong JSX). Kết quả là hierarchy lộn xộn: eyebrow chữ hoa tràn lan, headline gradient tím-hồng, badge, pill, nút primary/secondary không nhất quán.

Responsive chưa đạt vì breakpoint xử lý bằng JS (`isMobile` 1040px và 820px) + set `gridTemplateColumns` inline, thanh resize chỉ kéo được bằng chuột, không dùng được cảm ứng. Mobile có cả header trên lẫn bottom-nav dưới nên composer bị kẹp, chưa tính safe-area, feed padding 24-36px quá rộng trên điện thoại.

Font chữ hiện tại là Be Vietnam Pro — lựa chọn đúng vì hỗ trợ dấu tiếng Việt tốt — nhưng scale đang quá nhỏ (base 15px, micro 11.5px), line-height chặt, letter-spacing âm mạnh ở heading khiến tiếng Việt có dấu bị rối.

## 2. Concept thiết kế đề xuất: "Concierge yên tĩnh"

Giữ Be Vietnam Pro, bỏ gradient trang trí, lấy một điểm nhấn duy nhất là thẻ dịch vụ rõ ràng. Toàn bộ app dùng một nền giấy `#F6F7F9`, một mặt thẻ trắng, một màu chàm `#4F46E5` cho hành động chính. Rail phải không còn là cột thường trực mà chỉ xuất hiện khi có việc đang xử lý, còn lại nhường toàn bộ chiều rộng cho cuộc trò chuyện. Mobile-first: một cột, chat rộng tối đa 760px căn giữa, các thao tác quan trọng luôn chạm được bằng ngón cái.

Tokens mới đề xuất: nền `paper #F6F7F9`, mặt `card #FFFFFF`, mực `ink #101828`, phụ `muted #667085`, viền `line #E4E7EC`, chính `brand #4F46E5`, thành công `#067647`, nguy hiểm `#D92D20`. Type giữ một họ duy nhất, nâng body lên 16px, tiêu đề card 17-19px, caption tối thiểu 12.5px, line-height body 1.6 để dấu tiếng Việt thoáng. Bo góc 2 mức duy nhất 12px cho card và 999px cho pill, một bóng đổ mềm duy nhất.

## 3. Kiến trúc layout mới (responsive thật)

Desktop rộng trên 1200px: sidebar trái 248px cố định, vùng chat căn giữa max 760px, rail phải 320px dạng nổi tách khỏi nền, chỉ hiện khi có `activeItems`. Không cho resize bằng kéo chuột nữa, thay bằng nút thu gọn, tránh layout nhảy lung tung.

Tablet 768-1199px: sidebar thành icon rail 72px, rail phải thành drawer trượt từ phải khi bấm "Việc đang xử lý". Chat vẫn một cột giữa.

Mobile dưới 768px: bỏ sidebar, chỉ giữ top bar gọn (logo, chuông, avatar) và bottom-nav 4 mục. Rail phải và chi tiết đơn đều thành bottom-sheet kéo lên, cao 85% màn hình. Composer dính đáy, bo tròn, có safe-area, nút gửi 44px dễ bấm. Feed padding còn 16px, bubble full-width, card xếp dọc.

Nguyên tắc: không dùng JS đo `window.innerWidth` để đổi layout nữa, toàn bộ chuyển sang CSS container/grid + media query. Mọi panel trượt đều đóng mở bằng nút và vuốt, có focus trap và phím Esc.

## 4. Thiết kế lại câu trả lời agent

Thay 6 kiểu card rời rạc bằng một hệ `ServiceCard` thống nhất: hàng đầu là icon dịch vụ + tên dịch vụ + trạng thái, tiếp theo là tiêu đề lớn một dòng, lưới facts 2 cột (điểm đón, điểm đến, loại xe, quãng đường), hàng giá chốt bên phải to rõ, cuối cùng là một nút chính duy nhất và một nút ghost phụ. Bỏ banner proactive viết inline style, thay bằng một gợi ý hàng ngang cuộn được dưới ô nhập. Bỏ timeline nhiều pill màu mè, thay bằng thanh tiến trình 3 bước gọn. Tin nhắn user là bong bóng chàm đặc, tin nhắn assistant là thẻ trắng viền nhạt, không dùng gradient chữ. Mọi giá tiền, giờ giấc format qua `lib/presentation` đã có, không format lẻ trong component.

## 5. Lộ trình triển khai

Giai đoạn 1 là tokens và type: gom toàn bộ màu, font, spacing rời rạc trong `globals.css`, `assistant.css`, `product.css`, `shared.css` về một file tokens, xóa toàn bộ inline style trong `chat-dashboard.tsx` và `WorkflowCards.tsx`, nâng base lên 16px.

Giai đoạn 2 là AppShell: viết lại `app-shell.tsx` thành sidebar cố định + top bar + bottom nav, bỏ resize chuột, bỏ đo JS, chuyển rail phải thành drawer.

Giai đoạn 3 là Chat: viết lại `chat-dashboard.tsx` thành một cột 760px, welcome state một hàng gợi ý cuộn ngang thay vì lưới 2x2 chật, composer mới với trạng thái vị trí và lỗi rõ ràng.

Giai đoạn 4 là ServiceCard: gom `WorkflowCards.tsx`, `CollapsibleAgentCard.tsx`, `context-rail.tsx` thành một bộ card chung cho 4 dịch vụ, một dialog chi tiết dùng chung, một nút hủy dùng chung.

Giai đoạn 5 là responsive và polish: kiểm tra ở 390px, 768px, 1024px, 1440px, kiểm tra bàn phím, giảm chuyển động, tương phản màu, test e2e luồng đặt xe VinUni đi Hồ Gươm như trong ảnh.

## 6. Tiêu chí nghiệm thu

Trên điện thoại 390px không còn cuộn ngang, không còn 3 cột chen nhau, nút gửi và hủy luôn bấm được. Trên desktop card chuyến xe chỉ xuất hiện một lần ở giữa, rail phải chỉ hiện khi có việc thật. Toàn bộ chữ tiếng Việt đọc rõ ở 16px, không còn chữ 11.5px. Không còn inline style trong code chat, không còn đo layout bằng JS.
