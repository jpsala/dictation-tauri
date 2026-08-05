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
  'omp-chat-access.mjs',
  'omp-remote-policy.mjs',
  'omp-host-tools.mjs',
  'omp-rpc-framing.mjs',
  'omp-workspace-broker-client.mjs',
  'omp-workspace-broker.mjs',
  'constelaciones-read-adapter.mjs',
  'constelaciones-read-broker.mjs',
  'omp-release-broker.mjs',
  'omp-release-broker-client.mjs',
  'omp-release-git-runner.mjs',
  'omp-release-service.mjs',
  'omp-admin-deploy-broker.mjs',
  'omp-admin-deploy-operations.mjs',
  'omp-admin-deploy-service.mjs',
  'omp-admin-deploy-client.mjs'
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
$remoteChecks = (@($runtimeFiles + 'public/app.js') | ForEach-Object { "node --check '$remoteStage/$_'" }) -join '; '
$remoteCopies = ($files | ForEach-Object { "cp '$remoteStage/$_' '$remoteRoot/$_'" }) -join '; '

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
  Invoke-Remote "echo '$bundleHash  $remoteBundle' | sha256sum -c -; tar -xzf '$remoteBundle' -C '$remoteStage'; $remoteChecks"

  $replacementStarted = $true
  Invoke-Remote "$remoteCopies; systemctl --user restart fixvox-admin-web.service"
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
