param(
  [switch]$ConfirmProduction,
  [ValidateRange(1, 10)]
  [int]$UploadAttempts = 3
)

$ErrorActionPreference = 'Stop'

if (-not $ConfirmProduction) {
  throw 'Production deploy is gated. Re-run with -ConfirmProduction only after explicit approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$adminRoot = Join-Path $repo 'admin/fixvox-web'
$files = @(
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
  'omp-admin-deploy-client.mjs',
  'public/app.js',
  'public/styles.css'
)
$remoteHost = 'vps'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteStage = "/tmp/fixvox-admin-deploy-$runId"
$remoteBundle = "$remoteStage/bundle.tar.gz"
$localBundle = Join-Path ([IO.Path]::GetTempPath()) "fixvox-admin-deploy-$runId.tar.gz"
$windowsTar = Join-Path $env:SystemRoot 'System32/tar.exe'
$quotedFiles = ($files | ForEach-Object { "'$_'" }) -join ' '
$remoteChecks = ($files | Where-Object { $_.EndsWith('.mjs') -or $_.EndsWith('.js') } | ForEach-Object { "node --check '$remoteStage/content/$_'" }) -join '; '

function Invoke-Checked {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [string[]]$ArgumentList = @()
  )
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $FilePath" }
}

function Get-CheckedOutput {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [string[]]$ArgumentList = @()
  )
  $output = & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $FilePath" }
  return ($output | Out-String).Trim()
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

foreach ($file in $files) {
  if (-not (Test-Path (Join-Path $adminRoot $file) -PathType Leaf)) { throw "Missing deploy file: $file" }
}

$sourceHash = Get-CheckedOutput 'git' @('-C', $repo, 'rev-parse', 'HEAD')
$branch = Get-CheckedOutput 'git' @('-C', $repo, 'rev-parse', '--abbrev-ref', 'HEAD')
$dirty = Get-CheckedOutput 'git' @('-C', $repo, 'status', '--porcelain=v1', '--untracked-files=all')
if ($sourceHash -notmatch '^[a-f0-9]{40}$' -or $branch -ne 'main' -or $dirty) {
  throw 'Admin deploy requires the exact clean local main commit used by the release broker.'
}

try {
  Invoke-Checked -FilePath $windowsTar -ArgumentList (@('-czf', $localBundle, '-C', $adminRoot) + $files)
  $bundleHash = Get-Sha256 $localBundle
  Invoke-Remote "rm -rf '$remoteStage'; mkdir -p '$remoteStage/content'"
  $uploaded = $false
  for ($attempt = 1; $attempt -le $UploadAttempts; $attempt++) {
    & scp $localBundle "${remoteHost}:$remoteBundle"
    if ($LASTEXITCODE -eq 0) { $uploaded = $true; break }
    if ($attempt -lt $UploadAttempts) { Start-Sleep -Seconds (2 * $attempt) }
  }
  if (-not $uploaded) { throw "Bundle upload failed after $UploadAttempts attempts." }

  Invoke-Remote "echo '$bundleHash  $remoteBundle' | sha256sum -c -; tar -xzf '$remoteBundle' -C '$remoteStage/content'; $remoteChecks; (cd '$remoteStage/content' && sha256sum $quotedFiles > manifest.sha256 && sha256sum -c manifest.sha256)"
  Invoke-Remote "sudo -u fixvox-release env OMP_ADMIN_DEPLOY_SOCKET=/run/fixvox-release/admin-deploy.sock /usr/bin/node /opt/fixvox-agent/runtime/omp-admin-deploy-client.mjs --source-hash '$sourceHash'"
  Write-Host "Admin deploy broker accepted source $sourceHash after verified staging." -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $localBundle -Force -ErrorAction SilentlyContinue
  try { Invoke-Remote "rm -rf '$remoteStage'" } catch { }
}
