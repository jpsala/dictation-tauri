param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$StartupTimeoutSeconds = 80,
  [int]$RemoteDebugPort = 9343,
  [switch]$KeepAlive,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Hotkey re-registration smoke launches Tauri, swaps native hotkeys, and sends Ctrl+Shift+F9 / Alt+Space. Re-run with -AllowDesktopSideEffects after explicit local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/hotkey-reregistration-smoke/$RunId"
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

public static class HotkeyReregSmokeWin32 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  public static List<string> VisibleWindowTitles() {
    var titles = new List<string>();
    EnumWindows((hWnd, lParam) => {
      if (IsWindowVisible(hWnd)) {
        var title = new StringBuilder(512);
        GetWindowText(hWnd, title, title.Capacity);
        if (title.Length > 0) { titles.Add(title.ToString()); }
      }
      return true;
    }, IntPtr.Zero);
    return titles;
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
  $json = curl.exe -s "http://127.0.0.1:$Port/json/list"
  if ($LASTEXITCODE -ne 0 -or -not $json) {
    throw "CDP page list unavailable on port $Port"
  }
  return $json | ConvertFrom-Json
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

function Invoke-CdpJson([object]$Page, [string]$Expression) {
  $raw = Invoke-CdpExpression $Page $Expression
  return $raw | ConvertFrom-Json
}

function Invoke-Tauri([object]$Page, [string]$Command, [hashtable]$Payload = @{}) {
  $argsJson = $Payload | ConvertTo-Json -Depth 8 -Compress
  $expression = @"
(async () => {
  const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error('tauri_invoke_unavailable');
  return await invoke('$Command', $argsJson);
})()
"@
  return Invoke-CdpJson $Page $expression
}

function Send-CtrlShiftF9() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_CONTROL = 0x11
  $VK_SHIFT = 0x10
  $VK_F9 = 0x78
  [HotkeyReregSmokeWin32]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
  [HotkeyReregSmokeWin32]::keybd_event($VK_SHIFT, 0, 0, [UIntPtr]::Zero)
  [HotkeyReregSmokeWin32]::keybd_event($VK_F9, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
  [HotkeyReregSmokeWin32]::keybd_event($VK_F9, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [HotkeyReregSmokeWin32]::keybd_event($VK_SHIFT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [HotkeyReregSmokeWin32]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Send-AltSpace() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_MENU = 0x12
  $VK_SPACE = 0x20
  [HotkeyReregSmokeWin32]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [HotkeyReregSmokeWin32]::keybd_event($VK_SPACE, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
  [HotkeyReregSmokeWin32]::keybd_event($VK_SPACE, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [HotkeyReregSmokeWin32]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Get-BodyText([object]$Page) {
  return Invoke-CdpExpression $Page "document.body.textContent"
}

function Wait-ForBodyText([object]$Page, [string]$Needle, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $text = ''
  while ((Get-Date) -lt $deadline) {
    $text = Get-BodyText $Page
    if ($text -like "*$Needle*") { return $text }
    Start-Sleep -Milliseconds 500
  }
  throw "Body text did not contain '$Needle' before timeout. Last length=$($text.Length)."
}

function Emit-HostCommand([object]$Page, [string]$Command) {
  $expression = "window.dispatchEvent(new CustomEvent('dictation-tauri:host-command', { detail: { source: 'hotkey_reregistration_smoke', command: '$Command' } })); 'ok'"
  $result = Invoke-CdpExpression $Page $expression
  if ($result -ne 'ok') { throw "Host command emit did not return ok: $Command" }
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null) {
  $entry = [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  $script:report.checks += $entry
  if (-not $Pass) { throw "Hotkey re-registration smoke check failed: $Name" }
}

$report = [ordered]@{
  check = 'hotkey-reregistration-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  root = $runRoot
  approved = [ordered]@{ desktopSideEffects = [bool]$AllowDesktopSideEffects; altSpace = $true }
  checks = @()
  warnings = @()
  errors = @()
  artifacts = [ordered]@{ report = $reportPath; tauriStdout = $tauriOutLog; tauriStderr = $tauriErrLog }
  notes = 'Redacted smoke: invokes Tauri hotkey registration commands, physically verifies Ctrl+Shift+F9 after swap, and restores Alt+Space native hook config; no transcript/audio/selection text is recorded.'
}

try {
  $existingApps = @(Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue)
  if ($existingApps.Count -gt 0) {
    if ($StopExisting) {
      $repoProcessNeedle = $repo.ToLowerInvariant()
      $existingDevProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $commandLine = if ($_.CommandLine) { $_.CommandLine.ToLowerInvariant() } else { '' }
        $commandLine.Contains($repoProcessNeedle) -and
          ($commandLine -match 'tauri:dev|tauri dev|vite .*--port 1420|dictation-tauri\.exe')
      })
      $existingDevPids = @($existingDevProcesses | ForEach-Object { [int]$_.ProcessId })
      $rootDevProcesses = @($existingDevProcesses | Where-Object { $existingDevPids -notcontains [int]$_.ParentProcessId })
      foreach ($process in $rootDevProcesses) {
        Stop-Tree ([int]$process.ProcessId)
      }
      $existingApps | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
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
  $report.cdp = [ordered]@{ port = $RemoteDebugPort; mainUrl = $mainPage.url }
  Add-Check 'main WebView2 CDP page is available' ([bool]$mainPage.webSocketDebuggerUrl) $report.cdp

  [void](Wait-ForBodyText $mainPage 'Desktop dictation' 70)

  $initialConfig = Invoke-Tauri $mainPage 'get_desktop_control_hotkey_config'
  $report.initialConfig = $initialConfig
  Add-Check 'initial hotkey config is readable' ([bool]$initialConfig.shortcut -and [bool]$initialConfig.backend) $initialConfig

  $previewFallback = Invoke-Tauri $mainPage 'preview_desktop_control_hotkey_registration' @{ requestedShortcut = 'Ctrl+Shift+F9' }
  Add-Check 'preview accepts Ctrl+Shift+F9 fallback' ($previewFallback.canApply -eq $true -and $previewFallback.targetConfig.shortcut -eq 'Ctrl+Shift+F9') $previewFallback

  $applyFallback = Invoke-Tauri $mainPage 'apply_desktop_control_hotkey_registration' @{ requestedShortcut = 'Ctrl+Shift+F9' }
  Add-Check 'apply swaps to Ctrl+Shift+F9 without rollback' ($applyFallback.effectiveConfig.shortcut -eq 'Ctrl+Shift+F9' -and $applyFallback.rolledBack -eq $false -and -not $applyFallback.error) $applyFallback

  Send-CtrlShiftF9
  [void](Wait-ForBodyText $mainPage 'Listening' 20)
  Add-Check 'Ctrl+Shift+F9 starts dictation after swap' $true @{ observed = 'Listening' }
  Emit-HostCommand $mainPage 'cancel'
  [void](Wait-ForBodyText $mainPage 'Ready' 40)

  $unsupported = Invoke-Tauri $mainPage 'apply_desktop_control_hotkey_registration' @{ requestedShortcut = 'Ctrl+Alt+Delete' }
  Add-Check 'unsupported shortcut returns safe error without changing registration' ($unsupported.changed -eq $false -and $unsupported.error -eq 'shortcut_not_applicable' -and $unsupported.effectiveConfig.shortcut -eq 'Ctrl+Shift+F9') $unsupported

  $previewAltSpace = Invoke-Tauri $mainPage 'preview_desktop_control_hotkey_registration' @{ requestedShortcut = 'Alt+Space' }
  Add-Check 'preview accepts Alt+Space native hook on Windows' ($previewAltSpace.canApply -eq $true -and $previewAltSpace.targetConfig.shortcut -eq 'Alt+Space') $previewAltSpace

  $applyAltSpace = Invoke-Tauri $mainPage 'apply_desktop_control_hotkey_registration' @{ requestedShortcut = 'Alt+Space' }
  Add-Check 'apply swaps back to Alt+Space native hook without rollback' ($applyAltSpace.effectiveConfig.shortcut -eq 'Alt+Space' -and $applyAltSpace.effectiveConfig.backend -eq 'windows_low_level_hook' -and $applyAltSpace.rolledBack -eq $false -and -not $applyAltSpace.error) $applyAltSpace

  $finalConfig = Invoke-Tauri $mainPage 'get_desktop_control_hotkey_config'
  $report.finalConfig = $finalConfig
  Add-Check 'final hotkey config is restored to Alt+Space native hook' ($finalConfig.shortcut -eq 'Alt+Space' -and $finalConfig.backend -eq 'windows_low_level_hook' -and $finalConfig.altSpaceEnabled -eq $true) $finalConfig

  $report.status = 'passed'
}
catch {
  $report.status = 'failed'
  $report.errors += $_.Exception.Message
  throw
}
finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 14 | Set-Content -Encoding UTF8 -Path $reportPath
  if (-not $KeepAlive) {
    if ($report.Contains('tauri') -and $report.tauri.pid) { Stop-Tree ([int]$report.tauri.pid) }
    if ($tauriProc -and -not $tauriProc.HasExited) { Stop-Tree $tauriProc.Id }
  } elseif ($tauriProc) {
    Write-Output "Hotkey re-registration smoke left tauri:dev running (pid $($tauriProc.Id))."
  }
  Write-Output "Hotkey re-registration smoke report: $reportPath"
}
