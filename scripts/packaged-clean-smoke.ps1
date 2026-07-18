param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$ExePath = '',
  [int]$MinimumRunSeconds = 8
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Packaged clean smoke launches the release Tauri exe with isolated app data. Re-run with -AllowDesktopSideEffects after local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/release/packaged-clean-smoke/$RunId"
$workRoot = Join-Path $runRoot 'work'
$appDataRoot = Join-Path $runRoot 'appdata'
$localAppDataRoot = Join-Path $runRoot 'localappdata'
$reportPath = Join-Path $runRoot 'report.json'
$outLog = Join-Path $runRoot 'packaged.out.log'
$errLog = Join-Path $runRoot 'packaged.err.log'
New-Item -ItemType Directory -Force -Path $workRoot, $appDataRoot, $localAppDataRoot | Out-Null

if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $ExePath = Join-Path $repo 'src-tauri/target/release/dictation-tauri.exe'
}
if (-not (Test-Path $ExePath)) {
  throw "Release executable not found: $ExePath. Run npm run release:windows or npm run tauri:build first."
}
$ExePath = (Resolve-Path $ExePath).Path

$report = [ordered]@{
  ok = $false
  runId = $RunId
  exePath = $ExePath
  isolatedAppData = $appDataRoot
  isolatedLocalAppData = $localAppDataRoot
  workingDirectory = $workRoot
  startedAt = (Get-Date).ToString('o')
  checks = @()
  gotchas = @('Do not enable WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS for this packaged smoke; on this host it makes packaged WebView setup fail before app setup completes.')
  redacted = $true
}

function Add-Check([string]$Name, [bool]$Ok, $Detail = $null) {
  $script:report.checks += [ordered]@{ name = $Name; ok = $Ok; detail = $Detail }
  if (-not $Ok) { throw "Check failed: $Name" }
}

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Wait-ForFile([string]$Path, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $Path) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-ForLogPattern([string]$Path, [string]$Pattern, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ((Read-TextIfExists $Path) -match $Pattern) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Read-TextIfExists([string]$Path) {
  if (Test-Path $Path) { return (Get-Content -Raw -Path $Path -ErrorAction SilentlyContinue) }
  return ''
}

$tauriProc = $null
$previousEnv = @{}
$envKeysToOverride = @(
  'APPDATA','LOCALAPPDATA','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','DICTATION_TAURI_DICTATION_KEY',
  'GROQ_API_KEY','GROQ-API-KEY','FIXVOX_DEVICE_ID','FIXVOX_INSTALL_ID','FIXVOX_STT_MODEL','FIXVOX_STT_LANGUAGE'
)
try {
  foreach ($key in $envKeysToOverride) { $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  $env:APPDATA = $appDataRoot
  $env:LOCALAPPDATA = $localAppDataRoot
  # Keep packaged smoke close to user launch. Remote-debugging WebView2 is intentionally disabled here.
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  # Avoid Alt+Space interception during automated smoke.
  $env:DICTATION_TAURI_DICTATION_KEY = 'Ctrl+Shift+F9'
  # Prove first-run does not depend on inherited BYOK/device identity variables.
  Remove-Item Env:GROQ_API_KEY -ErrorAction SilentlyContinue
  Remove-Item 'Env:GROQ-API-KEY' -ErrorAction SilentlyContinue
  Remove-Item Env:FIXVOX_DEVICE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:FIXVOX_INSTALL_ID -ErrorAction SilentlyContinue
  Remove-Item Env:FIXVOX_STT_MODEL -ErrorAction SilentlyContinue
  Remove-Item Env:FIXVOX_STT_LANGUAGE -ErrorAction SilentlyContinue

  $tauriProc = Start-Process -FilePath $ExePath `
    -WorkingDirectory $workRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru
  $report.pid = $tauriProc.Id

  Start-Sleep -Seconds $MinimumRunSeconds
  $report.processAfterWait = [ordered]@{ hasExited = $tauriProc.HasExited; exitCode = if ($tauriProc.HasExited) { $tauriProc.ExitCode } else { $null } }
  Add-Check 'packaged exe stays running past startup' (-not $tauriProc.HasExited) $report.processAfterWait

  $statePath = Join-Path $appDataRoot 'dictation-tauri/fixvox-device-state.json'
  Add-Check 'device state appears under isolated APPDATA' (Wait-ForFile $statePath 30) $statePath
  $stateJson = Get-Content -Raw -Path $statePath | ConvertFrom-Json
  $report.persistedState = [ordered]@{
    path = $statePath
    hasInstallId = -not [string]::IsNullOrWhiteSpace($stateJson.installId)
    hasDeviceId = -not [string]::IsNullOrWhiteSpace($stateJson.deviceId)
    lastRegisterOk = $stateJson.lastRegisterOk
    hasPolicy = -not [string]::IsNullOrWhiteSpace($stateJson.policyId)
  }
  Add-Check 'clean first-run persists install id' ($report.persistedState.hasInstallId) $report.persistedState
  Add-Check 'clean first-run has no device id before activation' (-not $report.persistedState.hasDeviceId) $report.persistedState

  $dockHidden = Wait-ForLogPattern $errLog '\[dictation-tauri\]\[dock\] hide ok' 30
  $settingsShown = Wait-ForLogPattern $errLog '\[dictation-tauri\]\[settings\] show ok' 30
  $errText = Read-TextIfExists $errLog
  $report.logSummary = [ordered]@{
    stderrLength = $errText.Length
    containsPanic = $errText -match 'panicked|Failed to setup app'
    containsDockHidden = $dockHidden
    containsSettingsShown = $settingsShown
    containsExternalWork = $errText -match 'FIXVOX_REQUEST|preflight request|transcrib|clipboard|paste_observed|poll_fixvox_cloud_login'
  }
  Add-Check 'packaged stderr has no startup panic' (-not $report.logSummary.containsPanic) $report.logSummary
  Add-Check 'clean account-first launch hides the dock' ($report.logSummary.containsDockHidden) $report.logSummary
  Add-Check 'clean account-first launch opens Settings' ($report.logSummary.containsSettingsShown) $report.logSummary
  Add-Check 'clean account-first launch performs no provider, login, or clipboard work' (-not $report.logSummary.containsExternalWork) $report.logSummary

  Add-Check 'working dir does not contain dotenv secrets' (-not (Test-Path (Join-Path $workRoot '.env'))) $workRoot

  $report.ok = $true
} finally {
  if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree ([int]$tauriProc.Id) }
  foreach ($key in $envKeysToOverride) {
    if ($null -eq $previousEnv[$key]) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
    else { [Environment]::SetEnvironmentVariable($key, [string]$previousEnv[$key], 'Process') }
  }
  $report.finishedAt = (Get-Date).ToString('o')
  New-Item -ItemType Directory -Force -Path (Split-Path $reportPath -Parent) | Out-Null
  $report | ConvertTo-Json -Depth 16 | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host ($report | ConvertTo-Json -Depth 8)
}
