# Pitch Deck & Demo Materials

## Trạng thái hiện tại

Thư mục này **chỉ chứa file README này**. Chưa có deliverable nào được commit:

| File | Mục đích | Trạng thái |
| --- | --- | --- |
| `pitch_deck.pptx` | Slide thuyết trình Demo Day | ❌ Chưa có trong repo |
| `video_demo.mp4` | Video demo sản phẩm (tối đa 5 phút) | ❌ Chưa có trong repo |

Khi thêm hai file trên, cập nhật bảng này. Lưu ý binary asset lớn: cân nhắc để video ngoài Git (link tới storage) thay vì commit trực tiếp.

## Nguồn nội dung cho slide

Lấy số liệu và kiến trúc từ tài liệu canonical, không tự bịa:

- Trạng thái triển khai thực tế và bằng chứng: [docs/architecture/current-state.md](../docs/architecture/current-state.md)
- Sơ đồ hệ thống: [docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
- Luồng nghiệp vụ để demo: [docs/architecture/workflows.md](../docs/architecture/workflows.md)
- Màn hình web dùng khi quay demo: [docs/ui_wireframe_flow.md](../docs/ui_wireframe_flow.md)

Về phần metrics: [eval/results/report.md](../eval/results/report.md) hiện ghi `not measured` cho accuracy, latency, satisfaction và coverage vì repo chưa có evaluation harness. **Không** đưa con số chưa đo được lên slide Traction.

## Pitch Deck Structure (10 slides)

1. **Title** — Tên dự án + Team
2. **Problem** — Vấn đề là gì? Có bao nhiêu người gặp?
3. **Solution** — Giải pháp AI của bạn
4. **Demo** — Screenshot/Video ngắn
5. **Architecture** — System diagram đơn giản
6. **Tech Stack** — Technologies used
7. **Traction** — Metrics, users, feedback
8. **Market** — Quy mô thị trường
9. **Team** — Ai làm gì
10. **Ask** — Bạn cần gì tiếp theo?

## Video Demo Checklist

- [ ] Giới thiệu problem (< 30 giây)
- [ ] Demo live feature chính (2-3 phút)
- [ ] Hiển thị kết quả AI (1 phút)
- [ ] Tóm tắt impact (< 30 giây)

Trước khi quay: chạy `./scripts/start-all.ps1 -SeedDemo` (hoặc `./scripts/start-all.sh --seed-demo`) để có dữ liệu demo tất định. Demo authentication và sandbox payment chỉ dùng cho development/test — nói rõ điều này nếu nó xuất hiện trong video.
