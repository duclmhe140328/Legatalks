param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mainFile = Join-Path -Path $ProjectPath -ChildPath "lib\main.dart"

if (-not (Test-Path -LiteralPath $mainFile)) {
    throw "File not found: $mainFile"
}

$content = [System.IO.File]::ReadAllText($mainFile)
$oldText = "_aboutMeTab(me),"
$newText = "_aboutMeTab(me!),"

if ($content.Contains($newText)) {
    Write-Host "The null-safety fix is already installed." -ForegroundColor Yellow
    exit 0
}

if (-not $content.Contains($oldText)) {
    throw "Target text was not found. Open lib\main.dart and replace _aboutMeTab(me), with _aboutMeTab(me!),"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path -Path $ProjectPath -ChildPath ("patch_backups\flutter_compile_fix_" + $timestamp)
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item -LiteralPath $mainFile -Destination (Join-Path $backupDir "main.dart") -Force

$updated = $content.Replace($oldText, $newText)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($mainFile, $updated, $utf8NoBom)

Write-Host "Patch installed successfully." -ForegroundColor Green
Write-Host ("Changed: " + $oldText + " -> " + $newText)
Write-Host ("Backup: " + $backupDir) -ForegroundColor Cyan
Write-Host ""
Write-Host "Run these commands next:" -ForegroundColor Cyan
Write-Host "  flutter clean"
Write-Host "  flutter pub get"
Write-Host "  flutter run --release"
