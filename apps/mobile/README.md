# AI Concierge - Mobile Application

> **X-ONE ASSISTANT | MOBILE APP (REACT NATIVE / EXPO)**  
> **Ứng dụng di động hỗ trợ đặt xe, đặt lịch khám và dịch vụ bằng giọng nói/hội thoại.**

---

## 1. Hướng Dẫn Khởi Chạy (Quick Start)

### Cài đặt thư viện:
```bash
cd apps/mobile
npm install
```

### Chạy ứng dụng di động:
```bash
# Chạy với Expo CLI
npm start

# Chạy trên Android Emulator / thiết bị thật
npm run android

# Chạy trên iOS Simulator (macOS)
npm run ios
```

---

## 2. Kết Nối API Backend

Ứng dụng kết nối trực tiếp với FastAPI Backend tại `http://localhost:8000` (hoặc IP local của máy chủ khi test trên thiết bị thật).
- REST API Base URL: `http://<IP_LOCAL>:8000/api/v1`
- WebSocket Realtime: `ws://<IP_LOCAL>:8000/ws`
