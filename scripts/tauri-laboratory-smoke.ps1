param(
  [switch]$AllowDesktopSideEffects,
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$StartupTimeoutSeconds = 90,
  [int]$RemoteDebugPort = 9347,
  [switch]$KeepAlive
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'This smoke starts a real Tauri window and resizes it natively. Re-run with -AllowDesktopSideEffects after local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/tauri-laboratory-smoke/$RunId"
$profileRoot = Join-Path $runRoot 'isolated-profile'
$reportPath = Join-Path $runRoot 'report.json'
$screenshotPath = Join-Path $runRoot 'laboratory-720x620.png'
$zoomScreenshotPath = Join-Path $runRoot 'laboratory-200-percent.png'
$tauriOutLog = Join-Path $runRoot 'tauri-dev.out.log'
$tauriErrLog = Join-Path $runRoot 'tauri-dev.err.log'
$envKeys = @('APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'GROQ_API_KEY', 'GROQ-API-KEY', 'FIXVOX_DEVICE_ID', 'FIXVOX_INSTALL_ID', 'DICTATION_LAB_SMOKE_SHOW_WINDOW', 'DICTATION_LAB_SMOKE_RUN_REPLAY', 'DICTATION_LAB_SMOKE_SCREENSHOT', 'DICTATION_LAB_SMOKE_ZOOM_SCREENSHOT', 'DICTATION_LAB_SMOKE_CDP_WS')
$tauriProc = $null
$previousEnv = @{}
$replayRoot = Join-Path $repo 'artifacts/transcription-quality'
$existingReplayRuns = @(Get-ChildItem -LiteralPath $replayRoot -Directory -Filter 'lab-lab-*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class LaboratorySmokeWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  public static IntPtr FindVisibleWindow(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var text = new StringBuilder(512);
      GetWindowText(hWnd, text, text.Capacity);
      if (text.ToString().IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0) { found = hWnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static bool Resize(IntPtr hWnd, int width, int height) {
    const uint SWP_NOMOVE = 0x0002, SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    return SetWindowPos(hWnd, IntPtr.Zero, 0, 0, width, height, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);
  }
  public static bool IsResponding(IntPtr hWnd) {
    return hWnd != IntPtr.Zero && !IsHungAppWindow(hWnd);
  }
  public static string Bounds(IntPtr hWnd) {
    Rect rect;
    if (!GetWindowRect(hWnd, out rect)) return "";
    return (rect.Right - rect.Left) + "x" + (rect.Bottom - rect.Top);
  }
}
"@

function Stop-Tree([int]$ProcessIdToStop) {
  foreach ($child in @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })) { Stop-Tree ([int]$child.ProcessId) }
  Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue
}

function Get-CdpPages([int]$Port) {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    foreach ($item in $response) { Write-Output $item }
  } catch { }
}

function Wait-ForCdpPage([int]$Port, [string]$UrlPart, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    foreach ($candidate in @(Get-CdpPages $Port)) {
      if ($candidate.url -like "*$UrlPart*" -and $candidate.webSocketDebuggerUrl) {
        return $candidate
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Tauri WebView2 CDP page containing '$UrlPart' was not available before timeout."
}

function Invoke-CdpExpression([object]$Page, [string]$Expression) {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Expression))
  $result = node (Join-Path $repo 'scripts/cdp-evaluate.mjs') $Page.webSocketDebuggerUrl "base64:$encoded"
  if ($LASTEXITCODE -ne 0) { throw 'Tauri CDP expression failed.' }
  return [string]$result
}

function Save-WindowScreenshot([IntPtr]$WindowHandle, [string]$Path) {
  Add-Type -AssemblyName System.Drawing
  $rect = New-Object LaboratorySmokeWin32+Rect
  if (-not [LaboratorySmokeWin32]::GetWindowRect($WindowHandle, [ref]$rect)) { throw 'Native screenshot bounds unavailable.' }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $bitmap = New-Object Drawing.Bitmap($width, $height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Add-Check([string]$Name, [bool]$Passed, [hashtable]$Details = @{}) {
  $report.checks += [ordered]@{ name = $Name; passed = $Passed; details = $Details }
  if (-not $Passed) { throw "Laboratory smoke check failed: $Name" }
}

$report = [ordered]@{
  check = 'tauri-laboratory-smoke'
  runId = $RunId
  startedAt = (Get-Date).ToString('o')
  status = 'running'
  redacted = $true
  providerFree = $true
  readOnly = $false
  checks = @()
  artifacts = [ordered]@{ report = $reportPath; screenshot = $screenshotPath; zoomScreenshot = $zoomScreenshotPath; stdout = $tauriOutLog; stderr = $tauriErrLog; replay = $null }
  notes = 'Real Tauri WebView2 smoke. Native window resizing uses SetWindowPos only. The native provider-free replay writes redacted local artifacts; no provider, product mutation, audio, delivery, or unsafe hotkeys are invoked.'
}

try {
  foreach ($key in $envKeys) { $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  $env:APPDATA = Join-Path $profileRoot 'appdata'
  $env:LOCALAPPDATA = Join-Path $profileRoot 'localappdata'
  $env:TEMP = Join-Path $profileRoot 'temp'
  $env:TMP = $env:TEMP
  $env:DICTATION_LAB_SMOKE_SHOW_WINDOW = '1'
  $env:DICTATION_LAB_SMOKE_RUN_REPLAY = '1'
  $env:DICTATION_LAB_SMOKE_SCREENSHOT = $screenshotPath
  $env:DICTATION_LAB_SMOKE_ZOOM_SCREENSHOT = $zoomScreenshotPath
  Remove-Item Env:GROQ_API_KEY, 'Env:GROQ-API-KEY', Env:FIXVOX_DEVICE_ID, Env:FIXVOX_INSTALL_ID -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA, $env:TEMP | Out-Null

  if (Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue) {
    throw 'An existing dictation-tauri process is running. It was left untouched; retry after it exits to keep this smoke isolated.'
  }

  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  $tauriProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'tauri:dev') -WorkingDirectory $repo -RedirectStandardOutput $tauriOutLog -RedirectStandardError $tauriErrLog -PassThru
  $mainPageInfo = $null
  $startupDeadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while (-not $mainPageInfo -and (Get-Date) -lt $startupDeadline) {
    $mainPageInfo = Get-CdpPages $RemoteDebugPort | Where-Object { $_.webSocketDebuggerUrl } | Select-Object -First 1
    if (-not $mainPageInfo) { Start-Sleep -Milliseconds 500 }
  }
  if (-not $mainPageInfo) { throw 'No Tauri WebView2 CDP page was available before timeout.' }
  $env:DICTATION_LAB_SMOKE_CDP_WS = [string]$mainPageInfo.webSocketDebuggerUrl
  Add-Check 'Tauri WebView2 page is available' ([bool]$mainPageInfo.webSocketDebuggerUrl) @{ port = $RemoteDebugPort }

  $settingsPage = @(Wait-ForCdpPage $RemoteDebugPort '#settings' 20)[0]
  Start-Sleep -Seconds 2
  $settingsProbe = Invoke-CdpExpression $settingsPage "JSON.stringify({url:location.href,ready:document.readyState,hasDictation:[...document.querySelectorAll('button')].some((item)=>item.textContent?.includes('Dictado')&&item.textContent?.includes('Audio y entrega'))})" | ConvertFrom-Json
  Add-Check 'Settings WebView host is configured' ([bool]$settingsPage.webSocketDebuggerUrl -and $settingsProbe.url -like '*#settings' -and $settingsProbe.hasDictation) @{ url = $settingsProbe.url; ready = $settingsProbe.ready }
  $laboratoryPageBefore = @(Wait-ForCdpPage $RemoteDebugPort 'surface=dictation-lab' 20)[0]
  $laboratoryNavigationBefore = [double](Invoke-CdpExpression $laboratoryPageBefore "performance.timeOrigin")
  $settingsSectionResult = Invoke-CdpExpression $settingsPage "(()=>{const section=[...document.querySelectorAll('button')].find((item)=>item.textContent?.includes('Dictado')&&item.textContent?.includes('Audio y entrega'));if(!section)throw new Error('dictation-settings-section-unavailable');section.click();return 'selected';})()"
  if ($settingsSectionResult -ne 'selected') { throw 'Settings Dictation section did not activate.' }
  Start-Sleep -Milliseconds 500
  $settingsEntryResult = Invoke-CdpExpression $settingsPage "(()=>{const open=[...document.querySelectorAll('button')].find((item)=>item.textContent?.trim()==='Abrir laboratorio');if(!open||open.disabled)throw new Error('laboratory-entry-unavailable');open.click();return 'clicked';})()"
  if ($settingsEntryResult -ne 'clicked') { throw 'Settings Laboratory entry did not execute.' }
  $settingsOpenResult = $false
  $settingsOpenDeadline = (Get-Date).AddSeconds(20)
  while (-not $settingsOpenResult -and (Get-Date) -lt $settingsOpenDeadline) {
    Start-Sleep -Milliseconds 250
    try {
      $laboratoryPageAfter = @(Wait-ForCdpPage $RemoteDebugPort 'surface=dictation-lab' 2)[0]
      $laboratoryNavigationAfter = [double](Invoke-CdpExpression $laboratoryPageAfter "performance.timeOrigin")
      $settingsOpenResult = $laboratoryNavigationAfter -gt $laboratoryNavigationBefore
    } catch { }
  }
  Add-Check 'Settings command opens Dictation Laboratory' $settingsOpenResult @{ navigationBefore = $laboratoryNavigationBefore; navigationAfter = $laboratoryNavigationAfter }

  $laboratoryPage = @(Wait-ForCdpPage $RemoteDebugPort 'surface=dictation-lab' 20)[0]
  Start-Sleep -Seconds 2
  $initialExpression = "JSON.stringify({title:document.querySelector('h1')?.textContent||document.title,workspaceCount:document.querySelectorAll('[data-workspace-id]').length,noProviderActions:[...document.querySelectorAll('button')].filter((item)=>/Transcribe with provider|Start provider|Run provider|Deliver/i.test(item.textContent||'')).length,ready:document.readyState,responding:Boolean(document.querySelector('.lab-shell')),pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})"
  $capture = Invoke-CdpExpression $laboratoryPage $initialExpression | ConvertFrom-Json
  $report.capture = $capture
  Add-Check 'Dictation Laboratory renders all five workspaces' ($capture.workspaceCount -eq 5 -and $capture.title -eq 'Dictation Laboratory') @{ workspaceCount = $capture.workspaceCount }
  Add-Check 'Laboratory starts provider-free and read-only' ($capture.noProviderActions -eq 0) @{}

  $laboratoryHwnd = [LaboratorySmokeWin32]::FindVisibleWindow('Dictation Laboratory')
  Add-Check 'Native Laboratory window is visible' ($laboratoryHwnd -ne [IntPtr]::Zero) @{}
  foreach ($size in @(@(720, 620), @(900, 700))) {
    if (-not [LaboratorySmokeWin32]::Resize($laboratoryHwnd, $size[0], $size[1])) { throw "Native resize failed for $($size[0])x$($size[1])." }
    Start-Sleep -Milliseconds 500
    $bounds = [LaboratorySmokeWin32]::Bounds($laboratoryHwnd)
    $probe = Invoke-CdpExpression $laboratoryPage "JSON.stringify({ready:document.readyState,responding:Boolean(document.querySelector('.lab-shell')),width:innerWidth,height:innerHeight,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})" | ConvertFrom-Json
    $windowsResponding = [LaboratorySmokeWin32]::IsResponding($laboratoryHwnd)
    Add-Check "Laboratory responds after native resize to $($size[0])x$($size[1])" ($windowsResponding -and $probe.ready -eq 'complete' -and $probe.responding -and -not $probe.pageOverflow) @{ nativeBounds = $bounds; windowsResponding = $windowsResponding; viewport = @{ width = $probe.width; height = $probe.height } }
    if ($size[0] -eq 720) { Save-WindowScreenshot $laboratoryHwnd $screenshotPath }
  }

  $zoomProbe = Invoke-CdpExpression $laboratoryPage "document.documentElement.style.zoom='2';JSON.stringify({ready:document.readyState,responding:Boolean(document.querySelector('.lab-shell')),pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,workspaceCount:document.querySelectorAll('[data-workspace-id]').length})" | ConvertFrom-Json
  Save-WindowScreenshot $laboratoryHwnd $zoomScreenshotPath
  Add-Check 'Laboratory responds at 200 percent zoom' ($zoomProbe.ready -eq 'complete' -and $zoomProbe.responding -and -not $zoomProbe.pageOverflow -and $zoomProbe.workspaceCount -eq 5) @{ workspaceCount = $zoomProbe.workspaceCount }

  $replayDeadline = (Get-Date).AddSeconds(30)
  $newReplay = $null
  while (-not $newReplay -and (Get-Date) -lt $replayDeadline) {
    $newReplay = Get-ChildItem -LiteralPath $replayRoot -Directory -Filter 'lab-lab-*' -ErrorAction SilentlyContinue |
      Where-Object { $existingReplayRuns -notcontains $_.FullName -and (Test-Path (Join-Path $_.FullName 'run.json')) } |
      Select-Object -First 1
    if (-not $newReplay) { Start-Sleep -Milliseconds 250 }
  }
  if (-not $newReplay) { throw 'Provider-free replay did not complete through the real Tauri host.' }
  $replayRunPath = Join-Path $newReplay.FullName 'run.json'
  $replayRun = Get-Content -Raw -LiteralPath $replayRunPath | ConvertFrom-Json
  $report.artifacts.replay = $replayRunPath
  Add-Check 'Real Tauri provider-free replay completes with zero provider calls' (-not $replayRun.providerCalls.enabled -and $replayRun.providerCalls.maxRequests -eq 0 -and @($replayRun.sampleIds).Count -eq 2) @{ runId = $replayRun.runId; sampleCount = @($replayRun.sampleIds).Count; maxRequests = $replayRun.providerCalls.maxRequests }
  $report.status = 'passed'
} catch {
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  throw
} finally {
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $reportPath
  if (-not $KeepAlive -and $tauriProc -and -not $tauriProc.HasExited) { Stop-Tree $tauriProc.Id }
  foreach ($key in $envKeys) { [Environment]::SetEnvironmentVariable($key, $previousEnv[$key], 'Process') }
  Write-Output "Tauri Laboratory smoke report: $reportPath"
}
