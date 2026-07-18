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
$runtimeFiles = @(
  'server.mjs',
  'pi-chat-access.mjs',
  'pi-remote-policy.mjs',
  'pi-remote-agent-core.mjs',
  'pi-remote-agent-extension.mjs',
  'pi-workspace-broker-client.mjs',
  'pi-workspace-broker.mjs',
  'constelaciones-read-adapter.mjs',
  'constelaciones-read-broker.mjs',
  'pi-release-broker.mjs',
  'pi-release-broker-client.mjs',
  'pi-release-git-runner.mjs',
  'pi-release-service.mjs',
  'pi-admin-deploy-broker.mjs',
  'pi-admin-deploy-operations.mjs',
  'pi-admin-deploy-service.mjs',
  'pi-admin-deploy-client.mjs'
)
$publicFiles = @('public/app.js', 'public/styles.css')
$files = @($runtimeFiles + $publicFiles)
$remoteHost = 'vps'
$remoteRoot = '/home/jpsal/dev/dictation-tauri/admin/fixvox-web'
$backupRoot = '/home/jpsal/.local/state/fixvox-admin-backups'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteStage = "/tmp/fixvox-admin-deploy-$runId"
$remoteBackup = "$backupRoot/$runId.tar.gz"
$localBundle = Join-Path ([IO.Path]::GetTempPath()) "fixvox-admin-deploy-$runId.tar.gz"
$remoteBundle = "/tmp/fixvox-admin-deploy-$runId.tar.gz"
$windowsTar = Join-Path $env:SystemRoot 'System32/tar.exe'

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

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Send-BundleWithRetry([string]$Path, [string]$Destination) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    & scp $Path $Destination
    if ($LASTEXITCODE -eq 0) { return }
    if ($attempt -lt 3) { Start-Sleep -Seconds (2 * $attempt) }
  }
  throw "Bundle upload failed after 3 attempts."
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
  Invoke-Checked -FilePath $windowsTar -ArgumentList (@('-czf', $localBundle, '-C', $adminRoot) + $files)
  $bundleHash = Get-Sha256 $localBundle
  Invoke-Remote "mkdir -p '$backupRoot'; rm -rf '$remoteStage' '$remoteBundle'; mkdir -p '$remoteStage'; tar -czf '$remoteBackup' -C '$remoteRoot' ."
  Send-BundleWithRetry $localBundle "${remoteHost}:$remoteBundle"
  Invoke-Remote "echo '$bundleHash  $remoteBundle' | sha256sum -c -; tar -xzf '$remoteBundle' -C '$remoteStage'; node --check '$remoteStage/server.mjs'; node --check '$remoteStage/pi-chat-access.mjs'; node --check '$remoteStage/pi-remote-policy.mjs'; node --check '$remoteStage/pi-remote-agent-core.mjs'; node --check '$remoteStage/pi-remote-agent-extension.mjs'; node --check '$remoteStage/pi-workspace-broker-client.mjs'; node --check '$remoteStage/pi-workspace-broker.mjs'; node --check '$remoteStage/constelaciones-read-adapter.mjs'; node --check '$remoteStage/constelaciones-read-broker.mjs'; node --check '$remoteStage/pi-release-broker.mjs'; node --check '$remoteStage/pi-release-broker-client.mjs'; node --check '$remoteStage/pi-release-git-runner.mjs'; node --check '$remoteStage/pi-release-service.mjs'; node --check '$remoteStage/pi-admin-deploy-broker.mjs'; node --check '$remoteStage/pi-admin-deploy-operations.mjs'; node --check '$remoteStage/pi-admin-deploy-service.mjs'; node --check '$remoteStage/pi-admin-deploy-client.mjs'; node --check '$remoteStage/public/app.js'"

  $replacementStarted = $true
  Invoke-Remote "cp '$remoteStage/server.mjs' '$remoteRoot/server.mjs'; cp '$remoteStage/pi-chat-access.mjs' '$remoteRoot/pi-chat-access.mjs'; cp '$remoteStage/pi-remote-policy.mjs' '$remoteRoot/pi-remote-policy.mjs'; cp '$remoteStage/pi-remote-agent-core.mjs' '$remoteRoot/pi-remote-agent-core.mjs'; cp '$remoteStage/pi-remote-agent-extension.mjs' '$remoteRoot/pi-remote-agent-extension.mjs'; cp '$remoteStage/pi-workspace-broker-client.mjs' '$remoteRoot/pi-workspace-broker-client.mjs'; cp '$remoteStage/pi-workspace-broker.mjs' '$remoteRoot/pi-workspace-broker.mjs'; cp '$remoteStage/constelaciones-read-adapter.mjs' '$remoteRoot/constelaciones-read-adapter.mjs'; cp '$remoteStage/constelaciones-read-broker.mjs' '$remoteRoot/constelaciones-read-broker.mjs'; cp '$remoteStage/pi-release-broker.mjs' '$remoteRoot/pi-release-broker.mjs'; cp '$remoteStage/pi-release-broker-client.mjs' '$remoteRoot/pi-release-broker-client.mjs'; cp '$remoteStage/pi-release-git-runner.mjs' '$remoteRoot/pi-release-git-runner.mjs'; cp '$remoteStage/pi-release-service.mjs' '$remoteRoot/pi-release-service.mjs'; cp '$remoteStage/pi-admin-deploy-broker.mjs' '$remoteRoot/pi-admin-deploy-broker.mjs'; cp '$remoteStage/pi-admin-deploy-operations.mjs' '$remoteRoot/pi-admin-deploy-operations.mjs'; cp '$remoteStage/pi-admin-deploy-service.mjs' '$remoteRoot/pi-admin-deploy-service.mjs'; cp '$remoteStage/pi-admin-deploy-client.mjs' '$remoteRoot/pi-admin-deploy-client.mjs'; cp '$remoteStage/public/app.js' '$remoteRoot/public/app.js'; cp '$remoteStage/public/styles.css' '$remoteRoot/public/styles.css'; systemctl --user restart fixvox-admin-web.service"
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
} finally {
  Remove-Item -LiteralPath $localBundle -Force -ErrorAction SilentlyContinue
  try { Invoke-Remote "rm -rf '$remoteStage' '$remoteBundle'" } catch { }
}
