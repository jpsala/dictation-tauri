param(
  [int]$Port = 8787,
  [string]$WorkerUrl = "https://auth-fixvox.jpsala.dev"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$env:FIXVOX_ADMIN_ENV = "production"
$env:FIXVOX_ADMIN_PORT = [string]$Port
$env:FIXVOX_ADMIN_HOST = "127.0.0.1"
$env:FIXVOX_ADMIN_BASE_URL = $WorkerUrl
if (-not $env:PI_CHAT_CWD) { $env:PI_CHAT_CWD = $repo }

Write-Host "Fixvox Admin Web PRODUCTION" -ForegroundColor Red
Write-Host "  URL: http://127.0.0.1:$Port/admin/pi"
Write-Host "  Worker: $WorkerUrl"
Write-Host "  Token source: FIXVOX_ADMIN_WEB_TOKEN or ~/.config/dictation-tauri/admin-web.env"
Write-Host ""
Write-Host "Production mutations require explicit JP approval." -ForegroundColor Yellow

node admin/fixvox-web/server.mjs
