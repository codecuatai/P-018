# Hợp Đồng OpenAPI (OpenAPI Contracts)

Thư mục này chứa các đặc tả OpenAPI có phiên bản của hệ thống. Hợp đồng nghiệp vụ của Restaurant Service nằm trong `restaurant-service-v1.yaml`; các client được sinh tự động (generated clients) phải được tạo ra từ hợp đồng này và tuyệt đối không được chỉnh sửa thủ công bằng tay.

- `gateway-auth-v1.yaml`: Hợp đồng xác thực công khai Giai đoạn 1 cho các chức năng đăng ký, đăng nhập, làm mới JWT, thông tin danh tính, đăng xuất, quản lý phiên và đặt lại mật khẩu. Refresh token chỉ được lưu trong cookie dạng giá trị mờ (opaque). Trình duyệt gọi trực tiếp vào Gateway; không có tầng BFF của Next.js hay client Web được sinh tự động.
- `shared-primitives.v1.yaml`: Định nghĩa các kiểu dữ liệu nguyên thủy dùng chung: `GeoPoint`, `Money`, `Address`, `OpeningHours`, `Rating`, `ImageRef`, `DatasetSource`, `CurrentLocation`, `PaginationMeta`, `TimestampRange`, và cấu trúc envelope phản hồi thành công/danh sách/báo lỗi. Các hợp đồng domain có thể làm mịn thêm nhưng không được thay đổi ý nghĩa của chúng.
- `tool-request.schema.json`: Cấu trúc `ToolRequest` chuẩn đa ngôn ngữ: `tool_name`, `risk_level`, `arguments`, `workflow_id`, `tool_call_id`, `schema_version`, và `idempotency_key` tùy chọn.
