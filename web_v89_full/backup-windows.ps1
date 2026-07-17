$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $PSScriptRoot "backups\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Write-Host "Backing up MongoDB..." -ForegroundColor Cyan
docker exec nexora-mongo mongodump --db nexora_connect --archive=/tmp/nexora-connect.archive
docker cp nexora-mongo:/tmp/nexora-connect.archive (Join-Path $backupDir "mongo.archive")
docker exec nexora-mongo rm -f /tmp/nexora-connect.archive

$uploads = Join-Path $HOME ".nexora-connect\uploads"
if (Test-Path $uploads) {
    Write-Host "Backing up uploaded media..." -ForegroundColor Cyan
    Copy-Item $uploads (Join-Path $backupDir "uploads") -Recurse -Force
}

Write-Host "Backup completed: $backupDir" -ForegroundColor Green
