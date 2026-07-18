# PATCH NHANH WEB + BACKEND

Patch này chỉ chứa các file đã thay đổi, không chứa toàn bộ project.

## File được cập nhật

- `apps/server/src/models/Post.js`
- `apps/server/src/routes/posts.js`
- `apps/server/src/routes/stories.js`
- `apps/server/src/utils/socialAccess.js` (file mới)
- `apps/web/src/facebook-social-spec.css`
- `apps/web/src/pages/ProfilePage.jsx`
- `apps/web/src/pages/TimelinePage.jsx`
- `apps/web/src/pages/UserProfilePage.jsx`

## Cách nhanh nhất: chép đè

Mở thư mục `PATCH_FILES`, copy toàn bộ `apps` rồi dán vào thư mục gốc project Web, chọn **Replace the files in the destination**.

## Cài tự động bằng PowerShell

Mở PowerShell tại thư mục đã giải nén patch:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_patch.ps1 -ProjectPath "D:\duong-dan\project-web"
```

Script tự sao lưu file cũ vào thư mục `patch_backup_web_...` trong project.

Sau khi cài:

```powershell
cd "D:\duong-dan\project-web"
npm install
npm run build
```

Nếu chạy backend và frontend riêng theo workspace, giữ nguyên lệnh chạy cũ của project.
