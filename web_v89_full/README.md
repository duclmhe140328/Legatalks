# Nexora: Agora cho gọi 1-1, Jitsi cho Họp online

Bản patch này tách hai chức năng media để không còn tranh chấp camera/micro:

- **Tin nhắn → Gọi thoại / Gọi video:** Agora RTC trên web và Flutter.
- **Họp online:** giữ nguyên Jitsi Meet SDK trên web và Flutter.
- Socket.IO hiện tại vẫn phụ trách đổ chuông, nghe máy, từ chối, bận và kết thúc.
- Backend tạo Agora token động; App Certificate không nằm trong web/app.

## File được thay đổi

### Backend

- `apps/server/src/services/agoraToken.js` — tạo token RTC.
- `apps/server/src/routes/calls.js` — thêm `GET /api/calls/:id/agora-token` và chuẩn hóa `audio` thành `voice`.
- `apps/server/src/config/env.js` — đọc biến Agora.

### Web

- `apps/web/src/components/CallModal.jsx` — bỏ WebRTC P2P cũ, dùng `agora-rtc-sdk-ng`.
- `apps/web/src/components/agora-call.css` — giao diện gọi responsive.

### Mobile Flutter

- Chỉ thay block `ActiveCallPage` sang Agora.
- `MeetingHomePage` và `JitsiMeet` vẫn được giữ nguyên.
- Thêm quyền camera, microphone, audio và Bluetooth.

## 1. Tạo project Agora

Trong Agora Console:

1. Tạo project RTC.
2. Chọn chế độ bảo mật có **App Certificate**.
3. Lấy `App ID` và `Primary Certificate`.

Không đưa `App Certificate` vào React, Flutter, GitHub hoặc biến `VITE_*`.

## 2. Chạy installer

Giải nén thư mục này vào:

```text
D:\fullweb\web_v89_full\nexora_agora_calls_web_mobile_patch
```

Chạy:

```powershell
cd D:\fullweb\web_v89_full\nexora_agora_calls_web_mobile_patch

powershell -ExecutionPolicy Bypass `
  -File .\install-agora-calls.ps1 `
  -ProjectRoot D:\fullweb\web_v89_full `
  -MobileRoot D:\bank\meetmobile\flutter_application_1
```

Script sẽ:

- backup file cũ;
- vá backend và web;
- thay `ActiveCallPage` trong `main.dart` hiện tại, không thay `MeetingHomePage`;
- cài `agora-access-token` cho server;
- cài `agora-rtc-sdk-ng` cho web;
- gỡ `flutter_webrtc` nếu còn trong mobile vì package đó dễ trùng lớp WebRTC với Jitsi;
- cài `agora_rtc_engine` và `permission_handler`;
- bổ sung quyền Android/iOS.

## 3. Cấu hình `.env`

Mở:

```text
D:\fullweb\web_v89_full\.env
```

Điền:

```env
AGORA_APP_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AGORA_APP_CERTIFICATE=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AGORA_TOKEN_TTL_SECONDS=3600
```

Giữ nguyên Jitsi:

```env
JITSI_DOMAIN=meet.jit.si
JITSI_JWT=
JITSI_LANGUAGE=vi
```

Khi deploy Render, thêm đúng ba biến Agora vào **Environment** của Web Service backend rồi redeploy.

## 4. Chạy web/backend

```powershell
cd D:\fullweb\web_v89_full
npm run dev
```

Test web trên `localhost` hoặc HTTPS. Trình duyệt thường chặn camera/micro khi dùng IP LAN qua HTTP.

## 5. Build mobile

```powershell
cd D:\bank\meetmobile\flutter_application_1
flutter clean
flutter pub get
flutter run -d R3CR90KV21P
```

## 6. Kiểm tra

Test đủ bốn cặp:

1. Web gọi web.
2. Web gọi mobile.
3. Mobile gọi web.
4. Mobile gọi mobile.

Sau đó vào **Họp online** để xác nhận Jitsi vẫn mở phòng, camera, micro và chia sẻ màn hình như cũ.

## API mới

```http
GET /api/calls/:callSessionId/agora-token
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "provider": "agora",
  "appId": "...",
  "token": "...",
  "channel": "nexora-call-...",
  "uid": 123456789,
  "expiresAt": "2026-07-12T08:00:00.000Z",
  "mode": "voice"
}
```

`AGORA_APP_CERTIFICATE` không bao giờ được trả về client.
