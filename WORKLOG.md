# Worklog — Team P-018 (VinUni AI20K Cohort 3)

> Ghi lại tất cả công việc đã làm theo ngày của các thành viên trong đội. Đảm bảo minh bạch tiến độ, kết quả công việc và theo dõi sử dụng AI.
>
> Quy ước cột Member: mỗi dòng chỉ dùng một tên người hoặc `Team P-018` cho công việc chung của cả đội.

---

## 2026-08-05

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team P-018 | Tối ưu hóa toàn diện Monorepo, sửa lỗi DB driver, Ruff formatting, cập nhật tài liệu và dọn dẹp file | ✅ Done | Chạy `ruff check --fix` (sửa 122 lỗi) & `ruff format`; fix async DB driver trong `base.py`; fix LangGraph Agent state/nodes; chạy `pytest` 5/5 tests PASSED (0.08s); `npm run build` Vite web PASSED (1.78s); loại bỏ file trùng lặp ở gốc; cập nhật `README.md` & `WORKLOG.md` | 1.5h |

---

## 2026-08-02

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Bổ sung tài liệu Project Build Phase vào `docs/`; ghi nhận AI usage log và đồng bộ nhánh; tạo repo GitHub `uiDemo` để deploy demo Vercel; cập nhật wireframe/UI flow, architecture diagram và chuẩn hóa worklog | ✅ Done | Thêm `docs/Project Build Phase.docx.pdf`; ghi từng prompt thành AI-log; merge work qua `develop` và mở PR #15/#16 vào `main`; tạo repo private `VuVanPhong123/uiDemo`, push riêng `frontend-web` lên nhánh `main`; thêm `docs/ui_wireframe_flow.md`; cập nhật `docs/architecture_diagram.md` đúng với Vite React demo, MockService/localStorage, FastAPI/LangGraph integration path và tài liệu PDF trong `docs/`; gộp các dòng worklog trùng member | 2.4h |
| Trần Văn Tài | Hoàn thiện và tinh chỉnh demo frontend cho agent đặt dịch vụ đa nền tảng | ✅ Done | Cập nhật `frontend-web` thành demo mock có hội thoại tiếng Việt, biên lai đặt xe/đồ ăn/chuyến bay, combo, đổi vé/hoàn tiền, chọn xe đưa đón, nút xác nhận thanh toán và modal thành công; khóa sidebar/topbar, chỉ cho vùng chat scroll; xác minh `npm run build` pass và dev server Vite chạy tại `localhost:5173` | 1.0h |
| Lê Tiến Minh | Hoàn thiện và tinh chỉnh demo frontend cho agent đặt dịch vụ đa nền tảng | ✅ Done | Cập nhật `frontend-web` thành demo mock có hội thoại tiếng Việt, biên lai đặt xe/đồ ăn/chuyến bay, combo, đổi vé/hoàn tiền, chọn xe đưa đón, nút xác nhận thanh toán và modal thành công; khóa sidebar/topbar, chỉ cho vùng chat scroll; xác minh `npm run build` pass và dev server Vite chạy tại `localhost:5173` | 1.0h |
| Team P-018 | Cập nhật worklog cho các thay đổi tài liệu và demo frontend | ✅ Done | `WORKLOG.md` được cập nhật bằng UTF-8 để giữ đúng tiếng Việt có dấu; tài liệu dự án, diagram và UI flow được gom trong `docs/` | 0.3h |

**Tổng kết ngày:** Đã bổ sung tài liệu Project Build Phase, hoàn thiện demo frontend cho agent hỗ trợ đặt nhiều dịch vụ trong một app, kiểm tra build/dev server, tạo repo demo riêng để deploy Vercel và cập nhật tài liệu trong `docs/`. Worklog đã được chuẩn hóa để mỗi dòng chỉ có một member hoặc `Team P-018`, không còn dòng trùng tên trong cùng ngày.

---

## 2026-07-26

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Tiến Minh | Rà soát, kiểm thử tích hợp AI Antigravity CLI và chi tiết hóa `WORKLOG.md` | ✅ Done | Xác nhận hook logging hoạt động ổn định trên Windows PowerShell; cập nhật `WORKLOG.md` chi tiết với mốc lịch sử commit, PR và bảng theo dõi | 1.3h |
| Team P-018 | Kiểm tra liên kết git history, PR #4, trạng thái repo và workflow AI log | ✅ Done | Các branch `main`, `develop` và `test` được đồng bộ; branch `test/verify-ai-log` được tạo để kiểm thử AI usage logging hook và quy trình nộp AI log qua PR vào `develop` | 0.9h |

**Tổng kết ngày:** Đã chi tiết hóa toàn bộ worklog dự án, rà soát lại kết quả tích hợp AI logging script (`scripts/submit_log.py`, `scripts/setup_hooks.ps1`), tạo nhánh test và kiểm tra quy trình nộp AI log qua PR vào `develop`.

### Bổ sung kỹ thuật và bằng chứng

- **Codex CLI hook:** commit `d805095` cập nhật `.codex/hooks.json` và thêm `scripts/log_codex_hook.py`. Hook được khai báo cho cả sự kiện `UserPromptSubmit` và `Stop`; wrapper đọc event từ stdin, chuẩn hóa qua `log_hook.normalize`, ghi vào `.ai-log/session.jsonl` và luôn trả về JSON `{}` để không chặn Codex CLI.
- **Xác minh worklog:** commit `2f4633f` ghi nhận kết quả kiểm tra AI log. Tại thời điểm rà soát, nhánh `test/verify-ai-log` trỏ tới commit này; local `develop` cũng đang chứa commit đó.
- **Độ tin cậy khi nộp log:** `scripts/submit_log.py` gửi tối đa 500 bản ghi mỗi lần, archive bản ghi sau khi gửi thành công và khôi phục batch pending nếu yêu cầu HTTP lỗi, nhằm tránh mất log.
- **Phạm vi test hiện có:** `pytest --collect-only -q` thu thập 5 test (2 test graph agent, 3 test API). Không ghi nhận kết quả pass của toàn bộ suite trong mục này vì lần chạy đầy đủ chưa hoàn tất trong giới hạn thực thi hiện tại.

---

## 2026-07-25

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Tạo branch `test`, cập nhật `WORKLOG.md`, kiểm tra AI usage logging hook và xử lý PR test workflow | ✅ Done | Branch `test` được tạo từ `develop`; `WORKLOG.md` cập nhật; hook pre-push dùng `scripts/submit_log.py`; PR #2 được mở và merge vào `develop` thành công | 1.2h |
| Trần Văn Tài | Đồng bộ nhánh và cập nhật nhật ký dự án ban đầu | ✅ Done | Merge PR #3/#4 để đồng bộ `develop` vào `main`; commit `0ffcd10` bổ sung dữ liệu tuần làm việc trong `JOURNAL.md` | 0.7h |
| Team P-018 | Khởi tạo môi trường phát triển, cấu hình `.env` và cài đặt Git pre-push hook nộp AI log | ✅ Done | Môi trường `.venv` và dependencies từ `requirements.txt` được cài đặt; file `.env` hoàn tất; hook AI log active và verified | 2.0h |

**Tổng kết ngày:** Hoàn tất thiết lập môi trường phát triển, cài đặt AI logging pre-push hook, kiểm thử thành công quy trình tự động ghi log AI usage và xử lý các Pull Request (#1 - #4) để đồng bộ nhánh với `develop`.

---

## 2026-07-23

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Khởi tạo repository dự án từ template AI20K Agent | ✅ Done | Mã nguồn khởi tạo với đầy đủ khung dự án LangGraph, FastAPI và Docker | 1.5h |
| Team P-018 | Thiết lập cấu hình môi trường, AI Logging Hook, CI/CD và bộ khung tài liệu dự án | ✅ Done | Đã cài đặt `.env`, `scripts/setup_hooks.ps1` / `setup_hooks.sh`, cấu hình GitHub Actions, hoàn thiện `README.md`, `ARCHITECTURE.md` và `docs/` | 2.2h |

**Tổng kết ngày:** Đã khởi tạo hoàn chỉnh dự án AI20K Agent Template, cài đặt thành công môi trường phát triển ban đầu, kích hoạt AI Logging Hook và sẵn sàng cho việc thiết kế Agent.

---

## Template Ghi Log Hằng Ngày (Sao chép khi tạo ngày mới)

```markdown
## YYYY-MM-DD

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| [Tên một thành viên] | [Mô tả chi tiết task] | ✅ Done | [Mô tả kết quả/Link file/PR] | 2.0h |
| Team P-018 | [Mô tả công việc chung của đội] | 🔄 WIP | [Tiến độ hiện tại] | 1.5h |
| [Tên một thành viên] | [Mô tả blocker] | ❌ Blocked | [Lý do bị vướng và hướng xử lý] | - |

**Tổng kết ngày:** [1-3 câu tóm tắt thành quả đạt được và định hướng công việc tiếp theo]
```
