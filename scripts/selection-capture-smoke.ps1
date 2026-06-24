param(
  [switch]$AllowSelectedTextCapture,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$SelectedText = 'Synthetic selected text for UIA smoke.',
  [int]$StartupTimeoutSeconds = 80,
  [int]$InitialDelaySeconds = 12,
  [int]$RemoteDebugPort = 9341
)

$ErrorActionPreference = 'Stop'

if (-not $AllowSelectedTextCapture) {
  throw 'Selection capture smoke opens a controlled desktop target, selects synthetic text, launches Tauri, and invokes capture_selection_context through product IPC. Re-run with -AllowSelectedTextCapture only after explicit approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/selection-capture-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$targetScript = Join-Path $runRoot 'SelectionTargetFixture.ps1'
$targetStatePath = Join-Path $runRoot 'target-state.json'
$reportPath = Join-Path $runRoot 'report.json'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
# Keep live target files outside the repo: Vite dev watches the workspace and can crash
# on frequently-written artifact files on Windows (EBUSY from fs.watch).
$liveRoot = Join-Path $env:TEMP "dictation-tauri-selection-capture-smoke\$RunId"
New-Item -ItemType Directory -Force -Path $liveRoot | Out-Null
$selectedTextPath = Join-Path $liveRoot 'selected-text.txt'
$targetLiveStatePath = Join-Path $liveRoot 'target-state.json'
[System.IO.File]::WriteAllText($selectedTextPath, $SelectedText, [System.Text.UTF8Encoding]::new($false))
$startedAt = Get-Date
$targetProc = $null
$tauriProc = $null

# Avoid stale dev windows from previous failed runs being mistaken for this run.
Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'powershell' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'Selection Capture Target *' } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SelectionCaptureSmokeWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Get-ForegroundTitle() {
  $hwnd = [SelectionCaptureSmokeWin32]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][SelectionCaptureSmokeWin32]::GetWindowText($hwnd, $sb, $sb.Capacity)
  return [ordered]@{ hwnd = $hwnd.ToInt64(); title = $sb.ToString() }
}

function Focus-WindowWithAttach([IntPtr]$Hwnd) {
  $SW_RESTORE = 9
  [void][SelectionCaptureSmokeWin32]::ShowWindow($Hwnd, $SW_RESTORE)
  $foreground = [SelectionCaptureSmokeWin32]::GetForegroundWindow()
  [uint32]$targetPid = 0
  [uint32]$foregroundPid = 0
  $currentThread = [SelectionCaptureSmokeWin32]::GetCurrentThreadId()
  $targetThread = [SelectionCaptureSmokeWin32]::GetWindowThreadProcessId($Hwnd, [ref]$targetPid)
  $foregroundThread = if ($foreground -ne [IntPtr]::Zero) { [SelectionCaptureSmokeWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) } else { 0 }
  $attachedTarget = $false
  $attachedForeground = $false
  try {
    if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
      $attachedTarget = [SelectionCaptureSmokeWin32]::AttachThreadInput($currentThread, $targetThread, $true)
    }
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and $foregroundThread -ne $targetThread) {
      $attachedForeground = [SelectionCaptureSmokeWin32]::AttachThreadInput($currentThread, $foregroundThread, $true)
    }
    [void][SelectionCaptureSmokeWin32]::BringWindowToTop($Hwnd)
    [void][SelectionCaptureSmokeWin32]::SetForegroundWindow($Hwnd)
    [void][SelectionCaptureSmokeWin32]::SetFocus($Hwnd)
  } finally {
    if ($attachedForeground) { [void][SelectionCaptureSmokeWin32]::AttachThreadInput($currentThread, $foregroundThread, $false) }
    if ($attachedTarget) { [void][SelectionCaptureSmokeWin32]::AttachThreadInput($currentThread, $targetThread, $false) }
  }
}

function Wait-ForWindowByTitle([string]$TitleLike, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like $TitleLike } | Select-Object -First 1
    if ($proc) { return $proc }
    Start-Sleep -Milliseconds 500
  }
  throw "Window not found before timeout: $TitleLike"
}

function Wait-ForTauriWindow([int]$TimeoutSeconds = 80) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($tauriProc -and $tauriProc.HasExited) {
      throw "tauri dev exited early with code $($tauriProc.ExitCode). See $tauriOutLog and $tauriErrLog"
    }
    $appProcess = Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1
    if ($appProcess) { return $appProcess }
    Start-Sleep -Milliseconds 500
  }
  throw 'dictation-tauri window was not available before timeout.'
}

function Wait-ForCdpPage([int]$Port, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
      $page = $pages | Where-Object { $_.url -eq 'http://127.0.0.1:1420/' } | Select-Object -First 1
      if ($page) { return $page }
    } catch {
      # wait for WebView2 remote debugging endpoint
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Tauri WebView CDP page was not available on port $Port before timeout."
}

function Get-Sha256Hex([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = $sha.ComputeHash($bytes)
    return (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally {
    $sha.Dispose()
  }
}

Set-Content -Path $targetScript -Encoding UTF8 -Value @'
param([string]$SelectedTextPath, [string]$RunId, [string]$StatePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$SelectedText = Get-Content -Raw -Path $SelectedTextPath
$app = New-Object System.Windows.Application
$window = New-Object System.Windows.Window
$window.Title = "Selection Capture Target $RunId"
$window.Width = 780
$window.Height = 300
$window.Left = 90
$window.Top = 130
$window.Topmost = $true
$textBox = New-Object System.Windows.Controls.TextBox
$textBox.Name = 'selectionCaptureTargetBox'
$textBox.AcceptsReturn = $true
$textBox.AcceptsTab = $true
$textBox.TextWrapping = 'Wrap'
$textBox.FontSize = 18
$textBox.Margin = '16'
$textBox.Text = $SelectedText
$window.Content = $textBox
function Write-State {
  $payload = [ordered]@{
    runId = $RunId
    textLength = $SelectedText.Length
    selectionStart = $textBox.SelectionStart
    selectionLength = $textBox.SelectionLength
    focused = $textBox.IsKeyboardFocused
    updatedAt = (Get-Date).ToString('o')
  }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -Path $StatePath
}
$window.Add_ContentRendered({
  [void]$textBox.Focus()
  $textBox.Select(0, $SelectedText.Length)
  Write-State
  Start-Sleep -Milliseconds 250
  $window.Topmost = $false
})
$window.Add_Activated({
  [void]$textBox.Focus()
  $textBox.Select(0, $SelectedText.Length)
  Write-State
})
[void]$app.Run($window)
'@

$report = [ordered]@{
  check = 'selection-capture-uia-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  root = $runRoot
  approved = [ordered]@{ selectedTextCapture = [bool]$AllowSelectedTextCapture }
  selectedTextFixture = [ordered]@{
    synthetic = $true
    expectedLength = $SelectedText.Length
    expectedSha256 = Get-Sha256Hex $SelectedText
    rawTextRecorded = $false
  }
  checks = @()
  warnings = @()
  errors = @()
  artifacts = [ordered]@{
    report = $reportPath
    targetState = $targetStatePath
    tauriStdout = $tauriOutLog
    tauriStderr = $tauriErrLog
  }
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null, [bool]$NonGating = $false) {
  $entry = [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  if ($NonGating) { $entry.nonGating = $true }
  $script:report.checks += $entry
  if (-not $Pass -and -not $NonGating) { throw "Selection capture smoke check failed: $Name" }
}

try {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $tauriProc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run','tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $tauriOutLog `
    -RedirectStandardError $tauriErrLog `
    -PassThru

  $tauriWindow = Wait-ForTauriWindow $StartupTimeoutSeconds
  $report.tauri = [ordered]@{ pid = $tauriWindow.Id; hwnd = $tauriWindow.MainWindowHandle.ToInt64(); title = $tauriWindow.MainWindowTitle }
  Add-Check 'tauri dictation dock launched' ($tauriWindow.MainWindowHandle -ne 0) $report.tauri

  $cdpPage = Wait-ForCdpPage $RemoteDebugPort $StartupTimeoutSeconds
  $report.cdp = [ordered]@{ port = $RemoteDebugPort; pageUrl = $cdpPage.url; title = $cdpPage.title }
  Add-Check 'tauri product IPC page available through WebView2 CDP' ($null -ne $cdpPage.webSocketDebuggerUrl) $report.cdp

  Start-Sleep -Seconds $InitialDelaySeconds

  $targetProc = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$targetScript,'-SelectedTextPath',$selectedTextPath,'-RunId',$RunId,'-StatePath',$targetLiveStatePath) `
    -PassThru
  $targetWindow = Wait-ForWindowByTitle "Selection Capture Target $RunId" 30
  $report.target = [ordered]@{ pid = $targetWindow.Id; hwnd = $targetWindow.MainWindowHandle.ToInt64(); title = 'Selection Capture Target [redacted]' }
  Add-Check 'target fixture launched' ($targetWindow.MainWindowHandle -ne 0) $report.target

  Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
  Start-Sleep -Milliseconds 700
  $report.foregroundBeforeCapture = Get-ForegroundTitle
  Add-Check 'target foreground before selection capture' ($report.foregroundBeforeCapture.hwnd -eq $targetWindow.MainWindowHandle.ToInt64()) @{ hwnd = $report.foregroundBeforeCapture.hwnd; title = 'Selection Capture Target [redacted]' }

  if (Test-Path $targetLiveStatePath) {
    $targetState = Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json
    Add-Check 'fixture reports synthetic selection selected' ([int]$targetState.selectionLength -eq $SelectedText.Length) @{ selectionLength = [int]$targetState.selectionLength; expectedLength = $SelectedText.Length; focused = [bool]$targetState.focused }
  } else {
    Add-Check 'fixture reports synthetic selection selected' $false @{ reason = 'target state file was not written' }
  }

  $expression = "window.__TAURI_INTERNALS__.invoke('capture_selection_context').then(o=>JSON.stringify(o))"
  $rawOutcomeJson = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $cdpPage.webSocketDebuggerUrl $expression
  if ($LASTEXITCODE -ne 0) { throw 'CDP invocation of capture_selection_context failed.' }
  $outcome = $rawOutcomeJson | ConvertFrom-Json

  $selected = $outcome.selection
  $selectedText = if ($selected -and $selected.selectedText) { [string]$selected.selectedText } else { '' }
  $targetSnapshot = $outcome.targetSnapshot
  $report.selectionOutcome = [ordered]@{
    status = $outcome.status
    redacted = [bool]$outcome.redacted
    truncated = [bool]$outcome.truncated
    hasSelection = ($null -ne $selected)
    selectedTextRecordedInReport = $false
    textLength = if ($selected) { [int]$selected.textLength } else { 0 }
    selectedTextMatchesFixture = ($selectedText -eq $SelectedText)
    selectedTextSha256 = if ($selectedText.Length -gt 0) { Get-Sha256Hex $selectedText } else { $null }
    source = if ($selected) { $selected.source } else { $null }
    confidence = if ($selected) { $selected.confidence } else { $null }
    targetSnapshotRedacted = [ordered]@{
      appLabel = if ($targetSnapshot) { $targetSnapshot.appLabel } else { $null }
      windowLabel = if ($targetSnapshot) { $targetSnapshot.windowLabel } else { $null }
      confidence = if ($targetSnapshot) { $targetSnapshot.confidence } else { $null }
    }
    reason = $outcome.reason
  }

  Add-Check 'capture_selection_context returned ok' ($outcome.status -eq 'ok') $report.selectionOutcome
  Add-Check 'captured selection is host_capture and redacted' ($selected -and $selected.source -eq 'host_capture' -and [bool]$selected.redacted -and [bool]$outcome.redacted) @{ source = $report.selectionOutcome.source; redacted = $report.selectionOutcome.redacted }
  Add-Check 'captured text matches synthetic fixture without recording raw text' ($report.selectionOutcome.selectedTextMatchesFixture -and $report.selectionOutcome.textLength -eq $SelectedText.Length) @{ textLength = $report.selectionOutcome.textLength; expectedLength = $SelectedText.Length; rawTextRecorded = $false }
  Add-Check 'target metadata labels are redacted' (($report.selectionOutcome.targetSnapshotRedacted.appLabel -eq '[redacted]') -and ($report.selectionOutcome.targetSnapshotRedacted.windowLabel -eq '[redacted]')) $report.selectionOutcome.targetSnapshotRedacted

  $report.status = 'passed'
}
catch {
  $report.status = 'failed'
  $report.errors += $_.Exception.Message
  throw
}
finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  if ($targetProc -and -not $targetProc.HasExited) { Stop-Tree $targetProc.Id }
  Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree $tauriProc.Id }
  try { if (Test-Path $targetLiveStatePath) { Copy-Item -Path $targetLiveStatePath -Destination $targetStatePath -Force } } catch {}
  Write-Output "Selection capture smoke report: $reportPath"
}
