param(
  [switch]$AllowDesktopSideEffects,
  [switch]$AllowProviderCall,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$SelectedText = 'hola amigo',
  [string]$SpokenInstruction = 'translate to English',
  [string]$ExpectedFinalText = 'hello friend',
  [ValidateSet('CtrlShiftF9','AltSpace')]
  [string]$DictationKey = 'AltSpace',
  [ValidateSet('none','como-yo-es','corregir-texto','fix-writing','like-me-en')]
  [string]$PresetId = 'none',
  [switch]$UseAltQPicker,
  [int]$InitialDelaySeconds = 6,
  [int]$RecordingSeconds = 2,
  [int]$DeliveryTimeoutSeconds = 180,
  [int]$TauriDebugPort = 9341,
  [int]$BrowserDebugPort = 9351,
  [string]$BrowserPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Browser selection smoke launches Tauri and Chrome, sends global hotkeys, captures synthetic selected text, and replaces it in a real browser textarea. Re-run with -AllowDesktopSideEffects after explicit approval.'
}
if (-not $AllowProviderCall) {
  throw 'Browser selection smoke calls Fixvox Cloud STT/transform providers. Re-run with -AllowProviderCall after explicit approval.'
}
if (-not (Test-Path $BrowserPath)) {
  throw "Browser not found: $BrowserPath"
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/selection-browser-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$reportPath = Join-Path $runRoot 'report.json'
$targetHtmlPath = Join-Path $runRoot 'browser-target.html'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
$browserUserData = Join-Path $env:TEMP "dictation-tauri-browser-smoke\$RunId\chrome-profile"
New-Item -ItemType Directory -Force -Path $browserUserData | Out-Null

$startedAt = Get-Date
$tauriProc = $null
$browserProc = $null

Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SelectionBrowserSmokeWin32 {
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
  $hwnd = [SelectionBrowserSmokeWin32]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][SelectionBrowserSmokeWin32]::GetWindowText($hwnd, $sb, $sb.Capacity)
  return [ordered]@{ hwnd = $hwnd.ToInt64(); title = $sb.ToString() }
}

function Focus-WindowWithAttach([IntPtr]$Hwnd) {
  $SW_RESTORE = 9
  [void][SelectionBrowserSmokeWin32]::ShowWindow($Hwnd, $SW_RESTORE)
  $foreground = [SelectionBrowserSmokeWin32]::GetForegroundWindow()
  [uint32]$targetPid = 0
  [uint32]$foregroundPid = 0
  $currentThread = [SelectionBrowserSmokeWin32]::GetCurrentThreadId()
  $targetThread = [SelectionBrowserSmokeWin32]::GetWindowThreadProcessId($Hwnd, [ref]$targetPid)
  $foregroundThread = if ($foreground -ne [IntPtr]::Zero) { [SelectionBrowserSmokeWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) } else { 0 }
  $attachedTarget = $false
  $attachedForeground = $false
  try {
    if ($targetThread -ne 0 -and $targetThread -ne $currentThread) { $attachedTarget = [SelectionBrowserSmokeWin32]::AttachThreadInput($currentThread, $targetThread, $true) }
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and $foregroundThread -ne $targetThread) { $attachedForeground = [SelectionBrowserSmokeWin32]::AttachThreadInput($currentThread, $foregroundThread, $true) }
    [void][SelectionBrowserSmokeWin32]::BringWindowToTop($Hwnd)
    [void][SelectionBrowserSmokeWin32]::SetForegroundWindow($Hwnd)
    [void][SelectionBrowserSmokeWin32]::SetFocus($Hwnd)
  } finally {
    if ($attachedForeground) { [void][SelectionBrowserSmokeWin32]::AttachThreadInput($currentThread, $foregroundThread, $false) }
    if ($attachedTarget) { [void][SelectionBrowserSmokeWin32]::AttachThreadInput($currentThread, $targetThread, $false) }
  }
}

function Release-Modifiers() {
  $KEYEVENTF_KEYUP = 0x0002
  foreach ($vk in @(0x11, 0x10, 0x12, 0x5B, 0x5C)) {
    [SelectionBrowserSmokeWin32]::keybd_event([byte]$vk, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  }
}

function Send-CtrlShiftF9() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_CONTROL = 0x11
  $VK_SHIFT = 0x10
  $VK_F9 = 0x78
  Release-Modifiers
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
  [SelectionBrowserSmokeWin32]::keybd_event($VK_SHIFT, 0, 0, [UIntPtr]::Zero)
  [SelectionBrowserSmokeWin32]::keybd_event($VK_F9, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [SelectionBrowserSmokeWin32]::keybd_event($VK_F9, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [SelectionBrowserSmokeWin32]::keybd_event($VK_SHIFT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [SelectionBrowserSmokeWin32]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Release-Modifiers
}

function Send-AltSpace() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_SPACE = 0x20
  Release-Modifiers
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_SPACE, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [SelectionBrowserSmokeWin32]::keybd_event($VK_SPACE, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Release-Modifiers
}

function Send-AltQ() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_Q = 0x51
  Release-Modifiers
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_Q, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [SelectionBrowserSmokeWin32]::keybd_event($VK_Q, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SelectionBrowserSmokeWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Release-Modifiers
}

function Select-PresetPickerResult([object]$PickerPage, [string]$Preset) {
  $query = switch ($Preset) {
    'como-yo-es' { 'como' }
    'corregir-texto' { 'corregir' }
    'fix-writing' { 'fix' }
    'like-me-en' { 'like' }
    default { $Preset }
  }
  $queryJson = $query | ConvertTo-Json -Compress
  $selection = Invoke-CdpJson $PickerPage.webSocketDebuggerUrl @"
(async () => {
  const input = document.getElementById('dock-preset-picker-search');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!input || !setter) return JSON.stringify({ ready: false });
  setter.call(input, $queryJson);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const debug = window.__dictationPresetPickerDebug || null;
  return JSON.stringify({ ready: true, debug });
})()
"@ 5000
  if (-not $selection.ready -or $selection.debug.selectedPresetId -ne $Preset) {
    throw "Preset picker search did not select $Preset. State: $(($selection | ConvertTo-Json -Compress -Depth 8))"
  }
  $click = Invoke-CdpJson $PickerPage.webSocketDebuggerUrl "(() => { const button = document.querySelector('.dock-preset-picker-item.selected'); if (button) button.click(); return JSON.stringify({ clicked: Boolean(button) }); })()" 5000
  if (-not $click.clicked) {
    throw "Preset picker result for $Preset was not clickable."
  }
}

function Send-DictationKey() {
  if ($DictationKey -eq 'AltSpace') { Send-AltSpace; return }
  Send-CtrlShiftF9
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

function Normalize-Text([string]$Text) {
  if ($null -eq $Text) { return '' }
  return ($Text.ToLowerInvariant() -replace '[^a-z0-9 ]', ' ' -replace '\s+', ' ').Trim()
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

function Invoke-CdpJson([string]$WebSocketUrl, [string]$Expression, [int]$TimeoutMs = 15000) {
  $wrapped = @"
(async () => {
  return await ($Expression);
})()
"@
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($wrapped))
  $previousTimeout = $env:CDP_EVALUATE_TIMEOUT_MS
  $env:CDP_EVALUATE_TIMEOUT_MS = [string]$TimeoutMs
  $lastRaw = $null
  $previousNativeErrorPreference = $null
  $hasNativeErrorPreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue
  if ($hasNativeErrorPreference) {
    $previousNativeErrorPreference = $Global:PSNativeCommandUseErrorActionPreference
    $Global:PSNativeCommandUseErrorActionPreference = $false
  }
  try {
    for ($attempt = 1; $attempt -le 3; $attempt += 1) {
      $raw = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $WebSocketUrl "base64:$encoded" 2>$null
      $lastRaw = $raw
      if ($LASTEXITCODE -eq 0) {
        return ($raw | ConvertFrom-Json)
      }
      Start-Sleep -Milliseconds (300 * $attempt)
    }
  } finally {
    if ($hasNativeErrorPreference) { $Global:PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference }
    if ($null -eq $previousTimeout) { Remove-Item Env:CDP_EVALUATE_TIMEOUT_MS -ErrorAction SilentlyContinue } else { $env:CDP_EVALUATE_TIMEOUT_MS = $previousTimeout }
  }
  throw "CDP evaluation failed after retries. Last output length: $(([string]$lastRaw).Length)"
}

function Wait-ForCdpPage([int]$Port, [string]$TitleLike, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
      $page = $pages | Where-Object { $_.url -eq 'http://127.0.0.1:1420/' } | Select-Object -First 1
      if (-not $page) { $page = $pages | Where-Object { $_.title -like $TitleLike -or $_.url -like '*browser-target.html*' } | Select-Object -First 1 }
      if ($page) { return $page }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  throw "CDP page was not available on port $Port before timeout."
}

function Wait-ForCdpPageUrlLike([int]$Port, [string]$UrlLike, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
      $page = $pages | Where-Object { $_.url -like $UrlLike } | Select-Object -First 1
      if ($page) { return $page }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  throw "CDP page matching $UrlLike was not available on port $Port before timeout."
}

function Wait-ForPresetPickerReady([int]$Port, [int]$TimeoutSeconds = 8) {
  $page = Wait-ForCdpPageUrlLike $Port '*surface=preset-picker*' $TimeoutSeconds
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = $null
  while ((Get-Date) -lt $deadline) {
    $last = Invoke-CdpJson $page.webSocketDebuggerUrl "(() => JSON.stringify({ debug: window.__dictationPresetPickerDebug || null, activeId: document.activeElement?.id || null, hasInput: Boolean(document.getElementById('dock-preset-picker-search')), title: document.title, href: location.href }))()" 5000
    if ($last.debug -and $last.debug.open -eq $true -and $last.hasInput -eq $true) {
      return [ordered]@{ page = $page; state = $last }
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Preset picker did not become ready. Last state: $(($last | ConvertTo-Json -Compress -Depth 8))"
}

function Wait-ForPresetPickerExecution([object]$PickerPage, [string]$PresetId, [int]$TimeoutSeconds = 4) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = $null
  while ((Get-Date) -lt $deadline) {
    $last = Invoke-CdpJson $PickerPage.webSocketDebuggerUrl "(() => JSON.stringify(window.__dictationPresetPickerDebug || null))()" 5000
    if ($last -and $last.lastAction -eq 'execute' -and $last.lastExecutedPresetId -eq $PresetId) {
      return $last
    }
    Start-Sleep -Milliseconds 200
  }
  throw "Preset picker did not execute $PresetId after Enter. Last debug: $(($last | ConvertTo-Json -Compress -Depth 8))"
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
    if ($tauriProc -and $tauriProc.HasExited) { throw "tauri dev exited early with code $($tauriProc.ExitCode). See $tauriOutLog and $tauriErrLog" }
    $appProcess = Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($appProcess) { return $appProcess }
    Start-Sleep -Milliseconds 500
  }
  throw 'dictation-tauri window was not available before timeout.'
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null) {
  $entry = [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  $script:report.checks += $entry
  if (-not $Pass) { throw "Browser selection smoke check failed: $Name" }
}

$title = "Selection Browser Target $RunId"
$htmlSelected = [System.Net.WebUtility]::HtmlEncode($SelectedText)
$htmlTitle = [System.Net.WebUtility]::HtmlEncode($title)
Set-Content -Path $targetHtmlPath -Encoding UTF8 -Value @"
<!doctype html>
<html>
<head><meta charset="utf-8"><title>$htmlTitle</title></head>
<body style="font-family: system-ui; padding: 24px;">
  <label for="target">Selection Browser Target</label><br />
  <textarea id="target" aria-label="Selection Browser Textarea" style="width: 720px; height: 220px; font-size: 20px;">$htmlSelected</textarea>
  <script>
    const target = document.getElementById('target');
    window.__selectionSmokeState = () => ({ value: target.value, selectionStart: target.selectionStart, selectionEnd: target.selectionEnd, activeId: document.activeElement?.id || null });
  </script>
</body>
</html>
"@

$report = [ordered]@{
  check = 'selection-browser-hotkey-e2e'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  root = $runRoot
  approved = [ordered]@{ desktopSideEffects = [bool]$AllowDesktopSideEffects; providerCall = [bool]$AllowProviderCall }
  browser = [ordered]@{ path = $BrowserPath; debugPort = $BrowserDebugPort }
  dictationKey = $DictationKey
  presetId = $PresetId
  useAltQPicker = [bool]$UseAltQPicker
  selectedTextFixture = [ordered]@{ synthetic = $true; expectedLength = $SelectedText.Length; expectedSha256 = Get-Sha256Hex $SelectedText; rawTextRecorded = $false }
  spokenInstructionFixture = [ordered]@{ synthetic = $true; expectedLength = $SpokenInstruction.Length; expectedSha256 = Get-Sha256Hex $SpokenInstruction; rawTextRecorded = $false }
  expectedFinal = [ordered]@{ expectedLength = $ExpectedFinalText.Length; expectedNormalizedSha256 = Get-Sha256Hex (Normalize-Text $ExpectedFinalText); rawTextRecorded = $false }
  checks = @()
  warnings = @()
  errors = @()
  artifacts = [ordered]@{ report = $reportPath; targetHtml = $targetHtmlPath; tauriStdout = $tauriOutLog; tauriStderr = $tauriErrLog }
}

try {
  if ($DictationKey -eq 'CtrlShiftF9') {
    $env:DICTATION_TAURI_DICTATION_KEY = 'Ctrl+Shift+F9'
    Remove-Item Env:DICTATION_TAURI_ALLOW_ALT_SPACE -ErrorAction SilentlyContinue
  } else {
    $env:DICTATION_TAURI_DICTATION_KEY = 'Alt+Space'
    $env:DICTATION_TAURI_ALLOW_ALT_SPACE = 'true'
  }
  Remove-Item Env:DICTATION_TAURI_ALLOW_SELECTION_CLIPBOARD_FALLBACK -ErrorAction SilentlyContinue
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$TauriDebugPort"

  $tauriProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','tauri:dev') -WorkingDirectory $repo -RedirectStandardOutput $tauriOutLog -RedirectStandardError $tauriErrLog -PassThru
  $tauriWindow = Wait-ForTauriWindow 80
  $report.tauri = [ordered]@{ pid = $tauriWindow.Id; hwnd = $tauriWindow.MainWindowHandle.ToInt64(); title = $tauriWindow.MainWindowTitle }
  Add-Check 'tauri dictation dock launched' ($tauriWindow.MainWindowHandle -ne 0) $report.tauri

  $tauriPage = Wait-ForCdpPage $TauriDebugPort '*Dictation Tauri*' 80
  Add-Check 'tauri CDP page available' ($null -ne $tauriPage.webSocketDebuggerUrl) @{ title = $tauriPage.title; url = $tauriPage.url }
  $tauriReadyExpression = @'
(async () => {
  for (let i = 0; i < 100; i += 1) {
    const dock = document.querySelector('[data-testid="voice-dock"]');
    if (dock) {
      return JSON.stringify({ ready: true, phase: dock.getAttribute('data-phase'), href: location.href });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return JSON.stringify({ ready: false, href: location.href, title: document.title });
})()
'@
  $tauriReady = Invoke-CdpJson $tauriPage.webSocketDebuggerUrl $tauriReadyExpression 15000
  Add-Check 'tauri dock renderer ready for smoke commands' ($tauriReady.ready -eq $true) $tauriReady
  if ($PresetId -ne 'none' -and -not $UseAltQPicker) {
    $presetJson = $PresetId | ConvertTo-Json -Compress
    $presetState = Invoke-CdpJson $tauriPage.webSocketDebuggerUrl "(() => { window.dispatchEvent(new CustomEvent('dictation-tauri:host-command', { detail: { source: 'tray_or_context_menu', command: 'select_preset', presetId: $presetJson } })); return JSON.stringify({ presetId: $presetJson }); })()"
    $report.selectedPreset = [ordered]@{ presetId = $presetState.presetId }
    Add-Check 'selection transform preset selected in app' ($presetState.presetId -eq $PresetId) $report.selectedPreset
  }

  if ($UseAltQPicker -and $PresetId -eq 'none') {
    throw 'UseAltQPicker requires -PresetId como-yo-es|corregir-texto|fix-writing|like-me-en.'
  }

  Start-Sleep -Seconds $InitialDelaySeconds

  $targetUrl = (New-Object System.Uri($targetHtmlPath)).AbsoluteUri
  $browserProc = Start-Process -FilePath $BrowserPath -ArgumentList @("--remote-debugging-port=$BrowserDebugPort", "--user-data-dir=$browserUserData", '--force-renderer-accessibility', '--no-first-run', '--new-window', $targetUrl) -PassThru
  $browserPage = Wait-ForCdpPage $BrowserDebugPort "*$title*" 60
  $report.browser.pageTitle = $browserPage.title
  $report.browser.pageUrlRedacted = 'file://.../browser-target.html'
  Add-Check 'browser CDP target page available' ($null -ne $browserPage.webSocketDebuggerUrl) @{ title = $browserPage.title; url = 'file://.../browser-target.html' }

  $browserWindow = Wait-ForWindowByTitle "*$title*" 60
  $report.browser.window = [ordered]@{ pid = $browserWindow.Id; hwnd = $browserWindow.MainWindowHandle.ToInt64(); title = 'Selection Browser Target [redacted]' }
  Add-Check 'browser target window launched' ($browserWindow.MainWindowHandle -ne 0) $report.browser.window

  $setupState = Invoke-CdpJson $browserPage.webSocketDebuggerUrl @"
(() => {
  const target = document.getElementById('target');
  target.focus();
  target.setSelectionRange(0, target.value.length);
  return JSON.stringify({ length: target.value.length, selectionStart: target.selectionStart, selectionEnd: target.selectionEnd, activeId: document.activeElement?.id || null });
})()
"@
  Add-Check 'browser textarea selected synthetic text' ([int]$setupState.selectionStart -eq 0 -and [int]$setupState.selectionEnd -eq $SelectedText.Length) $setupState

  Focus-WindowWithAttach ([IntPtr]$browserWindow.MainWindowHandle)
  Start-Sleep -Milliseconds 700
  $report.foregroundBeforeHotkey = Get-ForegroundTitle
  Add-Check 'browser foreground before hotkey selection transform' ($report.foregroundBeforeHotkey.hwnd -eq $browserWindow.MainWindowHandle.ToInt64()) @{ hwnd = $report.foregroundBeforeHotkey.hwnd; title = 'Selection Browser Target [redacted]' }

  if ($UseAltQPicker) {
    Send-AltQ
    $report.hotkeyStartAt = (Get-Date).ToString('o')
    $pickerReady = Wait-ForPresetPickerReady $TauriDebugPort 10
    $report.presetPickerReady = [ordered]@{ url = $pickerReady.page.url; state = $pickerReady.state }
    Add-Check 'Alt+Q preset picker opened and exposed debug state' ($pickerReady.state.debug.open -eq $true) $report.presetPickerReady
    Select-PresetPickerResult $pickerReady.page $PresetId
    $pickerExecuted = Wait-ForPresetPickerExecution $pickerReady.page $PresetId 5
    $report.presetPickerExecuted = $pickerExecuted
    Add-Check 'Alt+Q preset picker executed requested preset' ($pickerExecuted.lastExecutedPresetId -eq $PresetId) $pickerExecuted
    Start-Sleep -Milliseconds 600
    $mainPickerDebug = Invoke-CdpJson $tauriPage.webSocketDebuggerUrl "(() => JSON.stringify(window.__dictationPresetPickerMainDebug || null))()" 5000
    $report.presetPickerMainDebug = $mainPickerDebug
    Add-Check 'Alt+Q preset picker command reached dock runtime' ($mainPickerDebug -and $mainPickerDebug.presetId -eq $PresetId) $mainPickerDebug
    if ($mainPickerDebug.lastAction -ne 'transform_selection') {
      throw "Alt+Q picker did not enter selected-text preset path. Main debug: $(($mainPickerDebug | ConvertTo-Json -Compress -Depth 8))"
    }
    $report.hotkeyStopAt = (Get-Date).ToString('o')
  } else {
    Send-DictationKey
    $report.hotkeyStartAt = (Get-Date).ToString('o')
    Start-Sleep -Milliseconds 800
    Speak-TestPhrase $SpokenInstruction
    $report.spokenInstructionAt = (Get-Date).ToString('o')
    if ($RecordingSeconds -gt 0) { Start-Sleep -Seconds $RecordingSeconds }
    Send-DictationKey
    $report.hotkeyStopAt = (Get-Date).ToString('o')
  }

  $expectedNormalizedHash = Get-Sha256Hex (Normalize-Text $ExpectedFinalText)
  $matched = $false
  $current = $null
  $deadline = (Get-Date).AddSeconds($DeliveryTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $state = Invoke-CdpJson $browserPage.webSocketDebuggerUrl "(() => JSON.stringify(window.__selectionSmokeState()))()"
    $value = [string]$state.value
    $current = [ordered]@{ length = $value.Length; normalizedSha256 = Get-Sha256Hex (Normalize-Text $value); selectionStart = $state.selectionStart; selectionEnd = $state.selectionEnd; activeId = $state.activeId }
    if ($current.normalizedSha256 -eq $expectedNormalizedHash) { $matched = $true; break }
    if ($tauriProc -and $tauriProc.HasExited) { throw "tauri dev exited during browser selection transform wait with code $($tauriProc.ExitCode). See logs." }
    Start-Sleep -Seconds 2
  }

  if (-not $matched) {
    try {
      $report.runtimeDiagnostic = Invoke-CdpJson $tauriPage.webSocketDebuggerUrl @"
(() => {
  const deliveryLabel = [...document.querySelectorAll('dt')].find((node) => node.textContent?.trim() === 'Delivery');
  return JSON.stringify({
    dockPhase: document.querySelector('[data-testid="voice-dock"]')?.getAttribute('data-phase') || null,
    pipelineState: document.querySelector('[data-testid="pipeline-state"]')?.textContent?.trim() || null,
    pipelineMessage: document.querySelector('[data-testid="pipeline-message"]')?.textContent?.trim() || null,
    delivery: deliveryLabel?.nextElementSibling?.textContent?.trim() || null,
    redactedRunSummary: document.querySelector('[data-testid="redacted-run-summary"]')?.textContent?.trim() || null
  });
})()
"@ 5000
    } catch {
      $report.warnings += "runtime diagnostic unavailable: $($_.Exception.Message)"
    }
  }

  $report.browserSelectionTransformOutcome = [ordered]@{
    matchedExpectedFinal = $matched
    expectedFinalLength = $ExpectedFinalText.Length
    currentTextLength = if ($current) { $current.length } else { $null }
    expectedFinalNormalizedSha256 = $expectedNormalizedHash
    currentTextNormalizedSha256 = if ($current) { $current.normalizedSha256 } else { $null }
    dictationKey = $DictationKey
    useAltQPicker = [bool]$UseAltQPicker
    rawTextRecorded = $false
  }
  $checkName = if ($UseAltQPicker) { 'browser Alt+Q picker preset replaced textarea selection' } else { 'browser hotkey voice STT selection transform replaced textarea selection' }
  Add-Check $checkName $matched $report.browserSelectionTransformOutcome
  if ($UseAltQPicker) {
    $activePresetState = Invoke-CdpJson $tauriPage.webSocketDebuggerUrl "(() => JSON.stringify({ active: Boolean(document.querySelector('[data-testid=voice-dock-preset-badge]')) }))()" 5000
    $report.activePresetAfterSelectionTransform = $activePresetState
    Add-Check 'Alt+Q selection transform did not leave a preset active' (-not $activePresetState.active) $activePresetState
  }
  $report.status = 'passed'
} catch {
  $report.status = 'failed'
  $report.errors += $_.Exception.Message
  throw
} finally {
  $report.finishedAt = (Get-Date).ToString('o')
  try { $report.foregroundAfter = Get-ForegroundTitle } catch {}
  try { if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree ([int]$tauriProc.Id) } } catch { $report.errors += "stop tauri: $($_.Exception.Message)" }
  try { if ($browserProc -and -not $browserProc.HasExited) { Stop-Tree ([int]$browserProc.Id) } } catch { $report.errors += "stop browser: $($_.Exception.Message)" }
  $report | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Output "Selection browser smoke report: $reportPath"
}
