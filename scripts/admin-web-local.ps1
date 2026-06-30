param(
  [int]$Port = 8790,
  [string]$WorkerUrl = "http://127.0.0.1:8787",
  [string]$Token = "local-dev-token",
  [switch]$Mock
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$env:FIXVOX_ADMIN_ENV = "local"
$env:FIXVOX_ADMIN_PORT = [string]$Port
$env:FIXVOX_ADMIN_HOST = "127.0.0.1"
$env:FIXVOX_ADMIN_BASE_URL = $WorkerUrl
$env:FIXVOX_ADMIN_WEB_TOKEN = $Token
if ($Mock) { $env:FIXVOX_ADMIN_MOCK = "1" } else { Remove-Item Env:FIXVOX_ADMIN_MOCK -ErrorAction SilentlyContinue }
if (-not $env:PI_CHAT_CWD) { $env:PI_CHAT_CWD = $repo }

Write-Host "Fixvox Admin Web LOCAL" -ForegroundColor Cyan
Write-Host "  URL: http://127.0.0.1:$Port/admin/pi"
Write-Host "  Worker: $WorkerUrl"
Write-Host "  Token: $Token"
Write-Host "  Mock: $Mock"
Write-Host "  CWD: $env:PI_CHAT_CWD"
Write-Host ""
if (-not $Mock) {
  Write-Host "Start the local Worker separately with: npm run cloud:dev:local" -ForegroundColor Yellow
} else {
  Write-Host "Mock mode: no Worker/VPS/Pi needed; use this for UI polish." -ForegroundColor Yellow
}

node admin/fixvox-web/server.mjs
