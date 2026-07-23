$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repo "cloud/fixvox-api")

$env:FIXVOX_ALLOW_REAL_PROVIDER_SMOKE = "1"
Write-Host "GATED LOCAL REAL-PROVIDER SMOKE" -ForegroundColor Yellow
Write-Host "  Scope: exactly one synthetic Groq chat request"
Write-Host "  Database: fixvox_test only"
Write-Host "  Production/VPS/Cloudflare mutation: none"
Write-Host ""

bun --env-file=../../.env.postgres.local --env-file=../../.env run tests/local-real-provider.smoke.mjs
