param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$RemoteDebugPort = 9355,
  [int]$StartupTimeoutSeconds = 90,
  [switch]$KeepAlive,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/audio-mute-cues-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$reportPath = Join-Path $runRoot 'report.json'
$startedAt = Get-Date

$report = [ordered]@{
  check = 'audio-mute-cues-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  status = 'planned'
  approved = [ordered]@{ desktopSideEffects = [bool]$AllowDesktopSideEffects }
  artifacts = [ordered]@{ report = $reportPath }
  redaction = 'No raw audio, transcript, selected text, secrets, or target app contents are stored.'
  scope = @(
    'Launch Tauri with CDP enabled.',
    'Verify host user preferences can enable muteOutputDuringRecording and dictationSoundCuesEnabled.',
    'Exercise start/cancel as the safe restore path. Real OS mute is fail-closed until the Windows CoreAudio backend is implemented.',
    'Record only redacted booleans/status strings.'
  )
}

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Get-CdpPages() {
  $pages = curl.exe -s "http://127.0.0.1:$RemoteDebugPort/json/list" | ConvertFrom-Json
  if ($pages -is [Array]) { return $pages }
  return @($pages)
}

function Wait-ForPage([scriptblock]$Predicate, [int]$TimeoutSeconds = $StartupTimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      foreach ($candidate in (Get-CdpPages)) {
        if (& $Predicate $candidate) { return $candidate }
      }
    } catch {
      # Wait for WebView2 remote debugging endpoint.
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'CDP page wait timed out.'
}

function Invoke-CdpExpression([object]$Page, [string]$Expression) {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Expression))
  $result = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $Page.webSocketDebuggerUrl "base64:$encoded"
  if ($LASTEXITCODE -ne 0) { throw "CDP expression failed: $Expression" }
  return [string]$result
}

function Invoke-Tauri([object]$Page, [string]$Command, [string]$ArgsJson = '{}') {
  $expr = "(async()=>{ const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke; if(!invoke) throw new Error('tauri_invoke_unavailable'); return JSON.stringify(await invoke('$Command', $ArgsJson)); })()"
  return Invoke-CdpExpression $Page $expr | ConvertFrom-Json
}

if (-not $AllowDesktopSideEffects) {
  $report.status = 'blocked-needs-approval'
  $report.error = 'Audio mute/cues smoke launches Tauri and touches host preferences/capture lifecycle. Re-run with -AllowDesktopSideEffects after explicit local approval.'
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Output "Audio mute/cues smoke plan: $reportPath"
  throw $report.error
}

$existingBefore = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

try {
  $report.status = 'running'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $launcherArgs = @('run', 'tauri:dev:hidden', '--', '-RunId', $RunId)
  if ($StopExisting) { $launcherArgs += '-StopExisting' }
  $launchRaw = & npm @launcherArgs
  $report.launcherOutputLines = @($launchRaw).Count

  $main = Wait-ForPage { param($p) $p.url -eq 'http://127.0.0.1:1420/' }
  $before = Invoke-Tauri $main 'get_user_preferences'
  $next = $before | ConvertTo-Json -Depth 10 | ConvertFrom-Json
  $next.muteOutputDuringRecording = $true
  $next.dictationSoundCuesEnabled = $true
  $saved = Invoke-Tauri $main 'set_user_preferences' ($next | ConvertTo-Json -Compress -Depth 10 | ForEach-Object { "{ preferences: $_ }" })

  $report.status = 'passed-preference-wiring'
  $report.preferences = [ordered]@{
    beforeMute = [bool]$before.muteOutputDuringRecording
    beforeCues = [bool]$before.dictationSoundCuesEnabled
    savedMute = [bool]$saved.muteOutputDuringRecording
    savedCues = [bool]$saved.dictationSoundCuesEnabled
  }
  $report.expectedHostEvidence = [ordered]@{
    outputMute = 'Capture metadata includes outputMute redacted evidence; Windows currently records windows_coreaudio_backend_pending until native backend lands.'
    cues = 'Cue requests are queued/skipped/failed non-blocking in renderer; playback failures do not alter dictation outcome.'
  }
  $report.manualFollowUp = @(
    'Optional: start/cancel a short recording and inspect app/debug output for outputMute redacted status.',
    'Optional: enable a future playback backend and verify audible start/stop/success/error cues.'
  )
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
  Write-Output "Audio mute/cues smoke report: $reportPath"
}
