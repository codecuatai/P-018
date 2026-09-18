# Hệ Thống Chuyển Động X-One (Motion System)

Chuyển động (Motion) trong X-One có vai trò làm rõ thứ bậc thông tin, mối quan hệ giữa các thành phần và trạng thái hệ thống. Chuyển động tuyệt đối không được làm chậm trễ tác vụ của người dùng, không tạo cảm giác một hành động đã hoàn tất khi thực tế chưa xong, và không biến X-One thành một màn trình diễn sân khấu màu mè.

## Hai Khái Niệm Chuyển Động Trên Trang Landing

### 1. Xuất Hiện Theo Vị Trí Cuộn (Scroll-Triggered Entrance)

- `RevealScene` quản lý sự xuất hiện của từng section.
- `RevealItem` quản lý thứ tự xuất hiện nội dung cục bộ cho tiêu đề, hình ảnh dịch vụ, các bước hướng dẫn, đoạn văn bản và phương tiện truyền thông.
- Cả hai mặc định chạy một lần (one-shot) để đảm bảo an toàn. Khi cần, cờ `replayOnReenter={true}` có thể được bật để hiệu ứng thoát êm dịu và phát lại khi cuộn trở lại viewport.
- Trước khi một phân cảnh tiến vào viewport, nó có thể ở trạng thái `opacity: 0`, `y: 18–30px` và `scale: 0.985–0.995`; trạng thái này không dùng làm độ mờ vĩnh viễn lúc tải trang.
- Khi phân cảnh chạm viewport, nó xuất hiện với đường cong gia tốc mượt mà (ease-out) trong khoảng 450–650ms. Sử dụng `whileInView`/`useInView` với `viewport={{ once: !replayOnReenter, amount: 0.15–0.25 }}` và root margin hợp lý.
- Các mục con xuất hiện so le (stagger) cách nhau 70–100ms.
- Chỉ sử dụng thuộc tính `transform` và `opacity`. Tuyệt đối không liên tục animate các thuộc tính `width`, `height`, `top`, `left`, `blur`, `shadow` hoặc `background-position`.

### 2. Tiêu Điểm Liên Kết Cuộn Trang (Scroll-Linked Focus & Exit)

`ScrollFocusScene` được áp dụng sau khi phân cảnh đã xuất hiện hoàn tất. Nó ánh xạ tiến trình cuộn của section qua Motion value để tạo độ sâu tiêu điểm tinh tế:

```text
progress: [0,    0.22, 0.5, 0.78, 1]
opacity:  [0.62, 0.82, 1,   0.82, 0.62]
scale:    [0.985,0.995,1,   0.995,0.985]
y:        [16,   6,    0,   -8,   -16]
```

Trung tâm của phân cảnh luôn đạt độ rõ nét 100%. Khi rời tiêu điểm, độ nhấn giảm nhẹ về khoảng 0.62–0.82 và độ lệch vị trí không quá vài pixel. Không có state của React nào bị cập nhật liên tục trên từng khung hình cuộn.

## Bộ Từ Vựng Hiệu Ứng Cơ Sở (Primitive Vocabulary)

Chỉ sử dụng: `fade`, `fade-up`, `scale-in`, `stagger`, `line-draw`, `soft-hover` và `scroll-progress` có tiết chế.
- Di chuyển khi hover giữ ở mức 2–4px hoặc độ phóng đại tối đa 1.01.
- Các card không bay bổng hay trôi nổi liên tục.
- Video hero chuyển mờ (crossfade) sang poster trong khoảng 420ms cuối cùng, giữ poster khoảng 2 giây sau khi kết thúc, sau đó khởi động lại từ giây thứ 0 và chỉ chuyển mờ trở lại video sau khi sự kiện `playing` kích hoạt.
- Preview cách hoạt động tự động chuyển sau mỗi ~2.2 giây, dừng lại khi rê chuột/focus, khi tab bị ẩn hoặc khi rời khỏi viewport.

| Ngữ cảnh | Thời lượng | Mục đích |
| --- | ---: | --- |
| **Phản hồi vi mô (Micro feedback)** | 120–180ms | Focus, biểu tượng, xác nhận thao tác |
| **Phản hồi nút / card** | 160–240ms | Phản hồi an toàn với con trỏ chuột / bàn phím |
| **Hiển thị nội dung nhỏ** | 280–420ms | Thể hiện mối quan hệ nội dung cục bộ |
| **Xuất hiện section** | 450–650ms | Định hướng thứ tự đọc nội dung |
| **Phân cảnh Hero** | 650–900ms | Định hướng thương hiệu ban đầu |

## Chế Độ Giảm Chuyển Động (Reduced Motion)

Hệ thống tôn trọng thiết lập `prefers-reduced-motion` ở cấp CSS root và trong các client component của Motion. Khi bật chế độ này:
- Hiển thị ảnh poster hero tĩnh thay vì tự động phát video;
- Giữ gợi ý prompt cố định ở một ví dụ, không xoay vòng;
- Vô hiệu hóa mọi hiệu ứng biến đổi vị trí theo cuộn trang, di chuyển so le và vẽ đường nét;
- Hiển thị các section và phần tử con ngay lập tức với 100% opacity và kích thước chuẩn;
- Bảo toàn nguyên vẹn mọi nhãn chức năng, biểu mẫu, trạng thái và ranh giới xác nhận;
- Hiển thị đầy đủ 4 phiến dịch vụ mà không có hiệu ứng nghiêng 3D hay xoay vô tận;
- Hiển thị bản đồ lộ trình Hà Nội với các đường cơ sở cố định, không có vệt sáng chạy lặp lại.

## Rào Chắn Hiệu Năng (Performance Guardrails)

Không cài đặt thêm GSAP, Lenis, Three.js, thư viện hạt (particles), Lottie, Rive hay các trình xử lý cuộn trang cập nhật state React trên từng frame. Các hiệu ứng chuyển động vô hạn của dịch vụ/bản đồ bắt buộc phải tạm dừng khi nằm ngoài viewport màn hình.
