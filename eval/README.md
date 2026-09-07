# Đánh Giá Nghiệm Thu Gate G2 (Gate G2 Evaluation)

Thư mục này là vị trí lưu trữ bằng chứng chuẩn tắc cho đợt đánh giá MVP Gate G2 quy mô gọn. Đây không phải là benchmark hiệu năng môi trường production và tuyệt đối không sử dụng các tuyên bố độ chính xác, mức độ hài lòng hay độ trễ giả mạo.

- [Các ca kiểm thử thủ công (Manual cases)](manual-cases.md): Định nghĩa 7 kịch bản sản phẩm và an toàn.
- [Báo cáo kết quả (Result report)](results/gate-g2-mvp-eval.md): Ghi lại trạng thái của lần kiểm toán hiện tại và liên kết tới kết quả máy đã làm sạch.
- `eval/gate_g2_mvp.py`: Bộ chạy các kịch bản qua API Gateway công khai và chỉ xuất ra các tóm tắt an toàn cho người dùng.
- `eval/core_agent_deterministic.py`: Báo cáo độ tương thích tổng hợp và độ trễ p95 trên 200 ca giả lập có sẵn. Script này không in prompt thô và không được tính là bộ phát hành được hỗ trợ bởi provider thực tế.
- `eval/core_agent_provider_release.py`: Chạy bộ 20 ca có phiên bản hai lần tại ranh giới Agent dạng typed và áp dụng các ngưỡng bắt buộc về: sử dụng provider, phân loại/DAG, slot ngữ nghĩa, rủi ro/cổng kiểm soát, fallback và độ trễ p95.
- [Báo cáo khắc phục Core Agent](results/core-agent-remediation-2026-08-20.md): Ghi lại các cổng kiểm soát tất định, hợp đồng, bảo mật và các cổng kiểm tra trực tiếp đang bị chặn cho lần rà soát ngày 2026-08-20.

## Điều Kiện Tiên Quyết & Chạy Lại An Toàn

1. Khởi động stack bằng [Hướng dẫn phát triển cục bộ](../docs/development/local-development.md). Mẫu cấu hình mặc định chạy bộ lập kế hoạch tất định; hợp lệ cho 7 kịch bản sản phẩm/an toàn nhưng không phải là bằng chứng LLM thực tế.
2. Thiết lập thông tin tài khoản demo cục bộ vào biến môi trường của tiến trình. Không đưa thông tin tài khoản vào nhật ký lệnh, báo cáo hoặc artifact kết quả.
3. Chạy bộ kiểm thử qua ranh giới công khai:

   ```powershell
   $env:E2E_GATEWAY_URL = 'http://localhost:3000'
   $env:E2E_DEMO_EMAIL = '<local demo email>'
   $env:E2E_DEMO_PASSWORD = '<local demo password>'
   python eval/gate_g2_mvp.py
   ```

4. Đối với lần chạy thử nghiệm với Gemini thực tế: Đặt API key trong tệp riêng tư `.env` ở thư mục gốc, đặt `AGENT_MODEL_MODE=gemini` và khởi động lại Agent. Xác minh trạng thái nội bộ của Agent từ mạng Compose mà không in token nội bộ, chỉ ghi lại các trường an toàn: `model_mode`, `api_key_configured`, `last_model_used`, `fallback_used`, và `last_model_call_status`. Một ca kiểm thử chỉ được tính là bằng chứng LLM thực tế khi kết quả công khai đi kèm `decision_source=model` hoặc chẩn đoán an toàn tương đương chứng minh lệnh gọi mô hình thành công mà không cần fallback.

5. Chạy bộ 20 ca kiểm thử lặp lại với nhà cung cấp:

   ```powershell
   $env:E2E_AGENT_URL = 'http://localhost:8100'
   $env:E2E_INTERNAL_SERVICE_TOKEN = '<private local internal token>'
   python eval/core_agent_provider_release.py --repetitions 2
   ```

Gateway công khai chủ động ẩn các thông tin chẩn đoán của planner; không thêm các trường chỉ dùng để debug vào phản hồi công khai chỉ vì mục đích đánh giá. Tuyệt đối không ghi lại token, cookie, khóa API, prompt thô, phản hồi thô từ provider, ID nội bộ hay suy nghĩ ẩn (chain of thought). Nếu Docker/stack hoặc API key của Gemini không khả dụng, hãy báo cáo trung thực là `BLOCKED` hoặc `BLOCKED_REAL_LLM` và giữ nguyên lệnh chạy lại thay vì tự tạo kết quả giả.
