# Trạng Thái Dự Án (Project Status)

Tài liệu này tổng kết các mốc nghiệm thu và trạng thái thực tế của dự án X-One.

## Ảnh Chụp Nghiệm Thu Gate G2 - 2026-08-16

- Thiết lập Docker/setup và hồ sơ tài liệu chuẩn tắc đã được chuẩn hóa và tăng cường: thiết lập mặc định lập kế hoạch tất định offline cho Agent, cấu hình Gemini tùy chọn, chuẩn hóa ngữ nghĩa cổng host/container của Gateway, bổ sung ánh xạ Geoapify tùy chọn và cổng dịch vụ Python có thể cấu hình linh hoạt.
- Bản giao nộp kiến trúc chi tiết nằm trong `docs/`; toàn bộ giao thức đánh giá, bộ chạy và kết quả được lưu trữ tại thư mục gốc `eval/`.
- Kiểm tra tĩnh, render Compose, tính tương đồng migration, Docker build, healthcheck trực tiếp, migration/seed và đánh giá Gateway đều đã chạy thành công. Kết quả Gate G2 thực tế là **PASS_WITH_FINDING (6/7)**; ca E02 trả về phản hồi trung thực `healthcare_no_availability` trong khi assertion kỳ vọng `healthcare_options`. Bằng chứng Gemini đi kèm chẩn đoán an toàn ghi nhận `model_mode=gemini`, khóa đã cấu hình, lệnh gọi model thành công và không cần fallback. Xem thêm [Báo cáo đánh giá chuẩn tắc](../../eval/results/gate-g2-mvp-eval.md).

## Ảnh Chụp Hoàn Thành Sản Phẩm Cục Bộ - 2026-08-13

- Phạm vi runtime cục bộ Giai đoạn 1-9: **PASS**. Các cổng kiểm tra HTTP và trình duyệt chuyên biệt đã được thực thi đối chiếu với PostgreSQL, Gateway và các domain service thực tế.
- Giai đoạn 11 Product/Ops: **PASS** cho thông báo, yêu thích, phản hồi, đặt lại (reorder/book-again), hỗ trợ, Admin, độ tươi mới của dataset và sức khỏe hệ thống.
- Nghiệm thu trình duyệt cục bộ: **PASS**. Playwright Chromium đạt 27/27 kịch bản ở các kích thước 375x812, 768x1024 và 1440x1000; các suite Product trực tiếp 2/2, Admin 1/1 và luồng giao dịch thực tế 1/1 đạt với các bộ lắng nghe lỗi trình duyệt.
- Runtime cục bộ trực tiếp: Toàn bộ 7 kiểm tra sức khỏe ứng dụng đều đạt; công cụ seed bổ sung và reset dry-run đã được thực thi mà không xóa danh mục hay volume của PostgreSQL.
- Gemini smoke: **BLOCKED** khi không có khóa được cấu hình; tuyệt đối không có khóa nào bị đọc hay in ra ngoài.

Ma trận triển khai chuẩn tắc có dẫn chứng đầy đủ được lưu giữ tại [Trạng thái kiến trúc hiện tại](../02-architecture/current-state.md).

## Ảnh Chụp Rà Soát Sửa Lỗi Lịch Sử — 2026-08-12

- Triển khai Giai đoạn 1–9: **PASS** cho các yêu cầu phi trình duyệt trong `work.md`.
- Nghiệm thu tự động phi trình duyệt: **PASS**. Các kiểm tra Gateway, Web, Agent, domain, hợp đồng, migration, DataOps, Compose và Gateway HTTP trực tiếp đều đạt.
- Bộ test Playwright: **IMPLEMENTED** (27 test: 9 kịch bản × 3 viewport).
- Thực thi trình duyệt lúc đó: **BLOCKED_BY_ENVIRONMENT** do thiếu tệp thực thi Chromium trong môi trường cũ; đã được giải quyết và nghiệm thu hoàn tất vào ngày 2026-08-13.
- Gemini smoke: **BLOCKED** do chưa cấu hình khóa trong môi trường.

Chi tiết bằng chứng và các giới hạn hiện tại được duy trì trong [Trạng thái kiến trúc hiện tại](../02-architecture/current-state.md) và [Chiến lược kiểm thử](../05-development/testing-strategy.md).
