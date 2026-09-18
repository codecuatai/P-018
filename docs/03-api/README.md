# Đặc Tả Giao Diện Lập Trình & Hợp Đồng API (API Specifications & Contracts)

Thư mục này lưu trữ toàn bộ các quy chuẩn giao tiếp HTTP REST, danh mục API thực tế của hệ thống, đặc tả công cụ dành cho AI Agent (Tool Contracts) và tài liệu tích hợp đối tác ngoại vi (Provider Specifications).

---

## Danh Mục Tài Liệu API (API Documentation Index)

| Tài liệu | Phân loại | Mô tả chi tiết |
| :--- | :--- | :--- |
| [api-inventory.md](api-inventory.md) | **API Inventory** | Bảng kiểm kê toàn bộ các endpoint của API Gateway và 4 domain microservices (Food, Ride, Restaurant, Healthcare). |
| [api-conventions.md](api-conventions.md) | **Conventions** | Quy chuẩn thiết kế REST API, mã trạng thái HTTP, định dạng phản hồi chuẩn, pagination và xử lý lỗi. |
| [tool-contracts.md](tool-contracts.md) | **Agent Tools** | Hợp đồng công cụ typed chính thức dành cho AI Agent (tham số đầu vào, đầu ra, ranh giới an toàn). |
| [tool-registry-v2.md](tool-registry-v2.md) | **Agent Registry** | Danh mục registry công cụ phiên bản V2 chuẩn tắc và cơ chế tương thích ngược với V1. |
| [provider-integration-and-webhook-spec.md](provider-integration-and-webhook-spec.md) | **Integrations** | Đặc tả tích hợp API nhà cung cấp bên ngoài (Uber Sandbox, OpenTable, Zocdoc) và cơ chế Webhook. |
| [provider-mcp.md](provider-mcp.md) | **Protocol** | Thiết kế giao thức tích hợp Model Context Protocol (MCP) mở rộng cho các nhà cung cấp bên thứ ba. |

---

## Nguyên Tắc Thiết Kế API Cốt Lõi

1. **Gateway là điểm tiếp xúc công khai duy nhất**: Các ứng dụng Web và Mobile chỉ gọi vào API Gateway (`/api/v1/...`). Các domain service chỉ lắng nghe trong mạng nội bộ private network.
2. **Quy tắc Idempotency cho các giao dịch thay đổi trạng thái**: Mọi request POST/PUT mang tính chất thanh toán, giữ chỗ hoặc đặt hàng đều bắt buộc phải có header `Idempotency-Key`.
3. **Quy trình Xác nhận 2 bước (2-Step Confirmation)**: Các hành động có ảnh hưởng tài chính hoặc giữ chỗ thực tế yêu cầu sinh `confirmation_token` và chỉ thực thi khi người dùng xác nhận rõ ràng.
4. **Hợp đồng OpenAPI là nguồn thẩm quyền**: Mọi thay đổi API phải được định nghĩa trong `packages/contracts/` trước khi sinh code client cho Gateway và Web.
