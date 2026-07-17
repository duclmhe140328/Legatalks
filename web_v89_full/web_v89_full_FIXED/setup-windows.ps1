$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "apps/server/.env")) {
    Copy-Item "apps/server/.env.example" "apps/server/.env"
}
if (-not (Test-Path "apps/web/.env")) {
    Copy-Item "apps/web/.env.example" "apps/web/.env"
}

Write-Host "[1/4] Starting MongoDB..." -ForegroundColor Cyan
docker compose up -d mongo

Write-Host "[2/4] Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "[3/4] Checking demo data (existing data will NOT be deleted)..." -ForegroundColor Cyan
npm run seed

Write-Host "[4/4] Setup completed." -ForegroundColor Green
Write-Host "Uploads are stored outside source at %USERPROFILE%\.nexora-connect\uploads"
Write-Host "Run .\start-windows.ps1 then open http://localhost:5173"
