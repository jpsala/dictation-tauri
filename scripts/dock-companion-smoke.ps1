param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$StartupTimeoutSeconds = 80,
  [int]$RemoteDebugPort = 9342,
  [switch]$KeepAlive,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Dock companion smoke launches Tauri with WebView2 CDP and emits product host commands. Re-run with -AllowDesktopSideEffects after local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/dock-companion-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$reportPath = Join-Path $runRoot 'report.json'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
$startedAt = Get-Date
$tauriProc = $null

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DockCompanionSmokeWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  public static List<object> ListWindowsForPid(int pid) {
    var windows = new List<object>();
    EnumWindows((hWnd, lParam) => {
      uint windowPid;
      GetWindowThreadProcessId(hWnd, out windowPid);
      if (windowPid == pid) {
        var title = new StringBuilder(512);
        GetWindowText(hWnd, title, title.Capacity);
        windows.Add(new { hwnd = hWnd.ToInt64(), title = title.ToString(), visible = IsWindowVisible(hWnd) });
      }
      return true;
    }, IntPtr.Zero);
    return windows;
  }
}
"@

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Wait-ForTauriWindow([datetime]$NotBefore, [int]$TimeoutSeconds = 80) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($tauriProc -and $tauriProc.HasExited) {
      throw "tauri dev exited early with code $($tauriProc.ExitCode). See $tauriOutLog and $tauriErrLog"
    }
    $appProcess = Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 -and $_.StartTime -ge $NotBefore.AddSeconds(-2) } |
      Sort-Object StartTime -Descending |
      Select-Object -First 1
    if ($appProcess) { return $appProcess }
    Start-Sleep -Milliseconds 500
  }
  throw 'dictation-tauri window was not available before timeout.'
}

function Get-CdpPages([int]$Port) {
  Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
}

function Wait-ForCdpPage([int]$Port, [scriptblock]$Predicate, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $rawPages = Get-CdpPages $Port
      $pageList = if ($rawPages -is [System.Array]) { $rawPages } else { @($rawPages) }
      foreach ($candidate in $pageList) {
        if (& $Predicate $candidate) { return $candidate }
      }
    } catch {
      # wait for WebView2 remote debugging endpoint
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Tauri WebView CDP page was not available on port $Port before timeout."
}

function Invoke-CdpExpression([object]$Page, [string]$Expression) {
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Expression))
  $result = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $Page.webSocketDebuggerUrl "base64:$encoded"
  if ($LASTEXITCODE -ne 0) { throw "CDP expression failed: $Expression" }
  return [string]$result
}

function Emit-HostCommand([object]$Page, [string]$Command, [string]$PresetId = '') {
  $presetFragment = if ($PresetId) { ", presetId: '$PresetId'" } else { '' }
  $expression = "window.dispatchEvent(new CustomEvent('dictation-tauri:host-command', { detail: { source: 'dock_companion_smoke', command: '$Command'$presetFragment } })); 'ok'"
  $result = Invoke-CdpExpression $Page $expression
  if ($result -ne 'ok') { throw "Host command emit did not return ok: $Command" }
}

function Get-RedactedTextDigest([string]$Text) {
  $safeText = if ($null -eq $Text) { '' } else { $Text }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($safeText)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
  } finally {
    $sha.Dispose()
  }
  [ordered]@{
    length = $safeText.Length
    sha256 = ([BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant())
  }
}

function Wait-ForCompanionText([object]$Page, [string[]]$Needles, [int]$TimeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $text = ''
  while ((Get-Date) -lt $deadline) {
    $text = Invoke-CdpExpression $Page "document.body.innerText"
    $missing = @($Needles | Where-Object { $text -notlike "*$_*" })
    if ($missing.Count -eq 0) { return $text }
    Start-Sleep -Milliseconds 500
  }
  $digest = Get-RedactedTextDigest $text
  throw "Companion text did not contain required strings: $($Needles -join ', '). Last text redacted: length=$($digest.length), sha256=$($digest.sha256)"
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null) {
  $entry = [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  $script:report.checks += $entry
  if (-not $Pass) { throw "Dock companion smoke check failed: $Name" }
}

function Release-Modifiers() {
  $KEYEVENTF_KEYUP = 0x0002
  foreach ($vk in @(0x11, 0x10, 0x12, 0x5B, 0x5C)) {
    [DockCompanionSmokeWin32]::keybd_event([byte]$vk, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  }
}

function Send-AltQ() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_Q = 0x51
  Release-Modifiers
  Start-Sleep -Milliseconds 80
  [DockCompanionSmokeWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [DockCompanionSmokeWin32]::keybd_event($VK_Q, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [DockCompanionSmokeWin32]::keybd_event($VK_Q, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [DockCompanionSmokeWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Release-Modifiers
}

$report = [ordered]@{
  check = 'altq-picker-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  root = $runRoot
  approved = [ordered]@{ desktopSideEffects = [bool]$AllowDesktopSideEffects }
  checks = @()
  warnings = @()
  errors = @()
  artifacts = [ordered]@{
    report = $reportPath
    tauriStdout = $tauriOutLog
    tauriStderr = $tauriErrLog
  }
  notes = 'Redacted smoke: no transcript/audio/selection text is recorded; host command only opens the preset picker and preset metadata.'
}

try {
  # Avoid stale windows without CDP being mistaken for this run while preserving JP's
  # live dev instance by default. Use -StopExisting only for isolated smoke runs.
  $existingApps = @(Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue)
  if ($existingApps.Count -gt 0) {
    if ($StopExisting) {
      $existingApps | Stop-Process -Force -ErrorAction SilentlyContinue
    } else {
      $report.warnings += "Existing dictation-tauri processes left untouched: $($existingApps.Id -join ', ')."
    }
  }

  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $launchCutoff = Get-Date
  $tauriProc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run','tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $tauriOutLog `
    -RedirectStandardError $tauriErrLog `
    -PassThru

  $tauriWindow = Wait-ForTauriWindow $launchCutoff $StartupTimeoutSeconds
  $report.tauri = [ordered]@{ pid = $tauriWindow.Id; hwnd = $tauriWindow.MainWindowHandle.ToInt64(); title = $tauriWindow.MainWindowTitle }
  Add-Check 'tauri dictation dock launched' ($tauriWindow.MainWindowHandle -ne 0) $report.tauri

  $mainPage = Wait-ForCdpPage $RemoteDebugPort { param($page) $page.url -eq 'http://127.0.0.1:1420/' } $StartupTimeoutSeconds
  $pickerPage = Wait-ForCdpPage $RemoteDebugPort { param($page) $page.url -like '*surface=preset-picker*' } $StartupTimeoutSeconds
  $report.cdp = [ordered]@{
    port = $RemoteDebugPort
    mainUrl = $mainPage.url
    pickerUrl = $pickerPage.url
  }
  Add-Check 'main and preset picker WebView2 CDP pages are available' ($mainPage.webSocketDebuggerUrl -and $pickerPage.webSocketDebuggerUrl) $report.cdp

  [void](Wait-ForCompanionText $mainPage @('Dictation Dock', 'Ready') 25)

  Emit-HostCommand $mainPage 'show_preset_picker'
  $pickerText = Wait-ForCompanionText $pickerPage @('Preset picker', 'Como yo', 'Corregir texto', 'Fix Writing', 'Like me', 'Quick Chat')
  $report.pickerTextLength = $pickerText.Length
  Add-Check 'host command opens the preset picker with starter presets' ($pickerText -like '*Preset picker*' -and $pickerText -like '*Como yo*' -and $pickerText -like '*Corregir texto*' -and $pickerText -like '*Fix Writing*' -and $pickerText -notlike '*Translate*') @{ textLength = $pickerText.Length }

  Add-Check 'picker exposes which-key multi-chord labels' ($pickerText -like '*Alt+Q then Y*' -and $pickerText -like '*Alt+Q then C*') @{ textLength = $pickerText.Length }

  $debug = Invoke-CdpExpression $pickerPage "JSON.stringify(window.__dictationPresetPickerDebug || null)" | ConvertFrom-Json
  $report.pickerDebug = $debug
  Add-Check 'preset picker debug reports open state' ($debug.open -eq $true -and $debug.filteredCount -ge 4) $debug

  $windows = [DockCompanionSmokeWin32]::ListWindowsForPid([int]$tauriWindow.Id)
  $pickerWindow = @($windows | Where-Object { $_.title -eq 'Preset Picker' } | Select-Object -First 1)
  $report.windows = @($windows | ForEach-Object { [ordered]@{ hwnd = $_.hwnd; title = $_.title; visible = $_.visible } })
  Add-Check 'native preset picker window is visible' ($pickerWindow.Count -gt 0 -and [bool]$pickerWindow[0].visible) $pickerWindow

  $combinedText = "$pickerText"
  Add-Check 'picker smoke report does not include raw transcript copy' ($combinedText -notmatch 'transcript stays|sensitive transcript|raw transcript') @{ rawTextRecorded = $false }

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
  if (-not $KeepAlive) {
    if ($report.Contains('tauri') -and $report.tauri.pid) {
      Stop-Tree ([int]$report.tauri.pid)
    }
    if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree $tauriProc.Id }
  } elseif ($tauriProc) {
    Write-Output "Dock companion smoke left tauri:dev running (pid $($tauriProc.Id))."
  }
  Write-Output "Dock companion smoke report: $reportPath"
}
