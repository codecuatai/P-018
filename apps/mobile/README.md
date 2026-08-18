# X-One Mobile Application

Ứng dụng di động X-One Assistant được xây dựng trên **React Native (Expo)**, tích hợp trực tiếp với NestJS API Gateway (`/api/v1`).

---

## 🚀 Các cách chạy & thử nghiệm

### 1. 📱 Chạy trên điện thoại thật (Expo Go) - Nhanh nhất

1. Cài đặt app **Expo Go** từ Google Play Store (Android) hoặc App Store (iOS).
2. Chạy lệnh:
   ```powershell
   cd apps/mobile
   npm install
   npx expo start
   ```
3. Quét mã QR hiển thị trên terminal bằng Expo Go (Android) hoặc Camera app (iOS).
4. **Lưu ý kết nối Gateway khi test trên điện thoại thật:**
   - Điện thoại và máy tính cần chung mạng Wi-Fi.
   - Tại màn hình Đăng nhập, bấm "Cấu hình địa chỉ Gateway" và điền IP máy tính, ví dụ: `http://192.168.1.50:3000`.

---

### 2. 💻 Chạy trên Android Studio (Emulator)

1. Mở **Android Studio**, khởi động một Virtual Device (Android Emulator).
2. Chạy lệnh:
   ```powershell
   cd apps/mobile
   npm install
   npx expo start --android
   ```
3. Expo sẽ tự động phát hiện emulator và khởi chạy ứng dụng.
4. Trên Android Emulator, Gateway tự động kết nối qua `http://10.0.2.2:3000` (được cấu hình sẵn).

---

### 3. 🖥️ Chạy trên trình duyệt Web (Debug UI & Logic)

```powershell
cd apps/mobile
npm install
npx expo start --web
```
Ứng dụng sẽ mở trên trình duyệt, hỗ trợ Chrome DevTools để kiểm tra network calls và logs.

---

### 4. 🍎 Chạy trên iOS Simulator (macOS)

```bash
cd apps/mobile
npm install
npx expo start --ios
```

---

## 🔑 Tài khoản Demo

- Dùng các giá trị `DEMO_AUTH_EMAIL` và `DEMO_AUTH_PASSWORD` của môi trường
  Gateway đang chạy. Root `.env.example` là mẫu cấu hình local; không nhúng
  thông tin đăng nhập vào source mobile.

---

## 🏗️ Cấu trúc thư mục

```
apps/mobile/
├── app.json                  # Cấu hình Expo
├── App.tsx                   # Root component & Navigation Tabs
├── src/
│   ├── api/                  # API clients (auth, assistant, base request)
│   ├── components/           # UI components, ChatMessage, Composer, WorkflowCards
│   │   ├── cards/            # Domain cards: Ride, Restaurant, Healthcare, Food
│   │   └── ui/               # Primitives: ActionButton, DetailRow, MetricRow, CardHeading
│   ├── hooks/                # useAuth, useChat
│   ├── screens/              # AuthScreen, ChatScreen, ActivityScreen, AccountScreen
│   ├── storage/              # Native SecureStore; session-only fallback cho web debug
│   ├── theme/                # Design tokens & color system
│   ├── types/                # Type definitions khớp 100% với Web & Gateway
│   └── utils/                # Date/Money/Text formatting & Idempotency helpers
```

---

## 🔒 Quy tắc kiến trúc & An toàn dữ liệu

- Mobile app **chỉ gọi duy nhất NestJS API Gateway** tại `/api/v1`.
- Không gọi trực tiếp database hoặc domain microservices nội bộ.
- Mọi write operation đều kèm `Idempotency-Key` để chống trùng lặp dữ liệu.
- Native app lưu token qua Expo SecureStore. Bản web chỉ phục vụ debug và dùng
  `sessionStorage`, không được mô tả như hardware-backed encryption.
- Phiên lưu cả Gateway origin cùng token; khi khôi phục, app không gửi token đã
  lưu sang một Gateway tự động phát hiện khác.
- Mobile không mô phỏng kết quả giao dịch authoritative ở local. Trạng thái đặt
  xe, đơn đồ ăn, đặt bàn và lịch khám chỉ đến từ Gateway/domain response.
