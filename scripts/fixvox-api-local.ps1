param(
  [int]$Port = 8790,
  [switch]$SkipMigrations
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo ".env.postgres.local"
if (-not (Test-Path $envFile)) {
  throw "Missing ignored local database configuration: .env.postgres.local"
}

foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $name = $Matches[1]
    $value = $Matches[2].Trim('"', "'")
    if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

$databaseUrl = $env:FIXVOX_DATABASE_URL
if (-not $databaseUrl) { throw "Missing FIXVOX_DATABASE_URL in .env.postgres.local" }
try { $databaseUri = [Uri]$databaseUrl } catch { throw "Invalid local PostgreSQL URL" }
if ($databaseUri.AbsolutePath.Trim('/') -ne 'fixvox_test') {
  throw "Refusing to start: local API must use the fixvox_test database"
}

$postgres = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $postgres) { throw "Local PostgreSQL service was not found" }
if ($postgres.Status -ne 'Running') {
  Write-Host "Starting local PostgreSQL service..." -ForegroundColor Yellow
  Start-Service $postgres.Name
  $postgres.WaitForStatus('Running', [TimeSpan]::FromSeconds(15))
}

$env:FIXVOX_API_DATABASE_URL = $databaseUrl
$env:FIXVOX_API_PUBLIC_BASE_URL = "http://127.0.0.1:$Port"
$env:FIXVOX_API_HOST = "127.0.0.1"
$env:FIXVOX_API_PORT = [string]$Port
$env:FIXVOX_API_MOCK_PROVIDERS = "true"
if (-not $env:ADMIN_VIEW_API_KEY) { $env:ADMIN_VIEW_API_KEY = "fixvox-local-view" }
if (-not $env:ADMIN_EDIT_API_KEY) { $env:ADMIN_EDIT_API_KEY = "fixvox-local-edit" }
if (-not $env:ADMIN_PUBLISH_API_KEY) { $env:ADMIN_PUBLISH_API_KEY = "fixvox-local-publish" }

Set-Location (Join-Path $repo "cloud/fixvox-api")
Write-Host "Fixvox API LOCAL / MOCK PROVIDERS" -ForegroundColor Cyan
Write-Host "  API: http://127.0.0.1:$Port"
Write-Host "  Database: fixvox_test"
Write-Host "  Authority: Cloudflare remains production authority"
Write-Host "  Provider traffic: disabled"
Write-Host ""

if (-not $SkipMigrations) {
  bun run src/postgres/migrate.ts
}

bun run src/main.ts
