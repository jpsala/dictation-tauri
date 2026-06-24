param(
  [switch]$AllowDesktopSideEffects,
  [switch]$AllowProviderCall,
  [switch]$AllowClipboardMutation,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$SpokenPhrase = 'dictation fixture green apple',
  [int]$InitialDelaySeconds = 12,
  [int]$RecordingSeconds = 7,
  [int]$DeliveryTimeoutSeconds = 180,
  [ValidateSet('CtrlShiftF9','AltSpace')]
  [string]$DictationKey = 'CtrlShiftF9',
  [switch]$SkipSpeechSynthesis
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Desktop dictation E2E opens Tauri, launches a target window, sends Ctrl+Shift+F9, and may paste into the target. Re-run with -AllowDesktopSideEffects only after explicit local approval.'
}
if (-not $AllowProviderCall) {
  throw 'Desktop dictation E2E calls the configured real provider path from the app. Re-run with -AllowProviderCall only after explicit approval.'
}
if (-not $AllowClipboardMutation) {
  throw 'Desktop dictation E2E mutates clipboard temporarily through app delivery. Re-run with -AllowClipboardMutation only after explicit approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/dictation-e2e/$RunId"
$audioRoot = Join-Path $repo 'artifacts/microphone-capture/audio'
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null

$targetScript = Join-Path $runRoot 'TargetFixture.ps1'
$targetTextPath = Join-Path $runRoot 'target-text.txt'
$targetStatePath = Join-Path $runRoot 'target-state.json'
# Keep live target output outside the repo: Vite dev watches the workspace and can crash
# on frequently-written artifact files on Windows (EBUSY from fs.watch).
$liveRoot = Join-Path $env:TEMP "dictation-tauri-e2e\$RunId"
New-Item -ItemType Directory -Force -Path $liveRoot | Out-Null
$targetLiveTextPath = Join-Path $liveRoot 'target-text.txt'
$targetLiveStatePath = Join-Path $liveRoot 'target-state.json'
$reportPath = Join-Path $runRoot 'report.json'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
$startedAt = Get-Date
$sentinel = "dictation-tauri-e2e-sentinel-$RunId"
$cua = Join-Path $env:LOCALAPPDATA 'Programs\Cua\cua-driver\bin\cua-driver.exe'
$targetProc = $null
$tauriProc = $null

# Avoid stale dev windows from previous failed runs being mistaken for this run.
Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'powershell' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'Dictation E2E Target *' } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DictationE2EWin32 {
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
  $hwnd = [DictationE2EWin32]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][DictationE2EWin32]::GetWindowText($hwnd, $sb, $sb.Capacity)
  return [ordered]@{ hwnd = $hwnd.ToInt64(); title = $sb.ToString() }
}

function Focus-WindowWithAttach([IntPtr]$Hwnd) {
  $SW_RESTORE = 9
  [void][DictationE2EWin32]::ShowWindow($Hwnd, $SW_RESTORE)
  $foreground = [DictationE2EWin32]::GetForegroundWindow()
  [uint32]$targetPid = 0
  [uint32]$foregroundPid = 0
  $currentThread = [DictationE2EWin32]::GetCurrentThreadId()
  $targetThread = [DictationE2EWin32]::GetWindowThreadProcessId($Hwnd, [ref]$targetPid)
  $foregroundThread = if ($foreground -ne [IntPtr]::Zero) { [DictationE2EWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) } else { 0 }
  $attachedTarget = $false
  $attachedForeground = $false
  try {
    if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
      $attachedTarget = [DictationE2EWin32]::AttachThreadInput($currentThread, $targetThread, $true)
    }
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and $foregroundThread -ne $targetThread) {
      $attachedForeground = [DictationE2EWin32]::AttachThreadInput($currentThread, $foregroundThread, $true)
    }
    [void][DictationE2EWin32]::BringWindowToTop($Hwnd)
    [void][DictationE2EWin32]::SetForegroundWindow($Hwnd)
    [void][DictationE2EWin32]::SetFocus($Hwnd)
  } finally {
    if ($attachedForeground) { [void][DictationE2EWin32]::AttachThreadInput($currentThread, $foregroundThread, $false) }
    if ($attachedTarget) { [void][DictationE2EWin32]::AttachThreadInput($currentThread, $targetThread, $false) }
  }
}

function Send-AltSpace() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_SPACE = 0x20
  [DictationE2EWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [DictationE2EWin32]::keybd_event($VK_SPACE, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [DictationE2EWin32]::keybd_event($VK_SPACE, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [DictationE2EWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Send-DictationKey() {
  if ($DictationKey -eq 'AltSpace') { Send-AltSpace; return }
  Send-CtrlShiftF9
}

function Send-CtrlShiftF9() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_CONTROL = 0x11
  $VK_SHIFT = 0x10
  $VK_F9 = 0x78
  [DictationE2EWin32]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
  [DictationE2EWin32]::keybd_event($VK_SHIFT, 0, 0, [UIntPtr]::Zero)
  [DictationE2EWin32]::keybd_event($VK_F9, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [DictationE2EWin32]::keybd_event($VK_F9, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [DictationE2EWin32]::keybd_event($VK_SHIFT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [DictationE2EWin32]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Invoke-CuaTool([string]$Tool, [hashtable]$ToolArgs = @{}) {
  if (-not (Test-Path $cua)) { throw "cua-driver not found at $cua" }
  $json = ($ToolArgs | ConvertTo-Json -Depth 16 -Compress)
  $out = $json | & $cua call $Tool
  if ($LASTEXITCODE -ne 0) { throw "cua-driver call $Tool failed: $out" }
  if ($out -is [array]) { $out = ($out -join "`n") }
  if ([string]::IsNullOrWhiteSpace($out)) { return $null }
  try { return ($out | ConvertFrom-Json) } catch { return $out }
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

function Wait-ForTauriWindow([int]$TimeoutSeconds = 70) {
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

function Speak-TestPhrase([string]$Phrase) {
  Add-Type -AssemblyName System.Speech
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $speaker.Rate = -2
  $speaker.Volume = 100
  $speaker.Speak($Phrase)
  $speaker.Dispose()
}

function Normalize-Text([string]$Text) {
  if ($null -eq $Text) { return '' }
  return ($Text.ToLowerInvariant() -replace '[^a-z0-9 ]', ' ' -replace '\s+', ' ').Trim()
}

function Test-ExpectedTokens([string]$Text, [string]$Phrase) {
  $normalizedText = Normalize-Text $Text
  $tokens = @((Normalize-Text $Phrase).Split(' ') | Where-Object { $_.Length -ge 4 } | Select-Object -Unique)
  $matched = @($tokens | Where-Object { $normalizedText -like "*$_*" })
  return [ordered]@{
    expectedTokenCount = $tokens.Count
    matchedTokenCount = $matched.Count
    matchedTokens = $matched
    pass = ($tokens.Count -gt 0 -and $matched.Count -ge [Math]::Min(2, $tokens.Count))
  }
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

Set-Content -Path $targetScript -Encoding UTF8 -Value @"
param([string]`$OutputTextPath, [string]`$OutputStatePath, [string]`$RunId)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
`$form = New-Object System.Windows.Forms.Form
`$form.Text = "Dictation E2E Target `$RunId"
`$form.StartPosition = 'Manual'
`$form.Location = New-Object System.Drawing.Point(80,120)
`$form.Size = New-Object System.Drawing.Size(780,360)
`$form.TopMost = `$false
`$form.KeyPreview = `$true

`$label = New-Object System.Windows.Forms.Label
`$label.Text = 'Dictation target fixture - paste here'
`$label.AutoSize = `$true
`$label.Location = New-Object System.Drawing.Point(16,16)
`$form.Controls.Add(`$label)

`$box = New-Object System.Windows.Forms.TextBox
`$box.Name = 'dictationTargetBox'
`$box.AccessibleName = 'Dictation E2E paste target'
`$box.Multiline = `$true
`$box.AcceptsReturn = `$true
`$box.ScrollBars = 'Vertical'
`$box.Location = New-Object System.Drawing.Point(16,48)
`$box.Size = New-Object System.Drawing.Size(730,220)
`$box.Font = New-Object System.Drawing.Font('Segoe UI', 12)
`$form.Controls.Add(`$box)

`$status = New-Object System.Windows.Forms.Label
`$status.Name = 'statusLabel'
`$status.AccessibleName = 'Dictation E2E target status'
`$status.Text = 'Waiting for paste'
`$status.AutoSize = `$true
`$status.Location = New-Object System.Drawing.Point(16,282)
`$form.Controls.Add(`$status)

function Write-State {
  `$text = `$box.Text
  `$text | Set-Content -Encoding UTF8 -Path `$OutputTextPath
  `$payload = [ordered]@{
    runId = `$RunId
    textLength = `$text.Length
    hasText = (`$text.Trim().Length -gt 0)
    updatedAt = (Get-Date).ToString('o')
  }
  `$payload | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -Path `$OutputStatePath
  `$status.Text = if (`$text.Trim().Length -gt 0) { "Received `$(`$text.Length) chars" } else { 'Waiting for paste' }
}

`$box.Add_TextChanged({ Write-State })
`$form.Add_KeyDown({
  param(`$sender, `$eventArgs)
  if (`$eventArgs.Control -and `$eventArgs.KeyCode -eq [System.Windows.Forms.Keys]::V) {
    `$clip = [System.Windows.Forms.Clipboard]::GetText()
    if (`$clip) {
      `$box.Focus()
      `$box.SelectedText = `$clip
      `$eventArgs.SuppressKeyPress = `$true
      Write-State
    }
  }
})
`$form.Add_Shown({
  `$form.TopMost = `$true
  `$form.Activate()
  `$box.Focus()
  Start-Sleep -Milliseconds 250
  `$form.TopMost = `$false
  Write-State
})
[System.Windows.Forms.Application]::Run(`$form)
"@

$report = [ordered]@{
  check = 'desktop-dictation-real-e2e'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  root = $runRoot
  approved = [ordered]@{
    desktopSideEffects = [bool]$AllowDesktopSideEffects
    providerCall = [bool]$AllowProviderCall
    clipboardMutation = [bool]$AllowClipboardMutation
  }
  dictationKey = $DictationKey
  spokenPhrase = [ordered]@{
    # This is a synthetic non-secret test fixture phrase; raw transcript output is kept only in ignored artifacts.
    text = $SpokenPhrase
    speechSynthesisSkipped = [bool]$SkipSpeechSynthesis
  }
  checks = @()
  warnings = @()
  errors = @()
  artifacts = [ordered]@{
    report = $reportPath
    targetText = $targetTextPath
    targetState = $targetStatePath
    tauriStdout = $tauriOutLog
    tauriStderr = $tauriErrLog
  }
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null, [bool]$NonGating = $false) {
  $entry = [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  if ($NonGating) { $entry.nonGating = $true }
  $script:report.checks += $entry
  if (-not $Pass -and -not $NonGating) { throw "E2E check failed: $Name" }
}

try {
  Add-Check 'cua-driver exists' (Test-Path $cua) $cua
  $report.cua = [ordered]@{
    version = (& $cua --version)
    autostart = (& $cua autostart status)
    mcpConfig = (& $cua mcp-config | Out-String).Trim()
  }
  $health = Invoke-CuaTool 'health_report'
  Add-Check 'cua health overall ok' ($health.overall -eq 'ok') $health
  Add-Check 'cua autostart disabled' ($report.cua.autostart -match 'not-registered') $report.cua.autostart

  $originalClipboard = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  Set-Clipboard -Value $sentinel
  $report.clipboard = [ordered]@{ sentinelSet = $true; sentinelLength = $sentinel.Length }

  if ($DictationKey -eq 'CtrlShiftF9') {
    $env:DICTATION_TAURI_DICTATION_KEY = 'Ctrl+Shift+F9'
  } else {
    Remove-Item Env:DICTATION_TAURI_DICTATION_KEY -ErrorAction SilentlyContinue
  }

  $tauriProc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run','tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $tauriOutLog `
    -RedirectStandardError $tauriErrLog `
    -PassThru
  $tauriWindow = Wait-ForTauriWindow 80
  $report.tauri = [ordered]@{ pid = $tauriWindow.Id; hwnd = $tauriWindow.MainWindowHandle.ToInt64(); title = $tauriWindow.MainWindowTitle }
  Add-Check 'tauri dictation dock launched' ($tauriWindow.MainWindowHandle -ne 0) $report.tauri

  Start-Sleep -Seconds $InitialDelaySeconds

  # Launch the target after the always-on-top dock is ready. This mirrors real use:
  # the user chooses the app/field to dictate into, then hits the global dictation key.
  $targetProc = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$targetScript,'-OutputTextPath',$targetLiveTextPath,'-OutputStatePath',$targetLiveStatePath,'-RunId',$RunId) `
    -PassThru
  $targetWindow = Wait-ForWindowByTitle "Dictation E2E Target $RunId" 30
  $report.target = [ordered]@{ pid = $targetWindow.Id; hwnd = $targetWindow.MainWindowHandle.ToInt64(); title = $targetWindow.MainWindowTitle }
  Add-Check 'target fixture launched' ($targetWindow.MainWindowHandle -ne 0) $report.target

  [void][DictationE2EWin32]::SetForegroundWindow([IntPtr]$targetWindow.MainWindowHandle)
  Start-Sleep -Milliseconds 500
  $report.foregroundBeforeStart = Get-ForegroundTitle
  if ($report.foregroundBeforeStart.hwnd -ne $targetWindow.MainWindowHandle.ToInt64()) {
    $report.warnings += 'Plain SetForegroundWindow did not move focus to the target fixture; trying AttachThreadInput foreground recovery.'
    Focus-WindowWithAttach ([IntPtr]$targetWindow.MainWindowHandle)
    Start-Sleep -Milliseconds 500
    $report.foregroundBeforeStart = Get-ForegroundTitle
  }
  if ($report.foregroundBeforeStart.hwnd -ne $targetWindow.MainWindowHandle.ToInt64()) {
    $report.warnings += 'AttachThreadInput did not move focus; trying cua-driver bring_to_front as last resort.'
    try {
      $report.cuaBringTargetToFront = Invoke-CuaTool 'bring_to_front' @{ pid = [int]$targetWindow.Id; window_id = [int]$targetWindow.MainWindowHandle }
      Start-Sleep -Milliseconds 500
      $report.foregroundBeforeStart = Get-ForegroundTitle
    } catch {
      $report.warnings += "cua-driver bring_to_front failed: $($_.Exception.Message)"
    }
  }
  Add-Check 'target foreground before dictation start' ($report.foregroundBeforeStart.hwnd -eq $targetWindow.MainWindowHandle.ToInt64()) $report.foregroundBeforeStart

  $desktopTreeBefore = Invoke-CuaTool 'get_accessibility_tree'
  Add-Check 'cua sees target and dictation windows' ((($desktopTreeBefore | ConvertTo-Json -Depth 10) -like "*Dictation E2E Target $RunId*") -and (($desktopTreeBefore | ConvertTo-Json -Depth 10) -like '*Dictation Dock*')) $null

  Send-DictationKey
  $report.firstHotkeyAt = (Get-Date).ToString('o')
  Start-Sleep -Seconds 1

  if (-not $SkipSpeechSynthesis) {
    Speak-TestPhrase $SpokenPhrase
    $report.spokenAt = (Get-Date).ToString('o')
  } else {
    Start-Sleep -Seconds $RecordingSeconds
  }

  if ($RecordingSeconds -gt 0) { Start-Sleep -Seconds $RecordingSeconds }
  Send-DictationKey
  $report.secondHotkeyAt = (Get-Date).ToString('o')

  $deliveryDeadline = (Get-Date).AddSeconds($DeliveryTimeoutSeconds)
  $deliveredText = ''
  while ((Get-Date) -lt $deliveryDeadline) {
    if (Test-Path $targetLiveTextPath) {
      $deliveredText = Get-Content -Raw -Path $targetLiveTextPath -ErrorAction SilentlyContinue
      if ($deliveredText.Trim().Length -gt 0) { break }
    }
    if ($tauriProc.HasExited) { throw "tauri dev exited during delivery wait with code $($tauriProc.ExitCode). See logs." }
    Start-Sleep -Seconds 2
  }

  Add-Check 'target received pasted text' ($deliveredText.Trim().Length -gt 0) @{ length = $deliveredText.Trim().Length }
  $tokenCheck = Test-ExpectedTokens $deliveredText $SpokenPhrase
  Add-Check 'target text matches synthetic spoken fixture tokens' ([bool]$tokenCheck.pass) $tokenCheck

  $newAudio = @(Get-ChildItem -Path $audioRoot -Filter '*.wav' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $startedAt } |
    Sort-Object LastWriteTime -Descending)
  Add-Check 'fresh wav artifact created' ($newAudio.Count -gt 0) @($newAudio | Select-Object -First 3 | ForEach-Object { [ordered]@{
    name = $_.Name
    relativePath = ('artifacts/microphone-capture/audio/' + $_.Name)
    sizeBytes = $_.Length
    lastWriteTime = $_.LastWriteTime.ToString('o')
  }})
  $report.audioArtifacts = @($newAudio | Select-Object -First 3 | ForEach-Object { [ordered]@{
    name = $_.Name
    relativePath = ('artifacts/microphone-capture/audio/' + $_.Name)
    sizeBytes = $_.Length
    lastWriteTime = $_.LastWriteTime.ToString('o')
  }})

  $clipboardAfter = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  $clipboardRestoredToSentinel = ($clipboardAfter -eq $sentinel)
  Add-Check 'clipboard sentinel restored after paste_sent' $clipboardRestoredToSentinel @{ restoredToSentinel = $clipboardRestoredToSentinel; currentLength = if ($null -eq $clipboardAfter) { 0 } else { $clipboardAfter.Length } }

  $report.targetResult = [ordered]@{
    textLength = $deliveredText.Trim().Length
    normalizedSha256 = Get-Sha256Hex (Normalize-Text $deliveredText)
    tokenCheck = $tokenCheck
    rawTextArtifact = $targetTextPath
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
  try { $report.foregroundAfter = Get-ForegroundTitle } catch {}
  try {
    if (Test-Path $targetLiveTextPath) { Copy-Item -Force $targetLiveTextPath $targetTextPath }
    if (Test-Path $targetLiveStatePath) { Copy-Item -Force $targetLiveStatePath $targetStatePath }
  } catch { $report.errors += "copy live target artifacts: $($_.Exception.Message)" }
  try {
    if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree ([int]$tauriProc.Id) }
  } catch { $report.errors += "stop tauri: $($_.Exception.Message)" }
  try {
    if ($targetProc -and -not $targetProc.HasExited) { Stop-Tree ([int]$targetProc.Id) }
  } catch { $report.errors += "stop target: $($_.Exception.Message)" }
  try {
    if ($null -ne $originalClipboard) { Set-Clipboard -Value $originalClipboard } else { Set-Clipboard -Value '' }
    $report.clipboard.restoredOriginalAfterScript = $true
  } catch { $report.errors += "restore clipboard: $($_.Exception.Message)" }
  $report | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Host "DICTATION_E2E_REPORT=$reportPath"
  Write-Host "DICTATION_E2E_STATUS=$($report.status)"
}
