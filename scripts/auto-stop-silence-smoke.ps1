param(
  [switch]$AllowMicrophone,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [switch]$StopExisting,
  [switch]$KeepAlive
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/auto-stop-silence-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$reportPath = Join-Path $runRoot 'report.json'
$startedAt = Get-Date

$report = [ordered]@{
  check = 'auto-stop-silence-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  status = 'planned'
  approved = [ordered]@{ microphone = [bool]$AllowMicrophone }
  artifacts = [ordered]@{ report = $reportPath }
  redaction = 'No raw audio, transcript, selected text, or target app contents are stored.'
  expectedManualSteps = @(
    'Open Settings and enable Auto-stop after silence.',
    'Start dictation from the dock or dictation key.',
    'Speak a short non-sensitive phrase, then stay silent longer than the configured silence duration.',
    'Verify recording stops without pressing manual stop and proceeds to normal review/delivery path.',
    'Repeat with a short pause shorter than the configured silence duration and verify recording continues until manual stop.'
  )
  expectedEvidence = [ordered]@{
    autoStop = 'Recording stops within configured silence duration + 500 ms tolerance.'
    shortPause = 'Short pause does not stop recording.'
    disabled = 'When preference is disabled, silence does not stop recording.'
  }
}

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

if (-not $AllowMicrophone) {
  $report.status = 'blocked-needs-approval'
  $report.error = 'Auto-stop live smoke uses the local microphone and launches Tauri. Re-run with -AllowMicrophone after explicit local approval.'
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Output "Auto-stop silence smoke plan: $reportPath"
  throw $report.error
}

$existingBefore = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

try {
  $report.status = 'running-manual-observation-required'
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath

  $launcherArgs = @('run', 'tauri:dev:hidden', '--', '-RunId', $RunId)
  if ($StopExisting) { $launcherArgs += '-StopExisting' }
  $launchRaw = & npm @launcherArgs
  $report.launcherOutputLines = @($launchRaw).Count
  $report.status = 'ready-for-manual-observation'
  $report.notes = 'Tauri app launched. Complete expectedManualSteps and update this report or capture separate redacted evidence under the same artifact directory.'
} catch {
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  throw
} finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  if (-not $KeepAlive) {
    $currentApps = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue)
    foreach ($app in $currentApps) {
      if ($existingBefore -notcontains $app.Id -or $StopExisting) {
        Stop-Tree ([int]$app.Id)
      }
    }
  }
  Write-Output "Auto-stop silence smoke report: $reportPath"
}
