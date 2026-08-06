param(
  [switch]$AllowSelectedTextCapture,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$SelectedText = 'Synthetic selected text for UIA smoke.',
  [switch]$VerifyReplaceSelection,
  [switch]$VerifyTeachCorrectionTargetChanged,
  [switch]$VerifyManagedTransform,
  [switch]$VerifySttManagedTransform,
  [switch]$VerifyHotkeySttSelectionTransform,
  [switch]$VerifyHotkeyFailClosed,
  [switch]$AllowProviderCall,
  [ValidateSet('CtrlShiftF9','AltSpace')]
  [string]$DictationKey = 'CtrlShiftF9',
  [string]$InstructionText = 'en ingles',
  [string]$SpokenInstruction = 'translate to English',
  [string]$ExpectedFinalText = 'hello friend',
  [string]$ReplacementText = 'Synthetic replacement text for delivery smoke.',
  [int]$RecordingSeconds = 2,
  [int]$DeliveryTimeoutSeconds = 180,
  [int]$FailClosedWaitSeconds = 30,
  [int]$StartupTimeoutSeconds = 80,
  [int]$InitialDelaySeconds = 12,
  [int]$RemoteDebugPort = 9341
)

$ErrorActionPreference = 'Stop'

if (-not $AllowSelectedTextCapture) {
  throw 'Selection capture smoke opens a controlled desktop target, selects synthetic text, launches Tauri, and invokes capture_selection_context through product IPC. Re-run with -AllowSelectedTextCapture only after explicit approval.'
}
if (($VerifyManagedTransform -or $VerifySttManagedTransform -or $VerifyHotkeySttSelectionTransform -or $VerifyHotkeyFailClosed) -and -not $AllowProviderCall) {
  throw 'Managed transform/STT smoke calls Fixvox Cloud providers. Re-run with -AllowProviderCall only after explicit approval.'
}
if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
  throw 'RunId may contain only letters, digits, dot, underscore, and hyphen so temporary cleanup remains path-bound.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/selection-capture-smoke/$RunId"
$audioRoot = Join-Path $repo 'artifacts/microphone-capture/audio'
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null

$targetScript = Join-Path $runRoot 'SelectionTargetFixture.ps1'
$targetStatePath = Join-Path $runRoot 'target-state.json'
$reportPath = Join-Path $runRoot 'report.json'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
$spokenInstructionAudioPath = Join-Path $audioRoot "selection-transform-instruction-$RunId.wav"
$spokenInstructionAudioRelativePath = "artifacts/microphone-capture/audio/selection-transform-instruction-$RunId.wav"
# Keep live target files outside the repo: Vite dev watches the workspace and can crash
# on frequently-written artifact files on Windows (EBUSY from fs.watch).
$liveRoot = Join-Path $env:TEMP "dictation-tauri-selection-capture-smoke\$RunId"
$selectedTextPath = Join-Path $liveRoot 'selected-text.txt'
$targetLiveStatePath = Join-Path $liveRoot 'target-state.json'
$webViewUserDataRoot = Join-Path $liveRoot 'webview2-user-data'
$liveRootCreated = $false
$webViewProfileCreated = $false
$startedAt = Get-Date
$targetProc = $null
$targetWindow = $null
$tauriProc = $null
$launchedAppProcessId = $null
$tauriProcessTreeIds = @()
$targetProcessTreeIds = @()
$teachCorrectionPassed = $true
$existingAppProcessIds = @(Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$environmentNames = @(
  'DICTATION_TAURI_DICTATION_KEY',
  'DICTATION_TAURI_ALLOW_ALT_SPACE',
  'DICTATION_TAURI_STARTUP_SMOKE',
  'FIXVOX_BACKEND_URL',
  'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
  'WEBVIEW2_USER_DATA_FOLDER'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $present = Test-Path "Env:$name"
  $previousEnvironment[$name] = [ordered]@{
    present = $present
    value = if ($present) { [Environment]::GetEnvironmentVariable($name, 'Process') } else { $null }
  }
}

# Preexisting app and fixture processes are never stopped or reused. The run-specific
# title and process-ID filter below bind the smoke to only the processes it launches.

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SelectionCaptureSmokeWin32 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
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
    if (-not $tauriProc) {
      throw 'tauri npm launcher process was not started before waiting for the app window.'
    }
    $appProcess = Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $existingAppProcessIds -notcontains $_.Id -and
        (Test-ProcessDescendsFrom -ProcessId ([int]$_.Id) -AncestorId ([int]$tauriProc.Id))
      } |
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

function Normalize-Text([string]$Text) {
  if ($null -eq $Text) { return '' }
  return ($Text.ToLowerInvariant() -replace '[^a-z0-9 ]', ' ' -replace '\s+', ' ').Trim()
}

function Write-SpokenInstructionAudio([string]$Text, [string]$Path) {
  Add-Type -AssemblyName System.Speech
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $speaker.Rate = -2
    $speaker.Volume = 100
    $speaker.SetOutputToWaveFile($Path)
    $speaker.Speak($Text)
  } finally {
    $speaker.Dispose()
  }
}

function Speak-TestPhrase([string]$Text) {
  Add-Type -AssemblyName System.Speech
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $speaker.Rate = -2
    $speaker.Volume = 100
    $speaker.Speak($Text)
  } finally {
    $speaker.Dispose()
  }
}

function Send-CtrlShiftF9() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_CONTROL = 0x11
  $VK_SHIFT = 0x10
  $VK_F9 = 0x78
  [SelectionCaptureSmokeWin32]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
  [SelectionCaptureSmokeWin32]::keybd_event($VK_SHIFT, 0, 0, [UIntPtr]::Zero)
  [SelectionCaptureSmokeWin32]::keybd_event($VK_F9, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [SelectionCaptureSmokeWin32]::keybd_event($VK_F9, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [SelectionCaptureSmokeWin32]::keybd_event($VK_SHIFT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [SelectionCaptureSmokeWin32]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Test-ProcessDescendsFrom([int]$ProcessId, [int]$AncestorId) {
  $visited = [System.Collections.Generic.HashSet[int]]::new()
  $current = $ProcessId
  while ($current -gt 0 -and $visited.Add($current)) {
    if ($current -eq $AncestorId) { return $true }
    $row = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
    if (-not $row) { return $false }
    $current = [int]$row.ParentProcessId
  }
  return $false
}

function Get-ProcessTreeIds([int]$RootProcessId) {
  if ($RootProcessId -le 0) {
    return @()
  }

  $rows = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $pending = [System.Collections.Generic.Queue[int]]::new()
  $visited = [System.Collections.Generic.HashSet[int]]::new()
  $result = [System.Collections.Generic.List[int]]::new()
  $pending.Enqueue($RootProcessId)

  while ($pending.Count -gt 0) {
    $current = $pending.Dequeue()
    if (-not $visited.Add($current)) {
      continue
    }
    $result.Add($current) | Out-Null
    foreach ($child in ($rows | Where-Object { [int]$_.ParentProcessId -eq $current })) {
      $pending.Enqueue([int]$child.ProcessId)
    }
  }

  return $result.ToArray()
}

function Get-ExistingProcessIds([int[]]$ProcessIds) {
  $existing = [System.Collections.Generic.List[int]]::new()
  foreach ($processId in @($ProcessIds | Select-Object -Unique)) {
    if (Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue) {
      $existing.Add([int]$processId) | Out-Null
    }
  }
  return $existing.ToArray()
}

function Assert-CdpPortAvailable([int]$Port) {
  if ($Port -lt 1024 -or $Port -gt 65535) {
    throw "RemoteDebugPort must be between 1024 and 65535, got $Port."
  }

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    throw "RemoteDebugPort $Port is already occupied or unavailable; choose an unused port."
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Send-AltQ() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_Q = 0x51
  [SelectionCaptureSmokeWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionCaptureSmokeWin32]::keybd_event($VK_Q, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [SelectionCaptureSmokeWin32]::keybd_event($VK_Q, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [SelectionCaptureSmokeWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Send-Tab() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_TAB = 0x09
  [SelectionCaptureSmokeWin32]::keybd_event($VK_TAB, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
  [SelectionCaptureSmokeWin32]::keybd_event($VK_TAB, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Send-AltSpace() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_SPACE = 0x20
  [SelectionCaptureSmokeWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionCaptureSmokeWin32]::keybd_event($VK_SPACE, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [SelectionCaptureSmokeWin32]::keybd_event($VK_SPACE, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionCaptureSmokeWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Send-DictationKey() {
  if ($DictationKey -eq 'AltSpace') { Send-AltSpace; return }
  Send-CtrlShiftF9
}

Set-Content -Path $targetScript -Encoding UTF8 -Value @'
param([string]$SelectedTextPath, [string]$RunId, [string]$StatePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$SelectedText = Get-Content -Raw -Encoding UTF8 -Path $SelectedTextPath
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
function Normalize-Text([string]$Text) {
  if ($null -eq $Text) { return '' }
  return ($Text.ToLowerInvariant() -replace '[^a-z0-9 ]', ' ' -replace '\s+', ' ').Trim()
}
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
$textBox.AcceptsTab = $false
$textBox.TextWrapping = 'Wrap'
$textBox.FontSize = 18
$textBox.Margin = '16'
$textBox.Text = $SelectedText
$secondaryText = 'Synthetic secondary target.'
$secondaryBox = New-Object System.Windows.Controls.TextBox
$secondaryBox.Name = 'selectionCaptureSecondaryBox'
$secondaryBox.AcceptsReturn = $true
$secondaryBox.AcceptsTab = $false
$secondaryBox.TextWrapping = 'Wrap'
$secondaryBox.FontSize = 18
$secondaryBox.Margin = '16,0,16,16'
$secondaryBox.Text = $secondaryText
$panel = New-Object System.Windows.Controls.StackPanel
[void]$panel.Children.Add($textBox)
[void]$panel.Children.Add($secondaryBox)
$window.Content = $panel
function Write-State {
  $payload = [ordered]@{
    runId = $RunId
    originalTextLength = $SelectedText.Length
    originalTextSha256 = Get-Sha256Hex $SelectedText
    currentTextLength = $textBox.Text.Length
    currentTextSha256 = Get-Sha256Hex $textBox.Text
    currentTextNormalizedLength = (Normalize-Text $textBox.Text).Length
    currentTextNormalizedSha256 = Get-Sha256Hex (Normalize-Text $textBox.Text)
    selectionStart = $textBox.SelectionStart
    selectionLength = $textBox.SelectionLength
    focused = $textBox.IsKeyboardFocused
    focusedControl = if ($textBox.IsKeyboardFocused) { 'primary' } elseif ($secondaryBox.IsKeyboardFocused) { 'secondary' } else { 'none' }
    secondaryOriginalLength = $secondaryText.Length
    secondaryOriginalSha256 = Get-Sha256Hex $secondaryText
    secondaryCurrentLength = $secondaryBox.Text.Length
    secondaryCurrentSha256 = Get-Sha256Hex $secondaryBox.Text
    rawTextRecorded = $false
    updatedAt = (Get-Date).ToString('o')
  }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -Path $StatePath
}
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(200)
$timer.Add_Tick({ Write-State })
$window.Add_ContentRendered({
  [void]$textBox.Focus()
  $textBox.Select(0, $SelectedText.Length)
  Write-State
  $timer.Start()
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
  approved = [ordered]@{
    selectedTextCapture = [bool]$AllowSelectedTextCapture
    managedProviderCall = [bool]($VerifyManagedTransform -or $VerifySttManagedTransform -or $VerifyHotkeySttSelectionTransform -or $VerifyHotkeyFailClosed)
  }
  selectedTextFixture = [ordered]@{
    synthetic = $true
    expectedLength = $SelectedText.Length
    expectedSha256 = Get-Sha256Hex $SelectedText
    rawTextRecorded = $false
  }
  replacementFixture = if ([bool]$VerifyReplaceSelection -and -not [bool]$VerifyManagedTransform -and -not [bool]$VerifySttManagedTransform -and -not [bool]$VerifyHotkeySttSelectionTransform) { [ordered]@{
    synthetic = $true
    expectedLength = $ReplacementText.Length
    expectedSha256 = Get-Sha256Hex $ReplacementText
    rawTextRecorded = $false
  } } else { $null }
  managedTransformFixture = if ([bool]$VerifyManagedTransform) { [ordered]@{
    synthetic = $true
    instructionLength = $InstructionText.Length
    instructionSha256 = Get-Sha256Hex $InstructionText
    rawTextRecorded = $false
  } } else { $null }
  sttManagedTransformFixture = if ([bool]$VerifySttManagedTransform -or [bool]$VerifyHotkeySttSelectionTransform -or [bool]$VerifyHotkeyFailClosed) { [ordered]@{
    synthetic = $true
    spokenInstructionLength = $SpokenInstruction.Length
    spokenInstructionSha256 = Get-Sha256Hex $SpokenInstruction
    expectedFinalLength = $ExpectedFinalText.Length
    expectedFinalNormalizedSha256 = Get-Sha256Hex (Normalize-Text $ExpectedFinalText)
    dictationKey = $DictationKey
    expectFailClosed = [bool]$VerifyHotkeyFailClosed
    rawTextRecorded = $false
  } } else { $null }
  checks = @()
  warnings = @()
  errors = @()
  artifacts = [ordered]@{
    report = $reportPath
    targetState = $targetStatePath
    tauriStdout = $tauriOutLog
    tauriStderr = $tauriErrLog
  }
  webView2 = [ordered]@{
    userDataFolder = $webViewUserDataRoot
    profileIsolated = $true
    profileCreated = $false
  }
  cdp = [ordered]@{
    port = $RemoteDebugPort
    preflightPortAvailable = $false
    webViewUserDataFolder = $webViewUserDataRoot
    profileIsolated = $true
  }
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null, [bool]$NonGating = $false) {
  $entry = [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  if ($NonGating) { $entry.nonGating = $true }
  $script:report.checks += $entry
  if (-not $Pass -and -not $NonGating) { throw "Selection capture smoke check failed: $Name" }
}

function Invoke-CdpJson([string]$Expression, [int]$TimeoutMs = 15000) {
  $wrapped = @"
(async () => {
  for (let i = 0; i < 100; i += 1) {
    if (window.__TAURI_INTERNALS__?.invoke) {
      return await ($Expression);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Tauri internals unavailable for smoke command.');
})()
"@
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($wrapped))
  $previousTimeout = $env:CDP_EVALUATE_TIMEOUT_MS
  $env:CDP_EVALUATE_TIMEOUT_MS = [string]$TimeoutMs
  try {
    $rawJson = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $cdpPage.webSocketDebuggerUrl "base64:$encoded"
  } finally {
    if ($null -eq $previousTimeout) { Remove-Item Env:CDP_EVALUATE_TIMEOUT_MS -ErrorAction SilentlyContinue } else { $env:CDP_EVALUATE_TIMEOUT_MS = $previousTimeout }
  }
  if ($LASTEXITCODE -ne 0) { throw 'CDP invocation failed.' }
  return $rawJson | ConvertFrom-Json
}

function Invoke-CdpJsonOnPage([object]$Page, [string]$Expression, [int]$TimeoutMs = 15000) {
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Expression))
  $previousTimeout = $env:CDP_EVALUATE_TIMEOUT_MS
  $env:CDP_EVALUATE_TIMEOUT_MS = [string]$TimeoutMs
  try {
    $rawJson = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $Page.webSocketDebuggerUrl "base64:$encoded"
  } finally {
    if ($null -eq $previousTimeout) { Remove-Item Env:CDP_EVALUATE_TIMEOUT_MS -ErrorAction SilentlyContinue } else { $env:CDP_EVALUATE_TIMEOUT_MS = $previousTimeout }
  }
  if ($LASTEXITCODE -ne 0) { throw 'CDP invocation failed.' }
  return $rawJson | ConvertFrom-Json
}

try {
  if (Test-Path -LiteralPath $liveRoot) {
    throw "Live selection smoke root already exists; refusing to reuse or remove it: $liveRoot"
  }
  [void](Assert-CdpPortAvailable $RemoteDebugPort)
  $report.cdp.preflightPortAvailable = $true
  New-Item -ItemType Directory -Force -Path $liveRoot | Out-Null
  $liveRootCreated = $true
  [System.IO.File]::WriteAllText($selectedTextPath, $SelectedText, [System.Text.UTF8Encoding]::new($false))
  if ($DictationKey -eq 'CtrlShiftF9') {
    $env:DICTATION_TAURI_DICTATION_KEY = 'Ctrl+Shift+F9'
    Remove-Item Env:DICTATION_TAURI_ALLOW_ALT_SPACE -ErrorAction SilentlyContinue
  } else {
    $env:DICTATION_TAURI_DICTATION_KEY = 'Alt+Space'
    $env:DICTATION_TAURI_ALLOW_ALT_SPACE = 'true'
  }
  if ($VerifyHotkeyFailClosed) {
    $env:FIXVOX_BACKEND_URL = 'http://127.0.0.1:9'
    $report.failClosedFault = [ordered]@{ backendBaseUrl = 'http://127.0.0.1:9'; reason = 'force managed runtime connection failure before delivery' }
  }
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  New-Item -ItemType Directory -Force -Path $webViewUserDataRoot | Out-Null
  $webViewProfileCreated = $true
  $report.webView2.profileCreated = $true
  $env:WEBVIEW2_USER_DATA_FOLDER = $webViewUserDataRoot
  $tauriProc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run','tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $tauriOutLog `
    -RedirectStandardError $tauriErrLog `
    -PassThru

  $tauriWindow = Wait-ForTauriWindow $StartupTimeoutSeconds
  $launchedAppProcessId = $tauriWindow.Id
  $tauriProcessTreeIds = @(Get-ProcessTreeIds ([int]$tauriProc.Id))
  if ($tauriProcessTreeIds -notcontains [int]$launchedAppProcessId) {
    $tauriProcessTreeIds += [int]$launchedAppProcessId
  }
  $report.tauri = [ordered]@{
    pid = $tauriWindow.Id
    npmPid = $tauriProc.Id
    ownedProcessIds = @($tauriProcessTreeIds | Select-Object -Unique)
    hwnd = $tauriWindow.MainWindowHandle.ToInt64()
    title = $tauriWindow.MainWindowTitle
  }
  Add-Check 'tauri dictation dock launched' ($tauriWindow.MainWindowHandle -ne 0) $report.tauri

  $cdpPage = Wait-ForCdpPage $RemoteDebugPort $StartupTimeoutSeconds
  $report.cdp.pageUrl = $cdpPage.url
  $report.cdp.title = $cdpPage.title
  Add-Check 'tauri product IPC page available through WebView2 CDP' ($null -ne $cdpPage.webSocketDebuggerUrl) $report.cdp

  Start-Sleep -Seconds $InitialDelaySeconds

  $targetProc = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$targetScript,'-SelectedTextPath',$selectedTextPath,'-RunId',$RunId,'-StatePath',$targetLiveStatePath) `
    -PassThru
  $targetWindow = Wait-ForWindowByTitle "Selection Capture Target $RunId" 30
  $targetProcessTreeIds = @(Get-ProcessTreeIds ([int]$targetProc.Id))
  if ($targetProcessTreeIds -notcontains [int]$targetProc.Id) {
    $targetProcessTreeIds += [int]$targetProc.Id
  }
  if ($targetProcessTreeIds -notcontains [int]$targetWindow.Id) {
    $targetProcessTreeIds += [int]$targetWindow.Id
  }
  $report.target = [ordered]@{ pid = $targetWindow.Id; hwnd = $targetWindow.MainWindowHandle.ToInt64(); title = 'Selection Capture Target [redacted]' }
  $report.target.ownedProcessIds = @($targetProcessTreeIds | Select-Object -Unique)
  Add-Check 'target fixture launched' ($targetWindow.MainWindowHandle -ne 0) $report.target

  Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
  Start-Sleep -Milliseconds 700
  $report.foregroundBeforeCapture = Get-ForegroundTitle
  Add-Check 'target foreground before selection capture' ($report.foregroundBeforeCapture.hwnd -eq $targetWindow.MainWindowHandle.ToInt64()) @{ hwnd = $report.foregroundBeforeCapture.hwnd; title = 'Selection Capture Target [redacted]' }

  $deliveryTarget = $null
  if ($VerifyReplaceSelection -or $VerifyTeachCorrectionTargetChanged) {
    $deliveryTarget = Invoke-CdpJson "window.__TAURI_INTERNALS__.invoke('capture_desktop_delivery_target').then(o=>JSON.stringify(o))"
    $report.deliveryTarget = [ordered]@{
      inputLike = [bool]$deliveryTarget.inputLike
      frameHwnd = $deliveryTarget.frameHwnd
      appLabel = $deliveryTarget.appLabel
      windowLabel = $deliveryTarget.windowLabel
      confidence = $deliveryTarget.confidence
    }
    Add-Check 'desktop delivery target captured for replace-selection' ([bool]$deliveryTarget.inputLike) $report.deliveryTarget
  }

  if (Test-Path $targetLiveStatePath) {
    $targetState = Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json
    Add-Check 'fixture reports synthetic selection selected' ([int]$targetState.selectionLength -eq $SelectedText.Length) @{ selectionLength = [int]$targetState.selectionLength; expectedLength = $SelectedText.Length; focused = [bool]$targetState.focused }
  } else {
    Add-Check 'fixture reports synthetic selection selected' $false @{ reason = 'target state file was not written' }
  }

  $outcome = Invoke-CdpJson "window.__TAURI_INTERNALS__.invoke('capture_selection_context').then(o=>JSON.stringify(o))"

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

  if ($VerifyTeachCorrectionTargetChanged) {
    Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
    Start-Sleep -Milliseconds 300
    $targetJsonForPicker = $deliveryTarget | ConvertTo-Json -Depth 8 -Compress
    [void](Invoke-CdpJson "(() => { window.dispatchEvent(new CustomEvent('dictation-tauri:host-command', { detail: { source: 'physical_smoke', command: 'show_preset_picker', targetSnapshot: $targetJsonForPicker } })); return JSON.stringify({ dispatched: true }); })()")
    $pickerPage = $null
    $pickerDeadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $pickerDeadline -and -not $pickerPage) {
      try {
        $pickerPages = Invoke-RestMethod -Uri "http://127.0.0.1:$RemoteDebugPort/json/list" -TimeoutSec 2
        $pickerPage = $pickerPages | Where-Object { $_.url -like '*surface=preset-picker*' } | Select-Object -First 1
      } catch {}
      if (-not $pickerPage) { Start-Sleep -Milliseconds 300 }
    }
    Add-Check 'V5 picker opened from captured target smoke command' ($null -ne $pickerPage) @{ pickerUrlMatched = ($null -ne $pickerPage) }

    $pickerOpenRoute = 'captured_target_smoke_command'
    Start-Sleep -Seconds 2
    $initialPickerExpression = @'
(() => JSON.stringify({ ready: Boolean(document.querySelector('[data-testid="preset-picker"]')) }))()
'@
    $initialPickerProbe = Invoke-CdpJsonOnPage $pickerPage $initialPickerExpression
    Add-Check 'V5 picker received captured target snapshot' ([bool]$initialPickerProbe.ready) @{ ready = [bool]$initialPickerProbe.ready }
    $pickerMainDebug = Invoke-CdpJson "(() => JSON.stringify({ debug: window.__dictationPresetPickerMainDebug || null }))()"
    $report.pickerMainDebug = $pickerMainDebug.debug

    $clickTeachExpression = @'
(() => { const picker = document.querySelector('[data-testid="preset-picker"]'); const button = document.querySelector('.dock-teach-correction-launcher'); button?.click(); return JSON.stringify({ picker: Boolean(picker), teachButton: Boolean(button), clicked: Boolean(button) }); })()
'@
    $clickTeachProbe = Invoke-CdpJsonOnPage $pickerPage $clickTeachExpression
    Add-Check 'V5 picker exposes Teach correction action' ($clickTeachProbe.picker -and $clickTeachProbe.teachButton -and $clickTeachProbe.clicked) $clickTeachProbe

    $pickerProbe = $null
    $transportProbe = $null
    $formDeadline = (Get-Date).AddSeconds(15)
    $formProbeExpression = @'
(() => { const form = document.querySelector('.dock-teach-correction-form'); const spoken = form?.querySelector('input[readonly]')?.value ?? ''; const text = document.body.innerText || ''; return JSON.stringify({ form: Boolean(form), spoken, invalidNotice: text.includes('No hay una selección segura disponible'), received: window.__dictationTeachCorrectionEventReceived || null }); })()
'@
    while ((Get-Date) -lt $formDeadline) {
      $transportProbe = Invoke-CdpJson "(() => JSON.stringify({ transport: window.__dictationCompanionCommandTransport || null, main: window.__dictationPresetPickerMainDebug || null }))()"
      $pickerProbe = Invoke-CdpJsonOnPage $pickerPage $formProbeExpression
      if (
        $transportProbe.transport.route -eq 'tauri_event' -and
        $transportProbe.transport.command -eq 'teach_correction' -and
        $transportProbe.main.lastAction -eq 'teach_correction_open_requested' -and
        $transportProbe.main.teachCorrectionEventStatus -eq 'emitted' -and
        $pickerProbe.received.kind -eq 'open' -and
        $pickerProbe.form -and
        ([string]$pickerProbe.spoken).Length -gt 0
      ) { break }
      Start-Sleep -Milliseconds 200
    }
    $pickerSpoken = [string]$pickerProbe.spoken
    $teachCorrectionPassed = (
      $transportProbe.transport.route -eq 'tauri_event' -and
      $transportProbe.transport.command -eq 'teach_correction' -and
      $transportProbe.main.lastAction -eq 'teach_correction_open_requested' -and
      $transportProbe.main.teachCorrectionEventStatus -eq 'emitted' -and
      $pickerProbe.received.kind -eq 'open' -and
      $pickerProbe.form -and
      $pickerSpoken -eq $SelectedText
    )
    $report.teachCorrectionPicker = [ordered]@{
      picker = [bool]$clickTeachProbe.picker
      openRoute = $pickerOpenRoute
      commandRoute = 'picker_click_to_product_form'
      transportRoute = if ($transportProbe.transport) { [string]$transportProbe.transport.route } else { $null }
      transportCommand = if ($transportProbe.transport) { [string]$transportProbe.transport.command } else { $null }
      mainAction = if ($transportProbe.main) { [string]$transportProbe.main.lastAction } else { $null }
      mainEventStatus = if ($transportProbe.main) { [string]$transportProbe.main.teachCorrectionEventStatus } else { $null }
      pickerEventKind = if ($pickerProbe.received) { [string]$pickerProbe.received.kind } else { $null }
      assertionScope = 'picker_click_to_teach_form'
      physicalAltQObserved = ($pickerOpenRoute -eq 'physical_alt_q')
      teachButton = [bool]$clickTeachProbe.teachButton
      form = [bool]$pickerProbe.form
      spokenLength = $pickerSpoken.Length
      spokenMatchesFixture = ($pickerSpoken -eq $SelectedText)
      spokenSha256 = if ($pickerSpoken.Length -gt 0) { Get-Sha256Hex $pickerSpoken } else { $null }
      invalidNotice = [bool]$pickerProbe.invalidNotice
      assertionStatus = if ($teachCorrectionPassed) { 'passed' } else { 'failed' }
      rawTextRecorded = $false
    }
    Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
    Start-Sleep -Milliseconds 300
    Send-Tab
    Start-Sleep -Milliseconds 500
    $changedTargetState = Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json
    Add-Check 'secondary control focused before guarded replace' ($changedTargetState.focusedControl -eq 'secondary') @{ focusedControl = $changedTargetState.focusedControl }

    $replacementJson = $ReplacementText | ConvertTo-Json -Compress
    $targetJson = $deliveryTarget | ConvertTo-Json -Depth 8 -Compress
    $selectionIdJson = ([string]$selected.selectionId) | ConvertTo-Json -Compress
    $expectedSelectionJson = $selectedText | ConvertTo-Json -Compress
    $replaceExpression = "window.__TAURI_INTERNALS__.invoke('replace_captured_selection_if_unchanged', { target: $targetJson, selectionId: $selectionIdJson, expectedSelection: $expectedSelectionJson, selectionTruncated: false, replacement: $replacementJson }).then(o=>JSON.stringify(o))"
    $guardedOutcome = Invoke-CdpJson $replaceExpression
    Start-Sleep -Milliseconds 500
    $guardedState = Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json
    $primaryUnchanged = [string]$guardedState.currentTextSha256 -eq (Get-Sha256Hex $SelectedText)
    $secondaryUnchanged = [string]$guardedState.secondaryCurrentSha256 -eq [string]$guardedState.secondaryOriginalSha256
    $report.targetChangedOutcome = [ordered]@{
      assertionScope = 'direct_replace_guard_after_product_picker_flow'
      status = $guardedOutcome.status
      capturedLength = $guardedOutcome.capturedLength
      primaryUnchanged = $primaryUnchanged
      secondaryUnchanged = $secondaryUnchanged
      targetA = [ordered]@{
        originalLength = [int]$guardedState.originalTextLength
        currentLength = [int]$guardedState.currentTextLength
        originalSha256 = [string]$guardedState.originalTextSha256
        currentSha256 = [string]$guardedState.currentTextSha256
      }
      targetB = [ordered]@{
        originalLength = [int]$guardedState.secondaryOriginalLength
        currentLength = [int]$guardedState.secondaryCurrentLength
        originalSha256 = [string]$guardedState.secondaryOriginalSha256
        currentSha256 = [string]$guardedState.secondaryCurrentSha256
      }
      rawTextRecorded = $false
    }
    Add-Check 'changed focused control fails closed without replacing either input' ((@('target_unavailable','selection_changed') -contains [string]$guardedOutcome.status) -and $primaryUnchanged -and $secondaryUnchanged) $report.targetChangedOutcome
    Add-Check 'Teach correction picker click opened the Unicode form (blocking assertion after independent guard)' $teachCorrectionPassed $report.teachCorrectionPicker
  }

  if ($VerifyHotkeySttSelectionTransform) {
    $expectedFinalNormalizedHash = Get-Sha256Hex (Normalize-Text $ExpectedFinalText)
    Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
    Start-Sleep -Milliseconds 500
    $report.foregroundBeforeHotkey = Get-ForegroundTitle
    Add-Check 'target foreground before hotkey selection transform' ($report.foregroundBeforeHotkey.hwnd -eq $targetWindow.MainWindowHandle.ToInt64()) @{ hwnd = $report.foregroundBeforeHotkey.hwnd; title = 'Selection Capture Target [redacted]' }

    Send-DictationKey
    $report.hotkeyStartAt = (Get-Date).ToString('o')
    Start-Sleep -Milliseconds 800
    Speak-TestPhrase $SpokenInstruction
    $report.spokenInstructionAt = (Get-Date).ToString('o')
    if ($RecordingSeconds -gt 0) { Start-Sleep -Seconds $RecordingSeconds }
    Send-DictationKey
    $report.hotkeyStopAt = (Get-Date).ToString('o')

    $matchedHotkeyReplacement = $false
    $hotkeyState = $null
    $deadline = (Get-Date).AddSeconds($DeliveryTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
      if (Test-Path $targetLiveStatePath) {
        $hotkeyState = Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json
        if ([string]$hotkeyState.currentTextNormalizedSha256 -eq $expectedFinalNormalizedHash) {
          $matchedHotkeyReplacement = $true
          break
        }
      }
      if ($tauriProc -and $tauriProc.HasExited) { throw "tauri dev exited during hotkey STT selection transform wait with code $($tauriProc.ExitCode). See logs." }
      Start-Sleep -Seconds 2
    }

    $report.hotkeySelectionTransformOutcome = [ordered]@{
      matchedExpectedFinal = $matchedHotkeyReplacement
      expectedFinalLength = $ExpectedFinalText.Length
      currentTextLength = if ($hotkeyState) { [int]$hotkeyState.currentTextLength } else { $null }
      expectedFinalNormalizedSha256 = $expectedFinalNormalizedHash
      currentTextNormalizedSha256 = if ($hotkeyState) { [string]$hotkeyState.currentTextNormalizedSha256 } else { $null }
      dictationKey = $DictationKey
      rawTextRecorded = $false
    }
    Add-Check 'hotkey voice STT selection transform replaced synthetic selection' $matchedHotkeyReplacement $report.hotkeySelectionTransformOutcome
  }

  if ($VerifyHotkeyFailClosed) {
    $expectedOriginalHash = Get-Sha256Hex $SelectedText
    $spokenInstructionHash = Get-Sha256Hex (Normalize-Text $SpokenInstruction)
    Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
    Start-Sleep -Milliseconds 500
    $report.foregroundBeforeFailClosedHotkey = Get-ForegroundTitle
    Add-Check 'target foreground before fail-closed hotkey run' ($report.foregroundBeforeFailClosedHotkey.hwnd -eq $targetWindow.MainWindowHandle.ToInt64()) @{ hwnd = $report.foregroundBeforeFailClosedHotkey.hwnd; title = 'Selection Capture Target [redacted]' }

    Send-DictationKey
    $report.failClosedHotkeyStartAt = (Get-Date).ToString('o')
    Start-Sleep -Milliseconds 800
    Speak-TestPhrase $SpokenInstruction
    $report.failClosedSpokenInstructionAt = (Get-Date).ToString('o')
    if ($RecordingSeconds -gt 0) { Start-Sleep -Seconds $RecordingSeconds }
    Send-DictationKey
    $report.failClosedHotkeyStopAt = (Get-Date).ToString('o')

    Start-Sleep -Seconds $FailClosedWaitSeconds
    $failClosedState = if (Test-Path $targetLiveStatePath) { Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json } else { $null }
    $remainedOriginal = $failClosedState -and [string]$failClosedState.currentTextSha256 -eq $expectedOriginalHash
    $didNotPasteInstruction = -not ($failClosedState -and [string]$failClosedState.currentTextNormalizedSha256 -eq $spokenInstructionHash)
    $report.failClosedOutcome = [ordered]@{
      remainedOriginal = [bool]$remainedOriginal
      didNotPasteInstruction = [bool]$didNotPasteInstruction
      currentTextLength = if ($failClosedState) { [int]$failClosedState.currentTextLength } else { $null }
      expectedOriginalSha256 = $expectedOriginalHash
      currentTextSha256 = if ($failClosedState) { [string]$failClosedState.currentTextSha256 } else { $null }
      spokenInstructionNormalizedSha256 = $spokenInstructionHash
      currentTextNormalizedSha256 = if ($failClosedState) { [string]$failClosedState.currentTextNormalizedSha256 } else { $null }
      dictationKey = $DictationKey
      rawTextRecorded = $false
    }
    Add-Check 'hotkey fail-closed kept original selection and did not paste instruction' ([bool]$remainedOriginal -and [bool]$didNotPasteInstruction) $report.failClosedOutcome
  }

  if (($VerifyManagedTransform -or $VerifySttManagedTransform) -and -not $VerifyReplaceSelection) {
    Add-Check 'managed transform requires replace-selection verification target' $false @{ reason = 'Use -VerifyReplaceSelection with managed transform checks.' }
  }

  if ($VerifyReplaceSelection) {
    $deliveryText = $ReplacementText
    $transformInstruction = $InstructionText

    if ($VerifySttManagedTransform) {
      Write-SpokenInstructionAudio $SpokenInstruction $spokenInstructionAudioPath
      $sttRequest = [ordered]@{
        runId = $RunId
        audioPath = $spokenInstructionAudioRelativePath
        mode = 'real'
        allowProviderCall = $true
        postProcess = @{ enabled = $false }
      }
      $sttRequestJson = $sttRequest | ConvertTo-Json -Depth 8 -Compress
      $sttExpression = "window.__TAURI_INTERNALS__.invoke('transcribe_captured_audio', { request: $sttRequestJson }).then(o=>JSON.stringify(o))"
      $sttOutcome = Invoke-CdpJson $sttExpression 60000
      $sttTranscript = if ($sttOutcome.status -eq 'ok') { [string]$sttOutcome.text } else { '' }
      $report.sttOutcome = [ordered]@{
        status = $sttOutcome.status
        provider = if ($sttOutcome.status -eq 'ok') { $sttOutcome.provider } else { $null }
        model = if ($sttOutcome.status -eq 'ok') { $sttOutcome.model } else { $null }
        transcriptLength = $sttTranscript.Length
        transcriptSha256 = if ($sttTranscript.Length -gt 0) { Get-Sha256Hex $sttTranscript } else { $null }
        audioArtifact = $spokenInstructionAudioRelativePath
        rawTextRecorded = $false
        errorCode = if ($sttOutcome.status -ne 'ok') { $sttOutcome.error.code } else { $null }
      }
      Add-Check 'managed STT returned redacted instruction transcript' ($sttOutcome.status -eq 'ok' -and $sttTranscript.Trim().Length -gt 0) $report.sttOutcome
      $transformInstruction = $sttTranscript
    }

    if ($VerifyManagedTransform -or $VerifySttManagedTransform) {
      $transformRequest = [ordered]@{
        runId = $RunId
        selectedText = $selectedText
        instruction = $transformInstruction
        mode = 'real'
        allowProviderCall = $true
      }
      $transformRequestJson = $transformRequest | ConvertTo-Json -Depth 8 -Compress
      $transformExpression = "window.__TAURI_INTERNALS__.invoke('transform_selected_text', { request: $transformRequestJson }).then(o=>JSON.stringify(o))"
      $transformOutcome = Invoke-CdpJson $transformExpression 60000
      $transformOutput = if ($transformOutcome.status -eq 'ok') { [string]$transformOutcome.text } else { '' }
      $report.managedTransformOutcome = [ordered]@{
        status = $transformOutcome.status
        provider = if ($transformOutcome.status -eq 'ok') { $transformOutcome.provider } else { $null }
        model = if ($transformOutcome.status -eq 'ok') { $transformOutcome.model } else { $null }
        latencyMs = if ($transformOutcome.status -eq 'ok') { $transformOutcome.latencyMs } else { $null }
        requestId = if ($transformOutcome.status -eq 'ok') { $transformOutcome.requestId } else { $null }
        outputLength = $transformOutput.Length
        outputSha256 = if ($transformOutput.Length -gt 0) { Get-Sha256Hex $transformOutput } else { $null }
        outputNormalizedSha256 = if ($transformOutput.Length -gt 0) { Get-Sha256Hex (Normalize-Text $transformOutput) } else { $null }
        expectedFinalNormalizedSha256 = if ($VerifySttManagedTransform) { Get-Sha256Hex (Normalize-Text $ExpectedFinalText) } else { $null }
        rawTextRecorded = $false
        errorCode = if ($transformOutcome.status -ne 'ok') { $transformOutcome.error.code } else { $null }
        retryable = if ($transformOutcome.status -ne 'ok') { [bool]$transformOutcome.retryable } else { $null }
      }
      Add-Check 'managed selection transform returned redacted output' ($transformOutcome.status -eq 'ok' -and $transformOutput.Trim().Length -gt 0 -and [bool]$transformOutcome.redacted) $report.managedTransformOutcome
      if ($VerifySttManagedTransform) {
        Add-Check 'managed transform output matches expected synthetic result' ((Get-Sha256Hex (Normalize-Text $transformOutput)) -eq (Get-Sha256Hex (Normalize-Text $ExpectedFinalText))) $report.managedTransformOutcome
      }
      $deliveryText = $transformOutput
    }

    $replacementJson = $deliveryText | ConvertTo-Json -Compress
    $targetJson = $deliveryTarget | ConvertTo-Json -Depth 8 -Compress
    $deliverExpression = "window.__TAURI_INTERNALS__.invoke('deliver_text_to_desktop_target', { text: $replacementJson, target: $targetJson, pressEnterAfterPaste: false }).then(o=>JSON.stringify(o))"
    $deliveryOutcome = Invoke-CdpJson $deliverExpression
    $report.deliveryOutcome = [ordered]@{
      status = $deliveryOutcome.status
      reason = $deliveryOutcome.reason
      targetRedacted = [ordered]@{
        appLabel = $deliveryOutcome.target.appLabel
        windowLabel = $deliveryOutcome.target.windowLabel
        confidence = $deliveryOutcome.target.confidence
      }
    }
    Add-Check 'replace-selection delivery returned paste status' (@('paste_sent','paste_observed') -contains [string]$deliveryOutcome.status) $report.deliveryOutcome

    $expectedReplacementHash = Get-Sha256Hex $deliveryText
    $matchedReplacement = $false
    $replacementState = $null
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline) {
      if (Test-Path $targetLiveStatePath) {
        $replacementState = Get-Content -Raw -Path $targetLiveStatePath | ConvertFrom-Json
        if ([string]$replacementState.currentTextSha256 -eq $expectedReplacementHash -and [int]$replacementState.currentTextLength -eq $deliveryText.Length) {
          $matchedReplacement = $true
          break
        }
      }
      Start-Sleep -Milliseconds 200
    }
    $report.replacementOutcome = [ordered]@{
      matchedReplacement = $matchedReplacement
      expectedLength = $deliveryText.Length
      currentTextLength = if ($replacementState) { [int]$replacementState.currentTextLength } else { $null }
      expectedSha256 = $expectedReplacementHash
      currentTextSha256 = if ($replacementState) { [string]$replacementState.currentTextSha256 } else { $null }
      rawTextRecorded = $false
    }
    Add-Check 'target text replaced synthetic selection without recording raw text' $matchedReplacement $report.replacementOutcome
  }

  $failedChecks = @($report.checks | Where-Object { -not [bool]$_.pass })
  if ($failedChecks.Count -gt 0) {
    throw "Selection capture smoke has failed checks: $($failedChecks.name -join ', ')"
  }
  $report.status = 'passed'
}
catch {
  $report.status = 'failed'
  $report.errors += $_.Exception.Message
  throw
}
finally {
  $report.finishedAt = (Get-Date).ToString('o')
  try { if (Test-Path $targetLiveStatePath) { Copy-Item -Path $targetLiveStatePath -Destination $targetStatePath -Force } } catch {}
  $cleanupErrors = [System.Collections.Generic.List[string]]::new()

  $ownedTauriProcessIdsBeforeCleanup = @(
    @($tauriProcessTreeIds)
    if ($launchedAppProcessId) { [int]$launchedAppProcessId }
    if ($tauriProc) { @(Get-ProcessTreeIds ([int]$tauriProc.Id)) }
  ) | Where-Object { $_ -and [int]$_ -gt 0 } | Select-Object -Unique
  $ownedTargetProcessIdsBeforeCleanup = @(
    @($targetProcessTreeIds)
    if ($targetProc) { @(Get-ProcessTreeIds ([int]$targetProc.Id)) }
    if ($targetWindow) { [int]$targetWindow.Id }
  ) | Where-Object { $_ -and [int]$_ -gt 0 } | Select-Object -Unique
  $ownedProcessIdsBeforeCleanup = @(
    @($ownedTauriProcessIdsBeforeCleanup)
    @($ownedTargetProcessIdsBeforeCleanup)
  ) | Where-Object { $_ -and [int]$_ -gt 0 } | Select-Object -Unique
  $remainingTauriProcessIds = @()
  $remainingTargetProcessIds = @()
  $remainingOwnedProcessIds = @()
  $tauriProcessTreeTerminated = $false
  $targetProcessTreeTerminated = $false
  try {
    if ($targetProc -and -not $targetProc.HasExited) { Stop-Tree $targetProc.Id }
    if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree $tauriProc.Id }
    if ($launchedAppProcessId -and (Get-Process -Id ([int]$launchedAppProcessId) -ErrorAction SilentlyContinue)) {
      Stop-Tree ([int]$launchedAppProcessId)
    }
    foreach ($ownedProcessId in @($ownedProcessIdsBeforeCleanup)) {
      if (Get-Process -Id ([int]$ownedProcessId) -ErrorAction SilentlyContinue) {
        Stop-Tree ([int]$ownedProcessId)
      }
    }
    $treeDeadline = (Get-Date).AddSeconds(10)
    $remainingTauriProcessIds = @(Get-ExistingProcessIds $ownedTauriProcessIdsBeforeCleanup)
    $remainingTargetProcessIds = @(Get-ExistingProcessIds $ownedTargetProcessIdsBeforeCleanup)
    $remainingOwnedProcessIds = @(
      @($remainingTauriProcessIds)
      @($remainingTargetProcessIds)
    ) | Where-Object { $_ -and [int]$_ -gt 0 } | Select-Object -Unique
    while ($remainingOwnedProcessIds.Count -gt 0 -and (Get-Date) -lt $treeDeadline) {
      Start-Sleep -Milliseconds 250
      $remainingTauriProcessIds = @(Get-ExistingProcessIds $ownedTauriProcessIdsBeforeCleanup)
      $remainingTargetProcessIds = @(Get-ExistingProcessIds $ownedTargetProcessIdsBeforeCleanup)
      $remainingOwnedProcessIds = @(
        @($remainingTauriProcessIds)
        @($remainingTargetProcessIds)
      ) | Where-Object { $_ -and [int]$_ -gt 0 } | Select-Object -Unique
    }
    $tauriProcessTreeTerminated = $remainingTauriProcessIds.Count -eq 0
    $targetProcessTreeTerminated = $remainingTargetProcessIds.Count -eq 0
  } catch {
    $cleanupErrors.Add("process_tree: $($_.Exception.Message)") | Out-Null
  }
  if (-not $tauriProcessTreeTerminated) {
    $cleanupErrors.Add("process_tree: owned Tauri process tree did not terminate ($($remainingTauriProcessIds -join ', '))") | Out-Null
  }
  if (-not $targetProcessTreeTerminated) {
    $cleanupErrors.Add("target_process_tree: owned target fixture process tree did not terminate ($($remainingTargetProcessIds -join ', '))") | Out-Null
  }

  try {
    if ($liveRootCreated -and (Test-Path $liveRoot)) {
      Remove-Item -LiteralPath $liveRoot -Recurse -Force -ErrorAction Stop
    }
  } catch {
    $cleanupErrors.Add("live_root_remove: $($_.Exception.Message)") | Out-Null
  }
  $liveRootRemoved = -not (Test-Path -LiteralPath $liveRoot)
  $webViewUserDataRemoved = -not (Test-Path -LiteralPath $webViewUserDataRoot)
  if (-not $liveRootRemoved) { $cleanupErrors.Add("live_root_remove: liveRoot remains") | Out-Null }
  if (-not $webViewUserDataRemoved) { $cleanupErrors.Add("profile_remove: WebView2 profile remains") | Out-Null }

  $environmentRestoreErrors = [System.Collections.Generic.List[string]]::new()
  foreach ($name in $environmentNames) {
    $snapshot = $previousEnvironment[$name]
    try {
      if ($snapshot.present) {
        Set-Item -LiteralPath "Env:$name" -Value ([string]$snapshot.value) -ErrorAction Stop
      } elseif (Test-Path "Env:$name") {
        Remove-Item -LiteralPath "Env:$name" -ErrorAction Stop
      }
    } catch {
      $environmentRestoreErrors.Add("${name}: $($_.Exception.Message)") | Out-Null
    }
  }
  $environmentRestored = $true
  $environmentChecks = [ordered]@{}
  foreach ($name in $environmentNames) {
    $snapshot = $previousEnvironment[$name]
    $currentPresent = Test-Path "Env:$name"
    $currentValue = if ($currentPresent) { [Environment]::GetEnvironmentVariable($name, 'Process') } else { $null }
    $matches = $currentPresent -eq [bool]$snapshot.present -and (-not $snapshot.present -or $currentValue -eq [string]$snapshot.value)
    $environmentChecks[$name] = [ordered]@{ presentRestored = ($currentPresent -eq [bool]$snapshot.present); valueRestored = $matches }
    if (-not $matches) {
      $environmentRestored = $false
    }
  }
  foreach ($restoreError in $environmentRestoreErrors) {
    $cleanupErrors.Add("environment_restore: $restoreError") | Out-Null
  }
  if (-not $environmentRestored -and $environmentRestoreErrors.Count -eq 0) {
    $cleanupErrors.Add('environment_restore: snapshot mismatch') | Out-Null
  }
  $report.cleanup = [ordered]@{
    liveRootOwned = $liveRootCreated
    liveRootRemoved = $liveRootRemoved
    webViewUserDataRemoved = $webViewUserDataRemoved
    preservedPreexistingProcessIds = @($existingAppProcessIds)
    ownedProcessIdsBeforeCleanup = @($ownedProcessIdsBeforeCleanup)
    ownedTauriProcessIdsBeforeCleanup = @($ownedTauriProcessIdsBeforeCleanup)
    ownedTargetProcessIdsBeforeCleanup = @($ownedTargetProcessIdsBeforeCleanup)
    remainingOwnedProcessIds = @($remainingOwnedProcessIds)
    remainingLaunchedProcessIds = @($remainingOwnedProcessIds)
    remainingTauriProcessIds = @($remainingTauriProcessIds)
    remainingTargetProcessIds = @($remainingTargetProcessIds)
    tauriProcessTreeTerminated = $tauriProcessTreeTerminated
    targetProcessTreeTerminated = $targetProcessTreeTerminated
    environmentRestored = $environmentRestored
    environmentChecks = $environmentChecks
    cleanupFailed = $cleanupErrors.Count -gt 0
    cleanupErrors = $cleanupErrors.ToArray()
  }
  if ($cleanupErrors.Count -gt 0) {
    $report.status = 'failed'
    $report.errors += $cleanupErrors.ToArray()
  }
  $report | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Output "Selection capture smoke report: $reportPath"
}
