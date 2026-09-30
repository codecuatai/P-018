# Đặc Tả Kỹ Thuật MCP Server & Client Hai Chiều Cho Đối Tác X-One
(X-One Provider Model Context Protocol Specification)

Tài liệu này cung cấp hướng dẫn đầy đủ về chuẩn giao tiếp **Model Context Protocol (MCP)** hai chiều được triển khai trên nền tảng **X-One**, hỗ trợ kết nối trực tiếp các trợ lý AI hàng đầu (Claude Desktop, Cursor, LangGraph, AutoGen) với 4 dịch vụ cốt lõi: **Di chuyển (Ride)**, **Nhà hàng (Restaurant)**, **Giao đồ ăn (Food)**, và **Y tế (Healthcare)**.

---

## 1. Tổng Quan Kiến Trúc MCP Hai Chiều

Nền tảng X-One hỗ trợ giao tiếp MCP theo cả hai chiều:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CHIỀU 1: MCP SERVER (Inbound)                     │
│                                                                         │
│  Claude Desktop / Cursor / AI Partner                                   │
│           │                                                             │
│           │  POST /mcp (JSON-RPC 2.0 Streamable HTTP)                  │
│           ▼                                                             │
│  [API Gateway :3000/mcp]                                                │
│      ├── McpAuthGuard (JWT Bearer / API Key: xone_mcp_...)              │
│      ├── McpSessionService (Stateful Session Tracking)                 │
│      ├── DomainGuard (Phân quyền theo vai trò đối tác)                  │
│      └── Typed service clients gọi P-018-Service MCP qua Streamable HTTP│
│                         │                                               │
│                         ▼                                               │
│                 [P-018-Service MCP :8105/mcp]                           │
│                         │ HTTP nội bộ                                   │
│              Ride / Restaurant / Healthcare / Food                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      CHIỀU 2: MCP CLIENT (Outbound)                    │
│                                                                         │
│  X-One Agent Service (:8001)                                            │
│      ├── ExternalMcpRouter (Điều hướng thông minh theo intent)          │
│      ├── McpConfigRegistry (Đọc cấu hình partner & allowlist)           │
│      └── McpClient (Httpx Streamable HTTP + Session + Auto-retry)       │
│           │                                                             │
│           ▼                                                             │
│  MCP Server của đối tác bên ngoài (Hospital / Restaurant Chain / v.v.)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Thông Số Kỹ Thuật Kết Nối (Connection Specifications)

| Thông số | Giá trị |
| :--- | :--- |
| **Giao thức MCP** | Model Context Protocol |
| **Phiên bản chuẩn** | `2024-11-05` |
| **Phương thức truyền dẫn** | Streamable HTTP (POST /mcp, GET /mcp SSE, DELETE /mcp) |
| **Định dạng dữ liệu** | JSON-RPC 2.0 (`application/json`) |
| **Base URL (Local)** | `http://localhost:3000/mcp` |
| **Base URL (Production)** | `https://c3-app-018.io.vn/mcp` |
| **Session Tracking** | Header `Mcp-Session-Id` (TTL mặc định: 1800 giây) |
| **Rate Limit** | 120 yêu cầu / phút trên mỗi API Key |

---

## 3. Cơ Chế Xác Thực Kép (Dual Authentication)

Gateway hỗ trợ 2 hình thức xác thực thông qua header `Authorization: Bearer <token>`:

1. **JWT Session Token**: Sử dụng trực tiếp Access Token của đối tác đăng nhập trên Web Portal.
2. **MCP API Key**: Khóa chuyên dụng dành cho server/máy khách bên ngoài với định dạng:
   - **Prefix**: `xone_mcp_...` (độ dài 64 ký tự).
   - **Bảo mật**: Khóa được băm một chiều bằng thuật toán **SHA-256** và lưu tại bảng `mcp_api_keys`.
   - **Cấp phát**: Tạo tại **Cổng Đối Tác X-One** (đường dẫn `/app/provider`) -> Tab **"Kết nối MCP (AI Partner)"**.

---

## 4. Danh Mục 22 Công Cụ MCP Tiêu Chuẩn (Tool Registry)

Mọi công cụ đều được bảo vệ bởi **Domain Guard**: Đối tác chỉ được phép gọi các công cụ thuộc quyền sở hữu của vai trò của mình (Master Provider có toàn quyền).

### 4.1. Nhóm Quản Lý Hồ Sơ & Dịch Vụ (Provider & Catalog)
Áp dụng cho: Mọi đối tác đã kích hoạt.

| Tên Công Cụ | Mô Tả | Tham Số Đầu Vào |
| :--- | :--- | :--- |
| `provider.get_profile` | Lấy thông tin hồ sơ doanh nghiệp, trạng thái mở cửa, webhook URL | Không có |
| `provider.update_profile` | Cập nhật tên quán/hãng xe, địa chỉ, số điện thoại, trạng thái mở | `business_name?`, `phone?`, `address?`, `is_open?`, `webhook_url?` |
| `provider.list_items` | Xem danh sách món ăn/gói dịch vụ do đối tác đăng bán | Không có |
| `catalog.create_item` | Đăng mới một mặt hàng hoặc gói dịch vụ vào hệ thống | `domain` *(ride, food, restaurant, healthcare)*, `name`, `price`, `category?`, `description?` |
| `catalog.update_availability`| Bật/tắt trạng thái mở bán của món hoặc dịch vụ | `item_id`, `is_available` *(boolean)* |
| `catalog.delete_item` | Xóa mặt hàng khỏi danh mục | `item_id` |
| `catalog.search` | Tìm kiếm món ăn/dịch vụ theo từ khóa | `query`, `domain?`, `limit?` |

### 4.2. Nhóm Dịch Vụ Gọi Xe (Ride Service)
Quyền hạn: `ride_driver` hoặc `master`.

| Tên Công Cụ | Mô Tả | Tham Số Đầu Vào |
| :--- | :--- | :--- |
| `ride.list_pending_bookings` | Liệt kê các cuốc xe đang chờ tài xế tiếp nhận | `limit?` |
| `ride.accept_booking` | Nhận cuốc xe của hành khách | `booking_id` |
| `ride.update_trip_status` | Cập nhật tiến độ cuốc xe | `booking_id`, `status` *(DRIVER_TO_PICKUP, DRIVER_ARRIVED, IN_PROGRESS, ARRIVED_DESTINATION, COMPLETED)* |
| `ride.get_tracking` | Lấy tọa độ GPS và lộ trình di chuyển thực tế | `booking_id` |

### 4.3. Nhóm Giao Đồ Ăn (Food Service)
Quyền hạn: `restaurant_merchant` hoặc `master`.

| Tên Công Cụ | Mô Tả | Tham Số Đầu Vào |
| :--- | :--- | :--- |
| `food.list_orders` | Xem danh sách đơn giao đồ ăn cần xử lý | `status?`, `limit?` |
| `food.confirm_order` | Xác nhận nhận đơn và bắt đầu chế biến | `order_id` |
| `food.reject_order` | Từ chối đơn hàng kèm lý do rõ ràng | `order_id`, `reason` |
| `food.update_order_status` | Cập nhật trạng thái nhà bếp / giao hàng | `order_id`, `status` *(preparing, ready_for_pickup, delivering, delivered, cancelled)* |

### 4.4. Nhóm Nhà Hàng & Đặt Bàn (Restaurant Service)
Quyền hạn: `restaurant_merchant` hoặc `master`.

| Tên Công Cụ | Mô Tả | Tham Số Đầu Vào |
| :--- | :--- | :--- |
| `restaurant.list_tables` | Kiểm tra tình trạng bàn ăn thực tế tại quán | `date?`, `time_slot?` |
| `restaurant.update_open_status`| Cập nhật nhanh quán đang mở cửa hay tạm nghỉ | `is_open` *(boolean)* |

### 4.5. Nhóm Y Tế & Phòng Khám (Healthcare Service)
Quyền hạn: `healthcare_doctor` hoặc `master`.

| Tên Công Cụ | Mô Tả | Tham Số Đầu Vào |
| :--- | :--- | :--- |
| `healthcare.list_appointments`| Liệt kê các ca hẹn khám trong ngày hoặc theo bác sĩ | `date?`, `doctor_id?`, `limit?` |
| `healthcare.confirm_appointment`| Bác sĩ xác nhận tiếp nhận lịch khám của bệnh nhân | `appointment_id` |
| `healthcare.cancel_appointment`| Hủy lịch khám kèm lý do y khoa | `appointment_id`, `reason` |
| `healthcare.update_slots` | Cập nhật số ca tiếp nhận trong từng khung giờ | `date`, `slot_time`, `is_available`, `max_capacity?` |

### 4.6. Nhóm Tổng Hợp Tác Nghiệp (Operations)
Quyền hạn: Toàn bộ đối tác.

| Tên Công Cụ | Mô Tả | Tham Số Đầu Vào |
| :--- | :--- | :--- |
| `operations.list_pending` | Tổng hợp nhanh toàn bộ việc cần làm (cuốc chờ nhận, đơn đang nấu, lịch khám sắp tới) | Không có |

---

## 5. Hướng Dẫn Tích Hợp Client (Quick Start)

### 5.1. Cấu hình trên Claude Desktop
Thêm vào tệp `%APPDATA%\Claude\claude_desktop_config.json` (Windows) hoặc `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "x-one-provider": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://c3-app-018.io.vn/mcp",
        "--header",
        "Authorization: Bearer xone_mcp_your_api_key_here"
      ]
    }
  }
}
```

### 5.2. Cấu hình trên Cursor AI
Truy cập **Cursor Settings** -> **Features** -> **MCP Servers** -> **Add New MCP Server**:
- **Name**: `x-one-provider`
- **Type**: `SSE` hoặc `HTTP`
- **URL**: `https://c3-app-018.io.vn/mcp`
- **Headers**:
  ```json
  {
    "Authorization": "Bearer xone_mcp_your_api_key_here"
  }
  ```

### 5.3. Gọi trực tiếp bằng Python / Httpx
```python
import httpx

API_KEY = "xone_mcp_your_api_key_here"
MCP_URL = "https://c3-app-018.io.vn/mcp"

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}

# 1. Khởi tạo phiên
init_payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "my-agent", "version": "1.0.0"}
    }
}
res = httpx.post(MCP_URL, json=init_payload, headers=headers)
session_id = res.headers.get("Mcp-Session-Id")

# 2. Gọi công cụ
call_payload = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "operations.list_pending",
        "arguments": {}
    }
}
if session_id:
    headers["Mcp-Session-Id"] = session_id

result = httpx.post(MCP_URL, json=call_payload, headers=headers)
print(result.json())
```

---

## 6. Xử Lý Mã Lỗi Chuẩn JSON-RPC

| Mã Lỗi | Tên Lỗi | Nguyên Nhân & Cách Khắc Phục |
| :--- | :--- | :--- |
| `-32700` | Parse Error | Dữ liệu gửi lên không đúng định dạng JSON hợp lệ. |
| `-32600` | Invalid Request | Yêu cầu không tuân thủ cấu trúc JSON-RPC 2.0 (thiếu `jsonrpc` hoặc `method`). |
| `-32601` | Method Not Found | Phương thức RPC không tồn tại (chỉ hỗ trợ: `initialize`, `ping`, `tools/list`, `tools/call`). |
| `-32602` | Invalid Params | Tham số đầu vào của tool bị thiếu hoặc sai kiểu dữ liệu. |
| `-32000` | Tool Execution Error | Lỗi thực thi logic nghiệp vụ tại microservice hạ tầng. |
| `401` | Unauthorized | Thiếu Bearer Token hoặc API Key không hợp lệ. |
| `403` | Forbidden | Đối tác không có quyền gọi tool này (Domain Guard từ chối). |

---

## 7. Chiều Ngược Lại: X-One Gọi Vào MCP Server Của Đối Tác

Khi đối tác muốn X-One Agent ủy quyền truy vấn trực tiếp vào hệ thống của mình:
1. Đối tác cung cấp Endpoint MCP Server công khai hỗ trợ JSON-RPC 2.0.
2. Quản trị viên kích hoạt tại bảng `mcp_provider_configs` trên X-One:
   ```sql
   INSERT INTO mcp_provider_configs (provider_id, mcp_url, api_key_ref, enabled, allowed_tools)
   VALUES ('hospital-tam-anh', 'https://mcp.tamanhhospital.vn/mcp', 'env:TAM_ANH_MCP_KEY', true, ARRAY['tam_anh.get_slots', 'tam_anh.book_slot']);
   ```
3. X-One Agent Service sẽ tự động định tuyến intent, gọi công cụ từ xa với cơ chế auto-retry và gắn nhãn `source: external-mcp`. Nếu hệ thống đối tác quá tải, X-One tự động kích hoạt chế độ **Fallback** an toàn.
