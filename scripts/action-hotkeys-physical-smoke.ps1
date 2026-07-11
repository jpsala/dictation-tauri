param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$RemoteDebugPort = 9354,
  [int]$StartupTimeoutSeconds = 90,
  [switch]$KeepAlive,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Action hotkeys physical smoke launches Tauri and sends Alt+Q / Alt+Shift+X. Re-run with -AllowDesktopSideEffects after explicit local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/action-hotkeys-physical-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$reportPath = Join-Path $runRoot 'report.json'
$startedAt = Get-Date

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ActionHotkeysPhysicalSmokeWin32 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) { Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue }
}

function Release-Modifiers() {
  $KEYEVENTF_KEYUP = 0x0002
  foreach ($vk in @(0x11, 0x10, 0x12, 0x5B, 0x5C)) {
    [ActionHotkeysPhysicalSmokeWin32]::keybd_event([byte]$vk, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  }
}

function Send-Combo([byte[]]$Modifiers, [byte]$Key) {
  $KEYEVENTF_KEYUP = 0x0002
  Release-Modifiers
  Start-Sleep -Milliseconds 80
  foreach ($modifier in $Modifiers) {
    [ActionHotkeysPhysicalSmokeWin32]::keybd_event($modifier, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 35
  }
  [ActionHotkeysPhysicalSmokeWin32]::keybd_event($Key, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [ActionHotkeysPhysicalSmokeWin32]::keybd_event($Key, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [Array]::Reverse($Modifiers)
  foreach ($modifier in $Modifiers) {
    Start-Sleep -Milliseconds 35
    [ActionHotkeysPhysicalSmokeWin32]::keybd_event($modifier, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  }
  Release-Modifiers
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

function Get-TextProbe([object]$Page) {
  $expr = "(() => { const text = document.body.innerText || ''; return JSON.stringify({ length: text.length, sawPresetPicker: text.includes('PRESET PICKER'), sawStarterPreset: text.includes('Como yo') || text.includes('Corregir texto') || text.includes('Fix Writing'), sawPasteSent: text.includes('Delivery status: paste_sent'), sawNoLatest: text.includes('No latest transcript is available for paste-last') }); })()"
  return Invoke-CdpExpression $Page $expr | ConvertFrom-Json
}

function Wait-ForProbe([object]$Page, [scriptblock]$Predicate, [string]$Label, [int]$TimeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $probe = $null
  while ((Get-Date) -lt $deadline) {
    $probe = Get-TextProbe $Page
    if (& $Predicate $probe) { return $probe }
    Start-Sleep -Milliseconds 500
  }
  throw "Body probe did not satisfy $Label. Last probe=$($probe | ConvertTo-Json -Compress)"
}

$report = [ordered]@{
  check = 'action-hotkeys-physical-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  status = 'running'
  approved = [ordered]@{ desktopSideEffects = [bool]$AllowDesktopSideEffects }
  artifacts = [ordered]@{ report = $reportPath }
  notes = 'Redacted physical key smoke. No transcript/audio/selection text is stored in this report; paste-last stores only booleans/lengths.'
}

try {
  $existingBefore = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  if ($existingBefore.Count -gt 0 -and -not $StopExisting) {
    $report.warning = "Existing dictation-tauri processes left untouched: $($existingBefore -join ', ')."
  }

  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $launcherArgs = @('run', 'tauri:dev:hidden', '--', '-RunId', $RunId)
  if ($StopExisting) { $launcherArgs += '-StopExisting' }
  $launchRaw = & npm @launcherArgs
  $report.launcherOutputLines = @($launchRaw).Count

  $main = Wait-ForPage { param($p) $p.url -eq 'http://127.0.0.1:1420/' }
  $config = Invoke-Tauri $main 'get_desktop_control_action_hotkey_config'
  if ($config.presetPicker -ne 'Alt+Q' -or $config.pasteLastSafe -ne 'Alt+Shift+X') {
    throw "Expected default action hotkeys before physical smoke, got $($config | ConvertTo-Json -Compress)"
  }

  Send-Combo @([byte]0x12) ([byte]0x51) # Alt+Q
  $picker = Wait-ForPage { param($p) $p.url -like '*surface=preset-picker*' } 25
  $pickerProbe = Wait-ForProbe $picker { param($probe) $probe.sawPresetPicker -and $probe.sawStarterPreset } 'preset picker with starter labels' 25
  Invoke-Tauri $main 'hide_preset_picker' | Out-Null
  Start-Sleep -Milliseconds 800

  Send-Combo @([byte]0x12, [byte]0x10) ([byte]0x58) # Alt+Shift+X
  $mainProbe = Wait-ForProbe $main { param($probe) $probe.sawPasteSent -or $probe.sawNoLatest } 'paste-last hook result' 20

  $report.status = 'passed'
  $report.actionHotkeys = $config
  $report.altQ = [ordered]@{
    pickerUrl = $picker.url
    textLength = $pickerProbe.length
    sawPresetPicker = [bool]$pickerProbe.sawPresetPicker
    sawStarterPreset = [bool]$pickerProbe.sawStarterPreset
  }
  $report.altShiftX = [ordered]@{
    textLength = $mainProbe.length
    sawPasteSent = [bool]$mainProbe.sawPasteSent
    sawNoLatestTranscriptMessage = [bool]$mainProbe.sawNoLatest
  }
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
  Write-Output "Action hotkeys physical smoke report: $reportPath"
}
