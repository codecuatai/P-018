# Nhật Ký Phát Triển Dự Án (Weekly Journal) — Team P-018

> **Mục đích:** Ghi lại tiến độ hàng tuần của dự án X-One: mục tiêu, thành quả đạt được, khó khăn & giải pháp, bài học kinh nghiệm và kế hoạch tiếp theo.

---

## Tuần 1: 23/07/2026 - 26/07/2026

### Mục tiêu tuần này
- [x] Khởi tạo repository dự án từ template AI20K Agent
- [x] Thiết lập môi trường phát triển, cấu hình `.env` và cài Git pre-push hook
- [x] Cài đặt AI usage logging hook và thiết lập quy trình PR giữa `main`/`develop`/`test`
- [x] Chuẩn hóa `WORKLOG.md` và `JOURNAL.md`

### Đã hoàn thành
- Khởi tạo repository từ template, bổ sung tài liệu nền tảng (`README.md`, `docs/`) và khởi tạo journal (`e459dab`, `0ffcd10`).
- Kiểm thử AI log hook trên môi trường Windows PowerShell; sửa lỗi output encoding và hoàn thiện Codex hook logging (`ef2b2e2`, `d805095`).
- Thiết lập môi trường ảo `.venv`, cài đặt dependencies, kích hoạt pre-push hook; tạo nhánh kiểm thử `test/verify-ai-log` (`8e649b9`, `b8f7790`, `229bc27`).
- Chuẩn hóa nhật ký `WORKLOG.md` chi tiết theo ngày, xử lý xung đột và đồng bộ qua các nhánh (`e53ca79`, `b30f0f2`, `ce2cc5f`, `b2f5b04`).
- Đồng bộ nhánh và hoàn tất merge các PR #1–#12 giữa các nhánh `test`, `develop` và `main`.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
| :--- | :--- | :--- |
| AI log hook không chạy đúng trên Windows PowerShell | Chuẩn hóa output windows-safe, sửa Codex hook logging (`ef2b2e2`, `d805095`) | Hook logging hoạt động ổn định và tự động ghi nhận AI usage |
| Xung đột file `WORKLOG.md` khi merge nhiều nhánh song song | Xử lý merge conflict, chuẩn hóa định dạng dòng theo thành viên/Team (`b30f0f2`, `ce2cc5f`) | Worklog ổn định, đồng bộ xuyên suốt qua các nhánh |

### Bài học kinh nghiệm
- Hook AI logging cần được kiểm thử trực tiếp trên môi trường Windows PowerShell trước khi đưa vào luồng git chính.
- Việc cập nhật worklog theo ngày tạo bằng chứng rõ ràng cho từng quyết định kỹ thuật của nhóm.

---

## Tuần 2: 27/07/2026 - 02/08/2026

### Mục tiêu tuần này
- [x] Xây dựng bản demo frontend mock NaviGo cho agent đặt dịch vụ đa nền tảng
- [x] Bổ sung tài liệu Project Build Phase, luồng UI wireframe và sơ đồ kiến trúc
- [x] Refactor codebase ban đầu và đảm bảo tính tương thích của bộ test pytest

### Đã hoàn thành
- Khắc phục Gemini hook logging; bổ sung cơ chế fallback lưu trữ SQLite cho `log_antigravity.py` (`67a8198`, `4a8ede1`).
- Bổ sung ứng dụng React web frontend, cập nhật giao diện hiện đại NaviGo và cải thiện luồng tương tác demo (`a929f30`, `ff3d2d3`, `c575735`, `a5d0c8c`).
- Hoàn thiện tài liệu Project Build Phase, sơ đồ luồng [docs/ui_wireframe_flow.md](docs/ui_wireframe_flow.md), sơ đồ kiến trúc [docs/architecture_diagram.md](docs/architecture_diagram.md) (`83df9f7`, `f75012c`, `4a92dad`).
- Tinh chỉnh codebase và cập nhật cấu hình pytest conftest tương thích với `langchain.debug` (`887fa1b`, `bfa2ca0`).
- Hoàn tất đồng bộ nhánh `feature/demoUI` và merge các PR #13–#24 vào `develop`.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
| :--- | :--- | :--- |
| Xung đột khi merge giao diện `feature/demoUI` vào nhánh `develop` | Merge giải quyết xung đột thủ công, đồng bộ lại từ `develop` (`cd787aa`) | Tích hợp giao diện demo hoàn chỉnh, không làm mất code |
| Kiểm thử gặp lỗi không tương thích với `langchain.debug` | Cập nhật cấu hình trong pytest conftest (`bfa2ca0`) | Toàn bộ test suite chạy ổn định sau khi tái cấu trúc |

### Bài học kinh nghiệm
- Tài liệu kiến trúc và giao diện cần được cập nhật đồng thời với code để tránh tình trạng tài liệu đi sau sản phẩm.
- Mọi đợt tái cấu trúc mã nguồn phải đi kèm với việc cập nhật bộ kiểm thử tương ứng.

---

## Tuần 3: 03/08/2026 - 09/08/2026

### Mục tiêu tuần này
- [x] Tái cấu trúc repository sang kiến trúc Backend-First Microservices
- [x] Xây dựng các domain service độc lập: Food, Ride, Restaurant, Healthcare và NestJS Gateway
- [x] Hoàn tất tích hợp 4 domain dịch vụ tại môi trường local

### Đã hoàn thành
- Tái cấu trúc Backend-First: tách FastAPI Agent, xây dựng bộ khung NestJS API Gateway cùng các domain service skeleton, thiết lập Docker Compose/PostgreSQL và bộ quy tắc [AGENTS.md](AGENTS.md) (`83aa797`, `a32a7ff`).
- Phát triển module đặt lịch khám bệnh (Medical/Healthcare) kèm WebSocket, chuyển backend sang chế độ sandbox an toàn (`dcfa4fc`, `187f800`, `b5903e4`).
- Loại bỏ hoàn toàn mock data, kết nối các endpoint backend thật, đồng bộ giao diện Dark Theme; hoàn thiện workflow đặt bàn nhà hàng (`3f0a7b7`, `de0d40b`, `e35843c`).
- Xây dựng Ride Service, tích hợp Gateway client cho Ride và nâng cấp Food Service (`1318b65`, `78e2101`, `b2d61ea`).
- Hoàn thiện tích hợp 4 domain tại local, cập nhật tài liệu kỹ thuật và giải quyết xung đột (`f5c85a0`, `8bb214f`, `d4fdb8d`).

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
| :--- | :--- | :--- |
| Module Ride chưa ổn định, bị lỗi sau merge | Tạm revert PR #26 rồi phát triển kiểm thử lại trong nhánh riêng (`9dc5034`, `1318b65`) | Ride Service được tích hợp lại sạch sẽ, đúng kiến trúc |
| Quá nhiều nhánh tính năng chạy song song gây xung đột tích hợp | Gom merge từng nhánh vào nhánh tích hợp `codex/p018-integration` trước khi đưa vào `develop` (`7ea1622`, `02757ec`, `7135d62`) | Tích hợp thành công 4 dịch vụ độc lập mà không bị đè code |

### Bài học kinh nghiệm
- Khi tái cấu trúc kiến trúc lớn, việc thiết lập tài liệu ranh giới dịch vụ (`service-boundaries.md`) ngay từ đầu giúp các thành viên không viết code chéo domain.
- Tích hợp qua nhánh staging/integration trung gian giảm thiểu tối đa rủi ro hỏng nhánh `develop`.

---

## Tuần 4: 10/08/2026 - 16/08/2026

### Mục tiêu tuần này
- [x] Xây dựng Web App Router với Next.js, trang Landing Page và hệ thống Auth
- [x] Nâng cấp hệ thống CI/CD, bộ lọc thay đổi theo đường dẫn, matrix test và caching
- [x] Hoàn thiện vòng đời dịch vụ Ride, mô phỏng định tuyến/tracking, Agent hội thoại nhiều lượt và bản Demo MVP 4 dịch vụ

### Đã hoàn thành
- Xây dựng giao diện Next.js App Router v1, Hero section ấn tượng, tối ưu assets đồ họa (`f7b31b3`, `04c3a72`, `e60a125`).
- Nâng cấp CI/CD: thiết lập path filtering, matrix test, bộ nhớ đệm cache dependencies, chống xung đột port PostgreSQL (`a7eff83`, `d8ae480`, `599c45a`, `36e9593`, `c2f3e6a`).
- Tối ưu hiệu năng: chuyển tác vụ phân tích truy vấn Gemini sang tầng Application Service (`a232042`).
- Sửa lỗi Agent hội thoại nhiều lượt (multiturn), duy trì trạng thái tài nguyên đang xử lý; nạp dữ liệu catalog dịch vụ thật tại Hà Nội (`3a30434`, `d4f0127`, `5872295`, `6af0c39`).
- Gateway bổ sung tầng thẩm định kết quả từ Agent, gia cố bảo mật public API; mô phỏng di chuyển tài xế mượt mà (`46fecbf`, `ab95357`).
- Bổ sung ứng dụng di động React Native skeleton; hoàn thiện hồ sơ đánh giá Gate G2 (`4a74bab`, `573ae3b`, `055aa59`, `806e13a`, `4657910`).

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
| :--- | :--- | :--- |
| Test Python chạy chậm và nghẽn CPU | Tối ưu ma trận kiểm thử song song (matrix strategy) trong CI (`599c45a`, `90a31e8`) | Thời gian chạy pipeline giảm đáng kể |
| Xung đột cổng PostgreSQL khi nhiều container test chạy cùng lúc | Cấp phát cổng ngẫu nhiên cho dịch vụ CSDL test (`c2f3e6a`) | Triệt tiêu hoàn toàn lỗi va chạm port |
| Agent bị mất ngữ cảnh tài nguyên khi hỏi tiếp ở lượt sau | Sửa đổi luồng lưu trữ multiturn action cohort và active-state (`3a30434`, `0611b22`) | Hội thoại nhiều lượt liền mạch, chính xác |

---

## Tuần 5: 17/08/2026 - 23/08/2026

### Mục tiêu tuần này
- [x] Nâng cấp Agent: lưu trữ trạng thái bền vững trên PostgreSQL, truyền phát phản hồi SSE, tích hợp Langfuse tracing
- [x] Tối ưu hóa CI/CD: triển khai 2 môi trường VPS, Docker layer caching với BuildKit
- [x] Kết nối ứng dụng di động với API backend thực tế; kiểm thử độ chính xác của Tool

### Đã hoàn thành
- Tự động hóa triển khai trên 2 VPS (develop và main); sửa lỗi CI ở các job healthcare, web; bật BuildKit layer caching và chạy migration tự động (`502ac8d`, `112eec3`, `9b449ec`, `9f3bddd`).
- Khắc phục Dockerfile Web: xử lý tương thích pnpm standalone và nạp đầy đủ gói SWC helpers vật lý (`c45a861`, `4b77cf6`, `b7522ef`).
- Nâng cấp AI Agent: tích hợp Langfuse tracing, cơ chế phản hồi linh hoạt, chuyển đổi ngữ cảnh an toàn, lưu trữ state trên PostgreSQL, streaming SSE, cơ chế ngắt mạch circuit-breaker chống treo DB pool (`37682ce`, `b21c2be`, `889b87b`, `31028f5`, `0529892`, `58447b1`, `4eaf90e`, `73e0b12`).
- Ứng dụng di động thay thế hoàn toàn dữ liệu giả bằng tích hợp API Gateway thật (`61ba9c4`).
- Food Service: bổ sung bước làm rõ địa chỉ giao hàng qua hội thoại; đánh giá độ chính xác của Tool qua Langfuse (`97cfe1e`, `33ae4f4`).
- Hoàn tất merge tính năng Agent qua PR #50 và #51 (`cadb86c`, `41eb42f`).

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
| :--- | :--- | :--- |
| Ứng dụng Web bị lỗi thiếu SWC helpers khi chạy qua Next standalone | Copy đầy đủ node_modules và thay thế symlink pnpm bằng file vật lý (`4b77cf6`, `b7522ef`) | Ứng dụng Web Next.js khởi chạy trơn tru |
| Database connection pool trong test dễ bị treo (hang) | Bổ sung circuit-breaker và cơ chế fast-fail timeout cho pool kết nối (`0529892`) | Test suite chạy ổn định, không bị deadlock |

---

## Tuần 6: 24/08/2026 - 30/08/2026

### Mục tiêu tuần này
- [x] Tái thiết kế toàn diện giao diện Assistant Chat (Sidebar thu gọn kép, Typography Be Vietnam Pro, Card vé xe trực quan)
- [x] Tích hợp Google OAuth 2.0, bảng điều khiển quản trị (Admin Console) và giao tiếp giọng nói (Voice STT/TTS)
- [x] Khắc phục lỗi định vị địa chỉ/geocoding, hoàn thiện vòng đời Ride, tăng cường khả năng phục hồi migration và bộ test E2E

### Đã hoàn thành
- Giao diện: Tái thiết kế Assistant Chat, thanh điều hướng kép có thể thu gọn (Dual Collapsible Sidebars), thẻ dịch vụ trực quan, chuông thông báo, công tắc chuyển chế độ cạnh nổi, khung nhập tin nhắn toàn chiều rộng (`7f66d1d`, `e68cb31`, `30577f8`, `48230a6`, `285cfe8`).
- Xác thực: Tích hợp Google OAuth 2.0 trên cả Gateway và Web, tự động chuyển hướng onboarding; tăng cường bảo mật phiên và chính sách mật khẩu (`19380a7`, `40bff6e`, `0665c9b`, `b6f4d57`).
- Agent Service: Hỗ trợ nhiều key Gemini với cơ chế Round-Robin và tự động Failover; kiểm soát chặt chẽ phạm vi gọi dịch vụ (`28d4344`, `32b3f60`, `a2568af`).
- Admin Console: Quản lý và luân chuyển API keys, ẩn thông tin bảo mật, chẩn đoán sức khỏe hệ thống thời gian thực, quản lý phân trang và khóa/mở tài khoản người dùng (`22ae796`, `8fd1a0d`, `8b328db`, `447c069`).
- Giao tiếp giọng nói: Hoàn thiện tính năng nhập/xuất âm thanh STT và TTS (PR #70, #71, #73); xử lý xung đột typing của Multer trong CI (`5a2e113`, `c49e9ea`, `b2666ad`, `c4bc721`).
- Địa chỉ & Bản đồ: Khắc phục lỗi geocoding, tự động điền địa chỉ mặc định, lọc trùng địa chỉ hồ sơ, bổ sung dữ liệu địa chỉ tất định và gợi ý tự động (`73bcc2d`, `5cdc231`, `5d28a4f`, `56aadc6`).
- Domain Services: Khắc phục phantom migration revision của Ride, đồng bộ hóa snapshot báo giá; áp dụng phân trang phía server cho Food, Restaurant và Healthcare (`23fe6e5`, `494ca2c`, `674bdd6`, `99a41af`, `b7a8b33`).
- Kiểm thử & Chất lượng: Chạy Alembic migration từ image sạch, tăng độ tin cậy của test E2E; giải quyết triệt để lỗi lint của Ruff (`13689b9`, `2ee72ed`, `153a26e`, `ce876d9`, `8946350`).

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
| :--- | :--- | :--- |
| Lỗi treo khóa migration (migration lock hang) trong CI | Chạy Alembic từ image sạch và bổ sung cơ chế retry (`13689b9`, `2ee72ed`) | Migration và test E2E đạt độ tin cậy 100% |
| Xuất hiện phantom migration revision gây lệch snapshot Ride | Đối chiếu, khớp mã revision và chuẩn hóa snapshot báo giá (`494ca2c`, `23fe6e5`) | Migration của Ride Service nhất quán |
| Báo giá Ride bị gán nhãn nhầm là "Đã tạo chuyến" trước khi xác nhận | Sửa đổi nhãn hiển thị bám sát trạng thái xác nhận của backend (`b3dd17b`) | Luồng nghiệp vụ minh bạch, chuẩn xác |
| Lỗi tải file âm thanh do xung đột kiểu dữ liệu Multer trong CI | Cập nhật định nghĩa TypeScript cho Multer trong API Gateway (`c4bc721`) | CI pipeline hoàn thành xanh sạch |

---

## Tuần 7: 31/08/2026 - 01/09/2026

### Mục tiêu tuần này
- [x] Hợp nhất toàn bộ thay đổi từ nhánh `develop` vào nhánh `main` (PR #77)
- [x] Tải lên slide tổng kết dự án và hoàn thiện hồ sơ nghiệm thu

### Đã hoàn thành
- Merge thành công PR #77 từ `develop` vào `main` (`86b34c2`).
- Tải lên slide thuyết trình nghiệm thu dự án (`a674ce2`).
- Chuẩn bị sẵn sàng cho phiên trình bày nghiệm thu và đánh giá năng lực sản phẩm.

### Bài học kinh nghiệm
- Việc liên tục kiểm tra tính toàn vẹn của nhánh `develop` và merge sớm vào `main` giúp tài liệu, slide thuyết trình và mã nguồn luôn khớp nhau 100%.
