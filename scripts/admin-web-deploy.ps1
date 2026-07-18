param(
  [switch]$ConfirmProduction,
  [ValidateRange(5, 120)]
  [int]$ReadinessTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'

if (-not $ConfirmProduction) {
  throw 'Production deploy is gated. Re-run with -ConfirmProduction only after explicit approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$adminRoot = Join-Path $repo 'admin/fixvox-web'
$files = @('server.mjs', 'public/app.js', 'public/styles.css')
$remoteHost = 'vps'
$remoteRoot = '/home/jpsal/dev/dictation-tauri/admin/fixvox-web'
$backupRoot = '/home/jpsal/.local/state/fixvox-admin-backups'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteStage = "/tmp/fixvox-admin-deploy-$runId"
$remoteBackup = "$backupRoot/$runId.tar.gz"

function Invoke-Checked {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
  }
}

function Invoke-Remote {
  param([Parameter(Mandatory)] [string]$Command)
  Invoke-Checked -FilePath 'ssh' -ArgumentList @($remoteHost, "set -e; $Command")
}

function Wait-ForAdminReadiness {
  $deadline = (Get-Date).AddSeconds($ReadinessTimeoutSeconds)
  do {
    & ssh $remoteHost 'curl -fsS http://127.0.0.1:8787/healthz'
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Admin readiness did not pass within $ReadinessTimeoutSeconds seconds."
}

foreach ($file in $files) {
  if (-not (Test-Path (Join-Path $adminRoot $file))) {
    throw "Missing deploy file: $file"
  }
}

$replacementStarted = $false
try {
  Invoke-Remote "mkdir -p '$backupRoot' '$remoteStage'; tar -czf '$remoteBackup' -C '$remoteRoot' server.mjs public/app.js public/styles.css"
  Invoke-Checked -FilePath 'scp' -ArgumentList @(
    (Join-Path $adminRoot 'server.mjs'),
    (Join-Path $adminRoot 'public/app.js'),
    (Join-Path $adminRoot 'public/styles.css'),
    "${remoteHost}:$remoteStage/"
  )
  Invoke-Remote "node --check '$remoteStage/server.mjs'; node --check '$remoteStage/app.js'"

  $replacementStarted = $true
  Invoke-Remote "cp '$remoteStage/server.mjs' '$remoteRoot/server.mjs'; cp '$remoteStage/app.js' '$remoteRoot/public/app.js'; cp '$remoteStage/styles.css' '$remoteRoot/public/styles.css'; systemctl --user restart fixvox-admin-web.service"
  Wait-ForAdminReadiness
  Invoke-Remote "rm -rf '$remoteStage'"
  Write-Host "Admin deploy complete. Backup: $remoteBackup" -ForegroundColor Green
} catch {
  $deployError = $_
  if ($replacementStarted) {
    try {
      Invoke-Remote "tar -xzf '$remoteBackup' -C '$remoteRoot'; systemctl --user restart fixvox-admin-web.service"
      Wait-ForAdminReadiness
    } catch {
      throw "Admin deploy failed and rollback could not be verified. Backup: $remoteBackup. Error: $($_.Exception.Message)"
    }
    throw "Admin deploy failed; rollback restored from $remoteBackup. Original error: $($deployError.Exception.Message)"
  }
  throw
}
