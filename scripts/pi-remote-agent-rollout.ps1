param(
  [switch]$ConfirmProduction,
  [switch]$SyncMirrors,
  [ValidateRange(1, 5)]
  [int]$UploadAttempts = 3
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteHost = 'vps'
$remoteStage = "/tmp/fixvox-agent-rollout-$runId"
$remoteBundle = "/tmp/fixvox-agent-rollout-$runId.tar.gz"
$localBundle = Join-Path ([IO.Path]::GetTempPath()) "fixvox-agent-rollout-$runId.tar.gz"
$windowsTar = Join-Path $env:SystemRoot 'System32/tar.exe'
$manifest = @(
  'admin/fixvox-web/pi-chat-access.mjs',
  'admin/fixvox-web/pi-remote-policy.mjs',
  'admin/fixvox-web/pi-remote-agent-core.mjs',
  'admin/fixvox-web/pi-remote-agent-extension.mjs',
  'admin/fixvox-web/pi-workspace-broker-client.mjs',
  'admin/fixvox-web/pi-workspace-broker.mjs',
  'admin/fixvox-web/constelaciones-read-adapter.mjs',
  'admin/fixvox-web/constelaciones-read-broker.mjs',
  'admin/fixvox-web/pi-release-broker.mjs',
  'admin/fixvox-web/pi-release-broker-client.mjs',
  'admin/fixvox-web/pi-release-git-runner.mjs',
  'admin/fixvox-web/pi-release-service.mjs',
  'admin/fixvox-web/pi-admin-deploy-broker.mjs',
  'admin/fixvox-web/pi-admin-deploy-operations.mjs',
  'admin/fixvox-web/pi-admin-deploy-service.mjs',
  'admin/fixvox-web/pi-admin-deploy-client.mjs',
  'admin/fixvox-web/run-isolated-pi.sh',
  'admin/fixvox-web/systemd/fixvox-workspace-broker.service',
  'admin/fixvox-web/systemd/fixvox-constelaciones-read-broker.service',
  'scripts/pi-remote-agent-apply.sh'
)
$nodeFiles = $manifest | Where-Object { $_.EndsWith('.mjs') }

function Invoke-Checked {
  param([Parameter(Mandatory)] [string]$FilePath, [string[]]$ArgumentList = @())
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $FilePath" }
}

function Invoke-Remote([string]$Command) {
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

foreach ($file in $manifest) {
  if (-not (Test-Path (Join-Path $repo $file))) { throw "Missing rollout file: $file" }
}
foreach ($file in $nodeFiles) {
  Invoke-Checked -FilePath 'node' -ArgumentList @('--check', (Join-Path $repo $file))
}
Invoke-Checked -FilePath 'bash' -ArgumentList @('-n', (Join-Path $repo 'scripts/pi-remote-agent-apply.sh'))

if (-not $ConfirmProduction) {
  Write-Host 'DRY RUN: no VPS files, services, mirrors, credentials, or feature flags were changed.' -ForegroundColor Cyan
  Write-Host "Runtime files: $($manifest.Count); sync mirrors: $([bool]$SyncMirrors)"
  $manifest | ForEach-Object { Write-Host "  $_" }
  exit 0
}

try {
  Invoke-Checked -FilePath $windowsTar -ArgumentList (@('-czf', $localBundle, '-C', $repo) + $manifest)
  $bundleHash = Get-Sha256 $localBundle
  Invoke-Remote "rm -rf '$remoteStage' '$remoteBundle'; mkdir -p '$remoteStage'"
  $uploaded = $false
  for ($attempt = 1; $attempt -le $UploadAttempts; $attempt++) {
    & scp $localBundle "${remoteHost}:$remoteBundle"
    if ($LASTEXITCODE -eq 0) { $uploaded = $true; break }
    if ($attempt -lt $UploadAttempts) { Start-Sleep -Seconds (2 * $attempt) }
  }
  if (-not $uploaded) { throw "Bundle upload failed after $UploadAttempts attempts." }
  Invoke-Remote "echo '$bundleHash  $remoteBundle' | sha256sum -c -; tar -xzf '$remoteBundle' -C '$remoteStage'"
  $sync = if ($SyncMirrors) { '1' } else { '0' }
  Invoke-Remote "bash '$remoteStage/scripts/pi-remote-agent-apply.sh' '$remoteStage' '$runId' '$sync'"
  Write-Host "Pi remote-agent rollout complete. Run: $runId; mirror sync: $SyncMirrors" -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $localBundle -Force -ErrorAction SilentlyContinue
  try { Invoke-Remote "rm -rf '$remoteStage' '$remoteBundle'" } catch { }
}
