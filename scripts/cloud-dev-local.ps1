param(
  [int]$Port = 8787,
  [switch]$Remote
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$proxy = Join-Path $repo "cloud/fixvox-proxy"
Set-Location $proxy

Write-Host "Fixvox Cloud Worker LOCAL" -ForegroundColor Cyan
Write-Host "  URL: http://127.0.0.1:$Port"
Write-Host "  Vars: cloud/fixvox-proxy/.dev.vars (ignored by git)"
$modeLabel = if ($Remote) { "remote Cloudflare dev" } else { "local dev" }
Write-Host "  Mode: $modeLabel"
Write-Host ""
Write-Host "Start admin web separately with: npm run admin:web:local" -ForegroundColor Yellow

$args = @("wrangler", "dev", "--port", [string]$Port)
if (-not $Remote) { $args += "--local" }
& bunx @args
