param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'
$mainFile = Join-Path $ProjectPath 'lib\main.dart'

if (-not (Test-Path $mainFile)) {
  throw "Không tìm thấy file: $mainFile"
}

$content = [System.IO.File]::ReadAllText($mainFile)
$old = '_aboutMeTab(me),'
$new = '_aboutMeTab(me!),'

if ($content.Contains($new)) {
  Write-Host 'Dòng null-safety đã được sửa từ trước. Không cần thay đổi thêm.' -ForegroundColor Yellow
  exit 0
}

if (-not $content.Contains($old)) {
  throw "Không tìm thấy đoạn cần sửa: $old`nCó thể main.dart của bạn khác bản patch. Hãy tìm dòng gọi _aboutMeTab và đổi tham số me thành me!."
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir = Join-Path $ProjectPath "patch_backups\flutter_compile_fix_$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item $mainFile (Join-Path $backupDir 'main.dart') -Force

$content = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($mainFile, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host 'Đã sửa thành công:' -ForegroundColor Green
Write-Host "  $old"
Write-Host "  -> $new"
Write-Host "Backup: $backupDir" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Chạy tiếp:' -ForegroundColor Cyan
Write-Host '  flutter clean'
Write-Host '  flutter pub get'
Write-Host '  flutter run --release'
