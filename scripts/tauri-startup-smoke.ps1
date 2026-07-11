param(
  [string]$ExePath = (Join-Path $PSScriptRoot '..\src-tauri\target\release\dictation-tauri.exe'),
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [int]$StartupTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $repo "artifacts/startup-smoke/$RunId"
$profileRoot = Join-Path $runRoot 'profile'
$workRoot = Join-Path $profileRoot 'work'
$reportPath = Join-Path $runRoot 'report.json'
$outLog = Join-Path $runRoot 'app.out.log'
$errLog = Join-Path $runRoot 'app.err.log'
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
$ExePath = (Resolve-Path $ExePath).Path

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class StartupSmokeWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
  public static List<string> UserVisibleWindowsForPid(int pid) {
    var result = new List<string>();
    EnumWindows((hWnd, lParam) => {
      uint owner; GetWindowThreadProcessId(hWnd, out owner);
      if (owner == pid && IsWindowVisible(hWnd)) {
        var title = new StringBuilder(512); GetWindowText(hWnd, title, title.Capacity);
        var className = new StringBuilder(512); GetClassName(hWnd, className, className.Capacity);
        Rect rect; GetWindowRect(hWnd, out rect);
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (title.Length > 0 || width > 8 || height > 8) {
          result.Add(hWnd.ToInt64() + ":" + title.ToString() + ":" + className.ToString() + ":" + rect.Left + "," + rect.Top + "," + rect.Right + "," + rect.Bottom);
        }
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
"@

function Stop-Tree([int]$ProcessId) {
  foreach ($child in @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId })) {
    Stop-Tree ([int]$child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-ProcessTreeIds([int]$ProcessId) {
  $ids = @($ProcessId)
  foreach ($child in @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId })) {
    $ids += Get-ProcessTreeIds ([int]$child.ProcessId)
  }
  return $ids
}

function Add-Check([string]$Name, [bool]$Pass, [object]$Data = $null) {
  $script:report.checks += [ordered]@{ name = $Name; pass = $Pass; data = $Data }
  if (-not $Pass) { throw "Startup smoke check failed: $Name" }
}

$envKeys = @(
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
  'DICTATION_TAURI_STARTUP_SMOKE', 'GROQ_API_KEY', 'GROQ-API-KEY',
  'FIXVOX_DEVICE_ID', 'FIXVOX_INSTALL_ID', 'FIXVOX_STT_MODEL', 'FIXVOX_STT_LANGUAGE'
)
$previousEnv = @{}
$app = $null
$report = [ordered]@{
  check = 'tauri-startup-smoke'
  runId = $RunId
  startedAt = (Get-Date).ToString('o')
  executable = $ExePath
  root = $runRoot
  checks = @()
  artifacts = [ordered]@{ report = $reportPath; stdout = $outLog; stderr = $errLog }
}

try {
  foreach ($key in $envKeys) { $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  $env:APPDATA = Join-Path $profileRoot 'appdata'
  $env:LOCALAPPDATA = Join-Path $profileRoot 'localappdata'
  $env:TEMP = Join-Path $profileRoot 'temp'
  $env:TMP = $env:TEMP
  $env:DICTATION_TAURI_STARTUP_SMOKE = '1'
  Remove-Item Env:GROQ_API_KEY, 'Env:GROQ-API-KEY', Env:FIXVOX_DEVICE_ID, Env:FIXVOX_INSTALL_ID, Env:FIXVOX_STT_MODEL, Env:FIXVOX_STT_LANGUAGE -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA, $env:TEMP | Out-Null

  $app = Start-Process -FilePath $ExePath -WorkingDirectory $workRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $log = ''
  while ((Get-Date) -lt $deadline -and -not $app.HasExited) {
    $log = (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) + (Get-Content $outLog -Raw -ErrorAction SilentlyContinue)
    if ($log -match '\[dictation-tauri\]\[startup-smoke\] main WebView loaded' -and $log -match '\[dictation-tauri\]\[startup-smoke\] suppressed') { break }
    Start-Sleep -Milliseconds 250
  }

  Add-Check 'owned Tauri process remains alive' (-not $app.HasExited) @{ pid = $app.Id }
  $processIds = @(Get-ProcessTreeIds ([int]$app.Id) | Select-Object -Unique)
  $visibleWindows = @($processIds | ForEach-Object { [StartupSmokeWin32]::UserVisibleWindowsForPid([int]$_) })
  Add-Check 'owned Tauri process tree has no user-visible windows' ($visibleWindows.Count -eq 0) @{ pids = $processIds; hwnds = @($visibleWindows) }

  Add-Check 'startup smoke confirms hidden main WebView loaded' ($log -match '\[dictation-tauri\]\[startup-smoke\] main WebView loaded') @{ logMatched = $true }
  Add-Check 'startup smoke confirms suppressed desktop side effects' ($log -match '\[dictation-tauri\]\[startup-smoke\] suppressed') @{ logMatched = $true }
  $report.status = 'passed'
} catch {
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  throw
} finally {
  if ($app) { Stop-Tree ([int]$app.Id) }
  foreach ($key in $envKeys) {
    [Environment]::SetEnvironmentVariable($key, $previousEnv[$key], 'Process')
  }
  $report.finishedAt = (Get-Date).ToString('o')
  $report | ConvertTo-Json -Depth 8 | Set-Content -Path $reportPath -Encoding UTF8
}
