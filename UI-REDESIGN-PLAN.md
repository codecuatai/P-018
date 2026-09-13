# Plan Thiết Kế Lại Giao Diện X-One — Auth + 4 Role

Ngày: 2026-09-12
Phạm vi: Đăng ký / Đăng nhập (dialog + trang auth) → Customer (`/app`) → Provider (`/app/provider`) → Manager / Admin (`/admin`) + Onboarding (`/app/onboarding`)
Ngoài phạm vi: backend, API, Gateway, Agent logic. Chỉ chạm UI/CSS/component trình bày.

---

## 1. Audit hiện trạng (đã đọc code thật)

**Đang có gì tốt — giữ lại:**
- Luồng phân quyền rõ: `GuestOnly` / `RequireAuth` / `OnboardingGate` / `RequireProvider` / `RequireAdmin` trong `features/auth/route-boundaries.tsx`; AuthDialog tự điều hướng theo role (`auth-dialog.tsx` → `/app`, `/app/provider`, `/admin`, `/app/onboarding`).
- Token chữ + màu đã chuẩn hóa trong `app/globals.css`: 1 họ chữ Be Vietnam Pro (hợp tiếng Việt có dấu), scale fluid, spacing 4px, màu nền `#F6F7F9`, primary indigo `#4F46E5`.
- Auth đã có bản Clean Glass (`styles/auth.css`): panel motif tối + card kính, field có icon dẫn, segmented control Cá nhân/Đối tác, provider chọn lĩnh vực Di chuyển / Ẩm thực / Y tế theo tone màu riêng.
- Customer là chat concierge (`features/assistant/chat-dashboard.tsx` + `assistant-page.tsx`): composer auto-resize, ContextRail gập mở, Composer đã fix ở zoom 100% (task #41–#43) — **không được phá layout này**.
- Provider có 5 tab (`provider-portal.tsx`): ride / food / health / services / mcp, badge đếm đơn, subtab segmented.
- Admin có 6 nhóm tab gộp (`admin-tabs.ts`): Tổng quan & Sức khỏe, Người dùng & Phân quyền, Giao dịch & Vận hành, AI Engine & API Keys, Hỗ trợ & Đánh giá, System Logs & Audit. Manager ẩn nhóm AI Engine — điểm khác biệt duy nhất hiện tại.

**Điểm yếu nhìn thấy:**
1. Auth dialog và auth pages chia sẻ `LoginForm/RegisterForm` nhưng hero trong dialog (`auth-dialog.module.css`) và motif trong trang (`auth.css`) là hai ngôn ngữ khác nhau — người dùng thấy 2 bộ mặt.
2. Landing (`landing-page.tsx`) kể chuyện tốt nhưng header + auth dialog chưa cùng nhịp (copy, badge "4 dịch vụ / 1 app" lặp mà không dẫn hành động).
3. Customer chat đúng chức năng nhưng cá tính mờ: vẫn là khung chat chung chung, chưa toát "một yêu cầu, nhiều việc được kết nối".
4. Provider portal dùng lại class `admin-nav-btn` của admin — nhìn như bản sao admin, mất cảm giác "cửa hàng của tôi".
5. Admin/Manager quá dày (6 nhóm, mỗi nhóm nhiều subtab + section dài). Manager chỉ bị ẩn 1 tab nên chưa có bản sắc "người điều hành ca trực".
6. Motion rải rác (dialog scale, hover lift mọi card, spinner) thay vì một khoảnh khắc chủ đạo.

---

## 2. Ý tưởng chủ đạo: "Một dòng sông, bốn bến đỗ"

X-One là trợ lý Việt Nam nối xe – món ăn – khám bệnh – AI trong một cuộc hội thoại. Hình ảnh dẫn đường: **dòng yêu cầu chảy một mạch, mỗi role là một bến đỗ khác nhau trên cùng dòng sông đó**.

- Auth = bến lên thuyền: nhanh, chắc chắn, nói rõ "lên rồi đi đâu".
- Customer = dòng sông: hội thoại chảy dọc, các việc (xe, món, hẹn khám) nổi lên như cụm công việc, không phải list card đều nhau.
- Provider = bến hàng của chủ quán/tài xế/bác sĩ: mùi cửa hàng riêng, số liệu hôm nay đập vào mắt trước.
- Manager = đài quan sát ca trực: chỉ thấy cái cần xử lý hôm nay.
- Admin = phòng máy: đầy đủ, sâu, chấp nhận mật độ cao.

Một khoảnh khắc motion duy nhất cho toàn app: **đăng nhập xong, màn hình đích "thở ra" một lần** (fade + nâng nhẹ 8px, 400ms, không lặp lại) — thay vì hover lift khắp nơi.

---

## 3. Hệ token (giữ khung, đổi sắc thái)

**Màu — 6 cái tên, dùng đúng việc:**
- `Giấy dó` `#F6F7F9` — nền app (giữ nguyên, đỡ chói khi đọc tiếng Việt dài).
- `Mực tàu` `#101828` — chữ chính (giữ).
- `Chàm Hội An` `#4F46E5` — hành động chính duy nhất (đăng nhập, gửi, xác nhận). Không dùng cho trang trí.
- `Vôi Huế` `#FFFFFF` — mặt thẻ (giữ).
- `Phù sa` `#EA580C` — chỉ dùng cho điểm nhấn "đang sống": đơn đang chạy, cuốc xe đang đến, số tiền hôm nay của provider.
- `Rêu` `#059669` — chỉ dùng cho trạng thái đã xong / đã xác nhận / sức khỏe tốt.

Đất (`#0284C7` xe), Gạch (`#E11D48` món), Rêu (y tế) chỉ xuất hiện **bên trong** cụm công việc của đúng dịch vụ đó, không nhuộm toàn màn hình. Xóa gradient tím-xanh trang trí ở auth motif cũ; thay bằng panel mực sâu phẳng với một vệt sáng duy nhất.

**Chữ — một họ, ba vai:**
- Be Vietnam Pro giữ nguyên (đúng đắn cho dấu tiếng Việt).
- Vai 1 Tiêu đề: 700–800, tracking −0.02em, chỉ dùng cho tên màn hình + số tiền/số đơn.
- Vai 2 Thân: 400–500/1.6, đoạn ngắn dưới 80 ký tự/dòng.
- Vai 3 Ghi chú: 500/13px cho nhãn trạng thái, viết câu thường, **không all-caps hàng loạt** (chỉ giữ all-caps cho đúng 1 nhãn "X-One" và mã lỗi 403).

**Bố cục — mỗi bến một dáng:**
- Auth: chia đôi bất đối xứng — bên trái kể 3 việc làm được (xe, món, khám) bằng câu đầy đủ; bên phải form ngắn, một cột, nút chính full-width.
- Customer: một cột hội thoại rộng tối đa 760px ở giữa, ContextRail là dải phụ bên phải gập được, composer luôn dính đáy trong luồng (giữ fix zoom 100%).
- Provider: đầu trang là "Hôm nay" (doanh thu, đơn mới, việc cần tay), dưới mới là tab vận hành.
- Manager: một hàng "Cần xử lý" + hàng "Đang theo dõi", còn lại thu gọn.
- Admin: giữ mật độ, nhưng mỗi section có đúng một tiêu đề + một câu mô tả việc, nút hành động đặt cùng phía phải.

**Nguyên tắc tự soi trước khi code:**
- Không cắt mọi thứ thành card bo góc giống nhau với cùng một bóng đổ.
- Không gắn `→` vào mọi link/nút, không nối nhãn bằng `·`.
- Không đánh số 01/02/03 trừ đúng quy trình có thứ tự (luồng Hỏi → Xác nhận → Xong).
- Chữ Việt kiểm dấu kỹ: ư/ơ/đ/ệ/ỗ, không viết tắt kiểu "Đ.hàng".

---

## 4. Thiết kế từng màn hình

### 4.1 Đăng nhập / Đăng ký (dialog + trang)

**Vấn đề hiện tại:** dialog hero và trang auth motif là hai phong cách; form đăng ký đối tác dài, dễ ngợp.

**Thiết kế mới:**
- Thống nhất một hero duy nhất dùng chung cho dialog và trang: panel phẳng mực sâu, logo + câu "Một tài khoản, xong cả xe, món và lịch khám." + 3 dòng dịch vụ viết câu đầy đủ (không badge rời rạc).
- Dialog Đăng nhập: Google button → divider "Hoặc" → email + mật khẩu (hiện/ẩn) → link quên mật khẩu đặt phải → nút Chàm full-width → dòng chuyển đăng ký. Bỏ list 4 dịch vụ trong dialog login để form thở.
- Dialog Đăng ký: segmented Cá nhân/Đối tác giữ lại (đang tốt). Nhánh Đối tác gom thành 3 bước thấy được: 1) Chọn lĩnh vực (3 ô Di chuyển/Ẩm thực/Y tế) 2) Tên thương hiệu + SĐT 3) Họ tên + email + mật khẩu. Mỗi bước có tiêu đề nhỏ, không nhồi một trang dài.
- Trang `/forgot-password`, `/reset-password` (dùng `AuthLayout` + `AuthCard`): cùng hero rút gọn, form một việc một trang, thông báo thành công nói rõ bước tiếp ("Mở email, bấm liên kết, quay lại đăng nhập").
- Copy tiếng Việt viết lại: "Chưa có tài khoản? Tạo tài khoản" → "Lần đầu đến X-One? Tạo tài khoản miễn phí". Lỗi giữ nguyên kỹ thuật nhưng thêm cách sửa ("Sai mật khẩu. Thử lại hoặc đặt lại qua email.").

**ASCII:**
```
+-----------------------------------------------+
| [X-One  Một tài khoản...] | Email ________   |
|  Xe — đặt xe trong 1 chạm | Mật khẩu ______ |
|  Món — quán chuẩn vị gần  | [ Đăng nhập ]   |
|  Khám — bác sĩ tận tâm    | Quên mật khẩu?  |
+-----------------------------------------------+
```

**File chạm:** `features/auth/auth-pages.tsx`, `components/marketing/auth-dialog.tsx`, `auth-dialog.module.css`, `styles/auth.css`, `components/auth/auth-layout.tsx`. Không đổi `marketing-auth.tsx` (logic mở dialog/nextPath giữ).

### 4.2 Customer `/app` (trọng tâm — giữ fix zoom 100%)

**Vấn đề:** chat đúng nhưng nhạt; ContextRail và feed chưa phân tầng "việc đang sống" vs "lịch sử".

**Thiết kế mới:**
- Giữ nguyên khung `.app-shell > .app-body > .assistant-layout > .chat-column` đã fix (grid `minmax(0,1fr)`, composer in-flow). Chỉ đổi da, không đổi xương.
- Feed chia 3 nhịp thị giác: tin nhắn thường (nền giấy, chữ mực), cụm công việc (thẻ trắng viền trái màu dịch vụ + nút Xác nhận Chàm duy nhất), việc đã xong (thu gọn, dấu Rêu, chữ nhỏ).
- Composer: ô nhập trắng viền 1.5px, focus ring Chàm mờ; nút gửi là hình tròn Chàm, icon mũi tên lên; voice + định vị đặt trong, không phô ra ngoài. Placeholder gợi việc thật: "Nhờ X-One đặt xe 8h sáng mai ra sân bay…".
- Sidebar Gần đây: mỗi dòng có chấm Phù sa nếu việc còn sống, chữ mờ nếu xong; ô tìm kiếm hội thoại lên đầu.
- ContextRail: đổi tên hiển thị thành "Việc đang chạy" / "Xong rồi", card việc có đúng một nút hành động.
- Empty state lần đầu: không list tính năng; một câu hỏi mở + 3 gợi ý viết như lời người ("Đặt xe đi sân bay sáng mai", "Tìm quán phở gần đây", "Đặt lịch khám da liễu cuối tuần").

**File chạm:** `features/assistant/chat-dashboard.tsx` (render nhịp + empty state), `styles/assistant.css`, `styles/product.css` (màu/viền, **cấm đổi** grid/flex đã fix), `features/product/context-rail.tsx`.

### 4.3 Provider `/app/provider`

**Vấn đề:** trông như admin thu nhỏ, số liệu chìm.

**Thiết kế mới:**
- Dải "Hôm nay" trên cùng: 3 con số lớn (Doanh thu, Đơn mới, Cần xử lý) + nút chính theo lĩnh vực (Tài xế: "Nhận cuốc", Quán: "Mở/Bếp bận", Bác sĩ: "Mở lịch khám").
- Tab đổi nhãn theo người bán: "Cuốc xe / Món ăn / Lịch khám" thay vì ride/food/health; giữ `services` (món/dịch vụ của tôi) và `mcp` (kết nối). Bỏ class `admin-nav-*` mượn từ admin, vẽ segmented riêng ấm hơn.
- Mỗi đơn là một hàng công việc: tên khách + món/cuốc + giờ + trạng thái một từ (Mới/Đang làm/Xong) + một nút hành động tiếp theo. Không dàn 4 nút đều nhau.
- MCP Keys + webhook gom vào cuối dưới tên "Kết nối", mặc định thu gọn.

**File chạm:** `features/provider/provider-portal.tsx` (dải Hôm nay + nhãn tab + hàng đơn), `styles/product.css` (segmented provider riêng).

### 4.4 Manager + Admin `/admin` (chung khung, khác hồn)

**Vấn đề:** manager chỉ là admin bị ẩn 1 tab.

**Thiết kế mới:**
- Khung 6 nhóm tab giữ (`admin-tabs.ts`), nhưng trang đích theo role khác nhau:
  - Manager mở vào "Ca trực hôm nay": hàng đợi support cần xử lý (ưu tiên cao trước), giao dịch lỗi cần đối soát, sức khỏe service đỏ. Ẩn AI Engine & API Keys (giữ như hiện tại) + thu gọn System Logs.
  - Admin mở vào "Tổng quan" như cũ, đầy đủ 6 nhóm.
- Mỗi section chuẩn: tiêu đề + một câu "làm gì ở đây" + bảng/hàng + nút chính phải. Trạng thái sức khỏe dùng Rêu/Phù sa/đỏ, không chữ all-caps dài.
- Support queue là màn hình được chăm nhất: cột trái hàng đợi, bấm vào mở chi tiết phải, đổi trạng thái ngay tại chỗ.

**File chạm:** `features/admin/admin-dashboard.tsx`, `features/admin/admin-tabs.ts` (`getConsolidatedTabs` + đích mặc định theo role), `features/admin/sections/*`, `features/admin/hooks/use-admin-navigation.ts`.

### 4.5 Onboarding `/app/onboarding` + Landing chạm nhẹ

- Onboarding rút còn 3 bước: Xưng hô (tên) → Nhu cầu (chọn nhiều: đi lại/ăn uống/khám bệnh) → Xong (nút "Bắt đầu nhờ X-One"). Tiến trình hiện bằng thanh mảnh, không số 01/02/03.
- Landing chỉ sửa header + hero note để cùng lời với auth mới; không redesign landing trong đợt này.

---

## 5. Motion, responsive, tiếp cận

- Một khoảnh khắc motion duy nhất: sau đăng nhập, đích fade+nâng 8px/400ms/ease-out một lần. Dialog mở scale 0.97→1/260ms giữ. Còn lại chỉ chuyển màu/viền 150ms. Tôn trọng `prefers-reduced-motion`.
- Responsive giữ breakpoint hiện tại (320/390/768/1024/1440): auth 2 cột → 1 cột dưới 820px; customer rail gập thành nút; provider dải Hôm nay cuộn ngang trên mobile; admin bảng cuộn ngang, bộ lọc thu gọn.
- A11y: tương phản mực trên giấy đạt AA, nút chạm tối thiểu 44px, dialog focus-trap + Esc, feed chat `aria-live`, mọi icon trang trí `aria-hidden`.

---

## 6. Lộ trình làm (đề xuất 5 nhịp, mỗi nhịp verify + push riêng)

1. **Nhịp 1 — Auth:** hero chung + login/register/forgot/reset + copy Việt. File mục 4.1. Xong thì build + typecheck.
2. **Nhịp 2 — Customer:** nhịp feed + composer + empty state + rail nhãn mới. Giữ nguyên grid fix zoom 100%, chụp kiểm ở 100% và 80%.
3. **Nhịp 3 — Provider:** dải Hôm nay + nhãn tab + hàng đơn + segmented riêng.
4. **Nhịp 4 — Manager/Admin:** đích theo role + support queue 2 cột + chuẩn section.
5. **Nhịp 5 — Onboarding + soát:** onboarding 3 bước, soát dấu tiếng Việt toàn app, soát responsive/a11y, commit tổng.

Mỗi nhịp: `npm run build` + `tsc` ở `apps/web`, test liên quan (`auth-pages.test`, `chat-dashboard.test`, `admin-dashboard.test`), rồi commit/push, chờ CI, kiểm tra prod.

---

## 7. Tiêu chí nghiệm thu

- Đăng nhập/đăng ký xong đúng role về đúng bến (`/app`, `/app/provider`, `/admin`, `/app/onboarding`).
- Zoom 100% ở `/app` vẫn thấy composer dính đáy; 320px không tràn ngang.
- Provider đọc được "hôm nay kiếm bao nhiêu, việc gì cần tay" trong 5 giây.
- Manager thấy hàng đợi cần xử lý ngay khi mở `/admin`; admin vẫn đủ 6 nhóm.
- Không còn 2 hero auth khác nhau; không còn class admin rò sang provider.
- CI xanh, prod 200.

---

## 8. Câu hỏi chốt trước khi code (trả lời khi rảnh, không chặn nhịp 1)

1. Manager có cần thấy doanh thu toàn sàn hay chỉ hàng đợi vận hành?
2. Provider có 3 lĩnh vực — dải "Hôm nay" của tài xế vs quán ăn vs bác sĩ có chỉ số nào khác nhau không?
3. Cho phép Google OAuth với tài khoản đối tác luôn, hay giữ như hiện tại (đối tác đăng ký form trước, liên kết Google sau)?
