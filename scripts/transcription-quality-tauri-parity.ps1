param(
  [switch]$AllowProviderCall,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [ValidateSet(
    'jp-quality-bilingual-technical-20260812',
    'jp-quality-punctuation-list-20260812',
    'jp-quality-model-comparison-20260812'
  )]
  [string]$SampleId = 'jp-quality-bilingual-technical-20260812',
  [decimal]$MaxCostUsd = 0.001,
  [int]$RemoteDebugPort = 9356,
  [int]$StartupTimeoutSeconds = 90,
  [switch]$KeepAlive,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

if (-not $AllowProviderCall) {
  throw 'Tauri parity smoke requires explicit approval for exactly one managed STT provider call. Re-run with -AllowProviderCall after approval.'
}
if ($MaxCostUsd -ne [decimal]0.001) {
  throw 'Tauri parity smoke requires the exact declared cost cap: -MaxCostUsd 0.001.'
}
if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
  throw 'RunId may contain only letters, digits, dot, underscore, and hyphen.'
}
if ($RemoteDebugPort -lt 1024 -or $RemoteDebugPort -gt 65535) {
  throw "RemoteDebugPort must be between 1024 and 65535, got $RemoteDebugPort."
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceRelative = "artifacts/transcription-quality/corpus/private/audio/$SampleId.wav"
$sourcePath = Join-Path $repo $sourceRelative
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Approved sample audio is missing: $SampleId."
}

$stagedRelative = "artifacts/microphone-capture/audio/tauri-parity-$RunId.wav"
$stagedPath = Join-Path $repo $stagedRelative
$runRoot = Join-Path $repo "artifacts/transcription-quality/$RunId"
$reportPath = Join-Path $runRoot 'tauri-parity.json'
$existingBefore = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$previousWebViewArgsPresent = Test-Path Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$previousWebViewArgs = if ($previousWebViewArgsPresent) { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS } else { $null }
$startedAt = Get-Date
$report = [ordered]@{
  schemaVersion = 1
  runId = $RunId
  sampleId = $SampleId
  status = 'planned'
  authorization = [ordered]@{
    providerCalls = 1
    maxCostUsd = [decimal]0.001
    explicit = [bool]$AllowProviderCall
  }
  request = [ordered]@{
    mode = 'real'
    route = 'tauri:transcribe_captured_audio'
    language = 'auto'
    postprocess = 'off'
    delivery = $false
  }
  redacted = $true
}

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $process = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($process) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Get-CdpPages() {
  $pages = curl.exe -s "http://127.0.0.1:$RemoteDebugPort/json/list" | ConvertFrom-Json
  if ($pages -is [Array]) { return $pages }
  return @($pages)
}

function Wait-ForMainPage() {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      foreach ($candidate in (Get-CdpPages)) {
        if ($candidate.url -eq 'http://127.0.0.1:1420/' -and $candidate.webSocketDebuggerUrl) {
          return $candidate
        }
      }
    } catch {
      # WebView2 CDP is not ready yet.
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'Tauri WebView2 CDP page wait timed out.'
}

function Invoke-CdpExpression([object]$Page, [string]$Expression) {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Expression))
  $previousOutputEncoding = [Console]::OutputEncoding
  try {
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    $result = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $Page.webSocketDebuggerUrl "base64:$encoded"
    if ($LASTEXITCODE -ne 0) { throw 'Tauri CDP expression failed.' }
    return [string]$result
  } finally {
    [Console]::OutputEncoding = $previousOutputEncoding
  }
}

function Get-TextSha256([string]$Text) {
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

try {
  New-Item -ItemType Directory -Force -Path (Split-Path $stagedPath) | Out-Null
  New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $stagedPath

  $report.status = 'running'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $launcherArgs = @('run', 'tauri:dev:hidden', '--', '-RunId', $RunId)
  if ($StopExisting) { $launcherArgs += '-StopExisting' }
  $launchRaw = & npm @launcherArgs
  $report.launcherOutputLines = @($launchRaw).Count

  $page = Wait-ForMainPage
  $request = [ordered]@{
    runId = $RunId
    audioPath = $stagedRelative
    mode = 'real'
    allowProviderCall = $true
    postProcess = @{ enabled = $false }
  }
  $requestJson = $request | ConvertTo-Json -Depth 6 -Compress
  $expression = "(async()=>{ const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke; if(!invoke) throw new Error('tauri_invoke_unavailable'); return JSON.stringify(await invoke('transcribe_captured_audio', { request: $requestJson })); })()"
  $outcome = Invoke-CdpExpression $page $expression | ConvertFrom-Json

  $text = if ($outcome.status -eq 'ok') { [string]$outcome.text } else { '' }
  $transcriptSha256 = if ($text.Length -gt 0) { Get-TextSha256 $text } else { $null }
  $report.outcome = [ordered]@{
    status = [string]$outcome.status
    provider = if ($outcome.provider) { [string]$outcome.provider } else { $null }
    model = if ($outcome.model) { [string]$outcome.model } else { $null }
    latencyMs = if ($null -ne $outcome.latencyMs) { [uint64]$outcome.latencyMs } else { $null }
    transcriptLength = $text.Length
    transcriptSha256 = $transcriptSha256
    reportPath = if ($outcome.reportPath) { [string]$outcome.reportPath } else { $null }
    transcriptPath = if ($outcome.transcriptPath) { [string]$outcome.transcriptPath } else { $null }
    audioPrep = $outcome.audioPrep
    postProcess = $outcome.postProcess
    fixvoxMetadata = $outcome.fixvoxMetadata
    errorCode = if ($outcome.error) { [string]$outcome.error.code } else { $null }
    redacted = [bool]$outcome.redacted
  }
  $report.status = if ($outcome.status -eq 'ok') { 'passed' } else { 'failed' }
  if ($outcome.status -ne 'ok') {
    throw "Tauri transcription failed with status '$($outcome.status)'."
  }
} catch {
  if ($report.status -ne 'passed') {
    $report.status = 'failed'
    $report.error = $_.Exception.Message
  }
  throw
} finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report.durationMs = [math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
  New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
  $report | ConvertTo-Json -Depth 16 | Set-Content -Encoding UTF8 -Path $reportPath
  Remove-Item -LiteralPath $stagedPath -Force -ErrorAction SilentlyContinue

  if ($previousWebViewArgsPresent) {
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebViewArgs
  } else {
    Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  }

  if (-not $KeepAlive) {
    $currentApps = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue)
    foreach ($app in $currentApps) {
      if ($existingBefore -notcontains $app.Id -or $StopExisting) {
        Stop-Tree ([int]$app.Id)
      }
    }
  }
  Write-Output "Tauri parity smoke: status=$($report.status); report=artifacts/transcription-quality/$RunId/tauri-parity.json"
}
