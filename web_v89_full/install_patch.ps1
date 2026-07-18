param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$patchRoot = Join-Path $PSScriptRoot "PATCH_FILES"
$projectRoot = (Resolve-Path $ProjectPath).Path
$backupRoot = Join-Path $projectRoot ("patch_backup_web_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

if (-not (Test-Path (Join-Path $projectRoot "apps\web")) -or -not (Test-Path (Join-Path $projectRoot "apps\server"))) {
    throw "Sai ProjectPath: không tìm thấy apps\web và apps\server trong $projectRoot"
}

$files = Get-ChildItem -Path $patchRoot -Recurse -File
foreach ($file in $files) {
    $relative = $file.FullName.Substring($patchRoot.Length).TrimStart('\', '/')
    $target = Join-Path $projectRoot $relative

    if (Test-Path $target) {
        $backup = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $backup -Parent) | Out-Null
        Copy-Item $target $backup -Force
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    Copy-Item $file.FullName $target -Force
    Write-Host "Da cap nhat: $relative"
}

Write-Host ""
Write-Host "CAI PATCH WEB THANH CONG." -ForegroundColor Green
Write-Host "Ban sao file cu (neu co): $backupRoot"
Write-Host "Chay tiep: npm install && npm run build"
