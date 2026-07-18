param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$StartupTimeoutSeconds = 80,
  [int]$RemoteDebugPort = 9345,
  [switch]$KeepAlive
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'This smoke starts an isolated Tauri WebView2 window and captures its rendered onboarding surface. Re-run with -AllowDesktopSideEffects after local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/standard-product-ux-redesign/batch-7-final/tauri-$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$reportPath = Join-Path $runRoot 'report.json'
$screenshotPath = Join-Path $runRoot 'tauri-onboarding-welcome.png'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
$tauriProc = $null
$profileRoot = Join-Path $runRoot 'isolated-profile'
$envKeys = @('APPDATA', 'LOCALAPPDATA')
$previousEnv = @{}

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $process = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($process) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Add-Check([string]$Name, [bool]$Passed, [hashtable]$Details = @{}) {
  $report.checks += [ordered]@{ name = $Name; passed = $Passed; details = $Details }
  if (-not $Passed) { throw "Check failed: $Name" }
}

function Wait-ForCdpPage([int]$Port, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $pages = @(Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2)
      $page = $pages | Where-Object { $_.url -like 'http://127.0.0.1:1420/*' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
      if ($page) { return $page }
    } catch {
      # WebView2 remote debugging starts after the native shell.
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Tauri WebView2 CDP page was not available on port $Port before timeout."
}

$report = [ordered]@{
  startedAt = (Get-Date).ToString('o')
  status = 'running'
  redacted = $true
  checks = @()
  artifacts = [ordered]@{
    screenshot = $screenshotPath
    report = $reportPath
    tauriStdout = $tauriOutLog
    tauriStderr = $tauriErrLog
  }
  notes = 'The screenshot is captured via the running Tauri WebView2 CDP target, not PrintWindow. It records only synthetic Spanish-first onboarding copy.'
}

try {
  foreach ($key in $envKeys) { $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  $env:APPDATA = Join-Path $profileRoot 'appdata'
  $env:LOCALAPPDATA = Join-Path $profileRoot 'localappdata'
  New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA | Out-Null

  if (Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue) {
    throw 'An existing dictation-tauri process is running. It was left untouched; retry after it exits to keep this capture isolated.'
  }

  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $tauriProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'tauri:dev') -WorkingDirectory $repo -RedirectStandardOutput $tauriOutLog -RedirectStandardError $tauriErrLog -PassThru
  $page = Wait-ForCdpPage $RemoteDebugPort $StartupTimeoutSeconds
  $report.cdp = [ordered]@{ port = $RemoteDebugPort; initialUrl = $page.url }
  Add-Check 'Tauri WebView2 CDP page is available' ([bool]$page.webSocketDebuggerUrl) $report.cdp

  $captureResult = node (Join-Path $repo 'scripts/tauri-onboarding-capture.mjs') $RemoteDebugPort $screenshotPath
  if ($LASTEXITCODE -ne 0) { throw 'Tauri onboarding screenshot capture failed.' }
  $capture = $captureResult | ConvertFrom-Json
  $report.capture = $capture
  Add-Check 'Tauri rendered the redacted Welcome surface' ($capture.welcomeVisible -eq $true -and $capture.primaryVisible -eq $true) @{ width = $capture.width; height = $capture.height }
  Add-Check 'Tauri viewport fits the onboarding surface' ($capture.width -ge 700 -and $capture.height -ge 500) @{ width = $capture.width; height = $capture.height }
  Add-Check 'WebView2 screenshot artifact is non-empty' ((Test-Path $screenshotPath) -and (Get-Item $screenshotPath).Length -gt 5000) @{ bytes = if (Test-Path $screenshotPath) { (Get-Item $screenshotPath).Length } else { 0 } }
  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new([string]$screenshotPath)
  try {
    $sampleStepX = [Math]::Max(1, [Math]::Floor($bitmap.Width / 16))
    $sampleStepY = [Math]::Max(1, [Math]::Floor($bitmap.Height / 16))
    $sampleColors = @()
    for ($x = 0; $x -lt $bitmap.Width; $x += $sampleStepX) {
      for ($y = 0; $y -lt $bitmap.Height; $y += $sampleStepY) {
        $sampleColors += $bitmap.GetPixel($x, $y).ToArgb()
      }
    }
    $imageFacts = @{ width = $bitmap.Width; height = $bitmap.Height; sampledColors = @($sampleColors | Select-Object -Unique).Count }
  } finally {
    $bitmap.Dispose()
  }
  Add-Check 'WebView2 screenshot is a complete non-black rendered image' ($imageFacts.width -ge 700 -and $imageFacts.height -ge 500 -and $imageFacts.sampledColors -gt 1) $imageFacts

  $report.status = 'passed'
} catch {
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  throw
} finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  if (-not $KeepAlive -and $tauriProc -and -not $tauriProc.HasExited) { Stop-Tree $tauriProc.Id }
  foreach ($key in $envKeys) {
    [Environment]::SetEnvironmentVariable($key, $previousEnv[$key], 'Process')
  }
  Write-Output "Tauri onboarding visual smoke report: $reportPath"
}
