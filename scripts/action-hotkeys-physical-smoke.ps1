param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$RemoteDebugPort = 9354,
  [int]$StartupTimeoutSeconds = 90,
  [switch]$KeepAlive,
  [switch]$SkipPasteLast
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Action hotkeys physical smoke launches Tauri and sends Alt+Q / Alt+Shift+X. Re-run with -AllowDesktopSideEffects after explicit local approval.'
}
if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
  throw 'RunId may contain only letters, digits, dot, underscore, and hyphen so temporary cleanup remains path-bound.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/desktop-control/action-hotkeys-physical-smoke/$RunId"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$reportPath = Join-Path $runRoot 'report.json'
$startedAt = Get-Date
$webViewUserDataRoot = Join-Path $env:TEMP "dictation-tauri-action-hotkeys-smoke\$RunId\webview2"
$webViewTempRoot = Split-Path -Parent $webViewUserDataRoot
$webViewProfileCreated = $false
$launcherWrapperPid = $null
$launcherProcessTreeIds = @()

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
  $expr = @'
(() => { const text = document.body.innerText || ''; const picker = document.querySelector('[data-testid="preset-picker"]'); const teach = document.querySelector('.dock-teach-correction-launcher'); return JSON.stringify({ length: text.length, sawPresetPicker: Boolean(picker), sawTeachCorrection: Boolean(teach), sawStarterPreset: text.includes('Como yo') || text.includes('Corregir texto') || text.includes('Fix Writing'), sawPasteSent: text.includes('Delivery status: paste_sent'), sawNoLatest: text.includes('No latest transcript is available for paste-last') }); })()
'@
  return Invoke-CdpExpression $Page $expr | ConvertFrom-Json
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

function Wait-ForPhysicalPickerTransition([object]$MainPage, [object]$BeforeState, [int]$TimeoutSeconds = 25) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = $null
  while ((Get-Date) -lt $deadline) {
    $last = Invoke-Tauri $MainPage 'get_preset_picker_window_state'
    if (-not [bool]$BeforeState.visible -and [bool]$last.visible -and [bool]$last.foreground) {
      return $last
    }
    Start-Sleep -Milliseconds 200
  }
  throw "Alt+Q did not produce a hidden-to-visible foreground preset-picker transition. Last state=$($last | ConvertTo-Json -Compress)"
}

$report = [ordered]@{
  check = 'action-hotkeys-physical-smoke'
  runId = $RunId
  startedAt = $startedAt.ToString('o')
  status = 'running'
  approved = [ordered]@{ desktopSideEffects = [bool]$AllowDesktopSideEffects }
  artifacts = [ordered]@{ report = $reportPath }
  errors = @()
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
  notes = 'Redacted physical key smoke. No transcript/audio/selection text is stored in this report; paste-last stores only booleans/lengths.'
}
$previousWebViewArgsPresent = Test-Path Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$previousWebViewArgs = if ($previousWebViewArgsPresent) { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS } else { $null }
$previousWebViewUserDataPresent = Test-Path Env:WEBVIEW2_USER_DATA_FOLDER
$previousWebViewUserData = if ($previousWebViewUserDataPresent) { $env:WEBVIEW2_USER_DATA_FOLDER } else { $null }

try {
  [void](Assert-CdpPortAvailable $RemoteDebugPort)
  $report.cdp.preflightPortAvailable = $true
  if (Test-Path -LiteralPath $webViewTempRoot) {
    throw "WebView2 smoke profile root already exists; refusing to reuse or remove it: $webViewTempRoot"
  }
  $existingBefore = @(Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  if ($existingBefore.Count -gt 0) {
    $report.warning = "Existing dictation-tauri processes left untouched: $($existingBefore -join ', ')."
  }

  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  New-Item -ItemType Directory -Force -Path $webViewUserDataRoot | Out-Null
  $webViewProfileCreated = $true
  $report.webView2.profileCreated = $true
  $env:WEBVIEW2_USER_DATA_FOLDER = $webViewUserDataRoot
  $launchRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'scripts/start-tauri-dev-hidden.ps1') -RunId $RunId
  if ($LASTEXITCODE -ne 0) { throw "Hidden Tauri launcher failed: $LASTEXITCODE" }
  $launch = ($launchRaw -join "`n") | ConvertFrom-Json
  $launcherWrapperPid = [int]$launch.wrapperPid
  $launcherProcessTreeIds = @(Get-ProcessTreeIds $launcherWrapperPid)
  if ($launcherProcessTreeIds.Count -eq 0) {
    throw "Hidden Tauri launcher wrapper process $launcherWrapperPid was not observable."
  }
  $report.launcherOutputLines = @($launchRaw).Count
  $report.launcherWrapperPid = $launcherWrapperPid
  $report.launcherOwnedProcessIds = @($launcherProcessTreeIds)

  $main = Wait-ForPage { param($p) $p.url -eq 'http://127.0.0.1:1420/' }
  $report.cdp.mainUrl = $main.url
  $report.cdp.mainTitle = $main.title
  $config = Invoke-Tauri $main 'get_desktop_control_action_hotkey_config'
  if ($config.presetPicker -ne 'Alt+Q' -or $config.pasteLastSafe -ne 'Alt+Shift+X') {
    throw "Expected default action hotkeys before physical smoke, got $($config | ConvertTo-Json -Compress)"
  }

  $picker = Wait-ForPage { param($p) $p.url -like '*surface=preset-picker*' } 25
  $report.cdp.pickerUrl = $picker.url
  Invoke-Tauri $main 'hide_preset_picker' | Out-Null
  Start-Sleep -Milliseconds 300
  $pickerBefore = Invoke-Tauri $main 'get_preset_picker_window_state'
  if ([bool]$pickerBefore.visible) {
    throw 'Preset picker must be hidden before the physical Alt+Q transition.'
  }
  Send-Combo @([byte]0x12) ([byte]0x51) # Alt+Q
  $pickerAfter = Wait-ForPhysicalPickerTransition $main $pickerBefore 25
  $pickerProbe = Wait-ForProbe $picker { param($probe) $probe.sawPresetPicker -and $probe.sawTeachCorrection } 'visible V5 preset picker with Teach correction after Alt+Q' 10
  $pickerOpenRoute = 'physical_alt_q_visible_foreground_transition'
  Invoke-Tauri $main 'hide_preset_picker' | Out-Null
  Start-Sleep -Milliseconds 800

  $mainProbe = $null
  if (-not $SkipPasteLast) {
    Send-Combo @([byte]0x12, [byte]0x10) ([byte]0x58) # Alt+Shift+X
    $mainProbe = Wait-ForProbe $main { param($probe) $probe.sawPasteSent -or $probe.sawNoLatest } 'paste-last hook result' 20
  }

  $report.status = 'passed'
  $report.actionHotkeys = $config
  $report.altQ = [ordered]@{
    pickerUrl = $picker.url
    textLength = $pickerProbe.length
    openRoute = $pickerOpenRoute
    physicalAltQObserved = (-not [bool]$pickerBefore.visible -and [bool]$pickerAfter.visible -and [bool]$pickerAfter.foreground)
    before = [ordered]@{ visible = [bool]$pickerBefore.visible; focused = [bool]$pickerBefore.focused; foreground = [bool]$pickerBefore.foreground }
    after = [ordered]@{ visible = [bool]$pickerAfter.visible; focused = [bool]$pickerAfter.focused; foreground = [bool]$pickerAfter.foreground }
    sawPresetPicker = [bool]$pickerProbe.sawPresetPicker
    sawTeachCorrection = [bool]$pickerProbe.sawTeachCorrection
    sawStarterPreset = [bool]$pickerProbe.sawStarterPreset
  }
  $report.altShiftX = if ($SkipPasteLast) {
    [ordered]@{ skipped = $true }
  } else {
    [ordered]@{
      skipped = $false
      textLength = $mainProbe.length
      sawPasteSent = [bool]$mainProbe.sawPasteSent
      sawNoLatestTranscriptMessage = [bool]$mainProbe.sawNoLatest
    }
  }
} catch {
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  throw
} finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  $cleanupErrors = [System.Collections.Generic.List[string]]::new()
  $ownedProcessIdsBeforeCleanup = @(
    @($launcherProcessTreeIds)
    if ($launcherWrapperPid) { [int]$launcherWrapperPid }
    if ($launcherWrapperPid) { @(Get-ProcessTreeIds ([int]$launcherWrapperPid)) }
  ) | Where-Object { $_ -and [int]$_ -gt 0 } | Select-Object -Unique
  $remainingOwnedProcessIds = @()
  $launcherProcessTreeTerminated = $null
  if (-not $KeepAlive) {
    if (@($ownedProcessIdsBeforeCleanup).Count -eq 0) {
      $launcherProcessTreeTerminated = $true
    }
  }
  if (-not $KeepAlive -and $null -eq $launcherProcessTreeTerminated) {
    try {
      if ($launcherWrapperPid -and (Get-Process -Id ([int]$launcherWrapperPid) -ErrorAction SilentlyContinue)) {
        Stop-Tree ([int]$launcherWrapperPid)
      }
      foreach ($ownedProcessId in @($ownedProcessIdsBeforeCleanup)) {
        if (Get-Process -Id ([int]$ownedProcessId) -ErrorAction SilentlyContinue) {
          Stop-Tree ([int]$ownedProcessId)
        }
      }
      $treeDeadline = (Get-Date).AddSeconds(10)
      $remainingOwnedProcessIds = @(Get-ExistingProcessIds $ownedProcessIdsBeforeCleanup)
      while ($remainingOwnedProcessIds.Count -gt 0 -and (Get-Date) -lt $treeDeadline) {
        Start-Sleep -Milliseconds 250
        $remainingOwnedProcessIds = @(Get-ExistingProcessIds $ownedProcessIdsBeforeCleanup)
      }
      $launcherProcessTreeTerminated = $remainingOwnedProcessIds.Count -eq 0
    } catch {
      $cleanupErrors.Add("process_tree: $($_.Exception.Message)") | Out-Null
    }
    if (-not $launcherProcessTreeTerminated) {
      $cleanupErrors.Add("process_tree: owned launcher process tree did not terminate ($($remainingOwnedProcessIds -join ', '))") | Out-Null
    }
  }
  $environmentRestoreErrors = [System.Collections.Generic.List[string]]::new()
  foreach ($snapshot in @(
    [ordered]@{ name = 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'; present = $previousWebViewArgsPresent; value = $previousWebViewArgs }
    [ordered]@{ name = 'WEBVIEW2_USER_DATA_FOLDER'; present = $previousWebViewUserDataPresent; value = $previousWebViewUserData }
  )) {
    try {
      if ($snapshot.present) {
        Set-Item -LiteralPath "Env:$($snapshot.name)" -Value ([string]$snapshot.value) -ErrorAction Stop
      } elseif (Test-Path "Env:$($snapshot.name)") {
        Remove-Item -LiteralPath "Env:$($snapshot.name)" -ErrorAction Stop
      }
    } catch {
      $environmentRestoreErrors.Add("$($snapshot.name): $($_.Exception.Message)") | Out-Null
    }
  }
  $webViewEnvironmentRestored = (
    ((Test-Path Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS) -eq $previousWebViewArgsPresent) -and
    (-not $previousWebViewArgsPresent -or $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -eq $previousWebViewArgs) -and
    ((Test-Path Env:WEBVIEW2_USER_DATA_FOLDER) -eq $previousWebViewUserDataPresent) -and
    (-not $previousWebViewUserDataPresent -or $env:WEBVIEW2_USER_DATA_FOLDER -eq $previousWebViewUserData)
  )
  foreach ($restoreError in $environmentRestoreErrors) {
    $cleanupErrors.Add("environment_restore: $restoreError") | Out-Null
  }
  if (-not $webViewEnvironmentRestored) {
    $cleanupErrors.Add('environment_restore: WebView2 environment snapshot mismatch') | Out-Null
  }

  $webViewUserDataRemoved = $null
  if (-not $KeepAlive) {
    try {
      if ($webViewProfileCreated -and (Test-Path -LiteralPath $webViewTempRoot)) {
        Remove-Item -LiteralPath $webViewTempRoot -Recurse -Force -ErrorAction Stop
      }
    } catch {
      $cleanupErrors.Add("profile_remove: $($_.Exception.Message)") | Out-Null
    }
    $webViewUserDataRemoved = -not (Test-Path -LiteralPath $webViewTempRoot)
    if (-not $webViewUserDataRemoved) {
      $cleanupErrors.Add('profile_remove: WebView2 profile root remains') | Out-Null
    }
  }
  $report.cleanup = [ordered]@{
    preservedPreexistingProcessIds = @($existingBefore)
    stoppedLauncherWrapperPid = $launcherWrapperPid
    ownedProcessIdsBeforeCleanup = @($ownedProcessIdsBeforeCleanup)
    remainingOwnedProcessIds = @($remainingOwnedProcessIds)
    launcherProcessTreeTerminated = $launcherProcessTreeTerminated
    webViewEnvironmentRestored = $webViewEnvironmentRestored
    webViewUserDataRemoved = $webViewUserDataRemoved
    cleanupSkippedKeepAlive = [bool]$KeepAlive
    cleanupFailed = $cleanupErrors.Count -gt 0
    cleanupErrors = $cleanupErrors.ToArray()
  }
  if ($cleanupErrors.Count -gt 0) {
    $report.status = 'failed'
    $report.errors += $cleanupErrors.ToArray()
  }
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Output "Action hotkeys physical smoke report: $reportPath"
}
