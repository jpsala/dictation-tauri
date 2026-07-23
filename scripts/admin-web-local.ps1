param(
  [int]$Port = 8790,
  [string]$WorkerUrl = "http://127.0.0.1:8787",
  [string]$Token = "local-dev-token",
  [switch]$Mock,
  [switch]$SelfHosted
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if ($Mock -and $SelfHosted) { throw "Choose either -Mock or -SelfHosted" }
if ($SelfHosted) {
  if (-not $PSBoundParameters.ContainsKey('Port')) { $Port = 8787 }
  if (-not $PSBoundParameters.ContainsKey('WorkerUrl')) { $WorkerUrl = "http://127.0.0.1:8790" }
}

$env:FIXVOX_ADMIN_ENV = "local"
$env:FIXVOX_ADMIN_PORT = [string]$Port
$env:FIXVOX_ADMIN_HOST = "127.0.0.1"
$env:FIXVOX_ADMIN_BASE_URL = $WorkerUrl
$env:FIXVOX_ADMIN_WEB_TOKEN = $Token
if ($Mock) { $env:FIXVOX_ADMIN_MOCK = "1" } else { Remove-Item Env:FIXVOX_ADMIN_MOCK -ErrorAction SilentlyContinue }
if ($Mock -or $SelfHosted) { $env:FIXVOX_ADMIN_SKIP_ENV_FILES = "1" } else { Remove-Item Env:FIXVOX_ADMIN_SKIP_ENV_FILES -ErrorAction SilentlyContinue }
if ($SelfHosted) {
  $env:FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE = "1"
  if (-not $env:ADMIN_VIEW_API_KEY) { $env:ADMIN_VIEW_API_KEY = "fixvox-local-view" }
  if (-not $env:ADMIN_EDIT_API_KEY) { $env:ADMIN_EDIT_API_KEY = "fixvox-local-edit" }
  if (-not $env:ADMIN_PUBLISH_API_KEY) { $env:ADMIN_PUBLISH_API_KEY = "fixvox-local-publish" }
} else {
  Remove-Item Env:FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE -ErrorAction SilentlyContinue
}
if (-not $env:PI_CHAT_CWD) { $env:PI_CHAT_CWD = $repo }

Write-Host "Fixvox Admin Web LOCAL" -ForegroundColor Cyan
Write-Host "  URL: http://127.0.0.1:$Port/admin/pi"
Write-Host "  Backend: $WorkerUrl"
Write-Host "  Token: $Token"
Write-Host "  Mock data: $Mock"
Write-Host "  Self-hosted API: $SelfHosted"
Write-Host "  CWD: $env:PI_CHAT_CWD"
Write-Host ""
if ($SelfHosted) {
  Write-Host "Start the local API separately with: npm run selfhosted:api:local" -ForegroundColor Yellow
} elseif (-not $Mock) {
  Write-Host "Start the local Worker separately with: npm run cloud:dev:local" -ForegroundColor Yellow
} else {
  Write-Host "Mock mode: no Worker/VPS/Pi needed; use this for UI polish." -ForegroundColor Yellow
}

node admin/fixvox-web/server.mjs
