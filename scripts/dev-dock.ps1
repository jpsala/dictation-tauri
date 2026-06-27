param(
  [switch]$Restart,
  [switch]$Refresh,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$reports = Join-Path $repo 'artifacts/microphone-capture/reports'
New-Item -ItemType Directory -Force -Path $reports | Out-Null
$stdout = Join-Path $reports 'tauri-dev-live.log'
$stderr = Join-Path $reports 'tauri-dev-live.err.log'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DevDockWindowApi {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@ -ErrorAction SilentlyContinue

function Stop-DevDockProcesses {
  Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  $portOwners = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($ownerPid in $portOwners) {
    if ($ownerPid -and $ownerPid -ne $PID) {
      Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    }
  }

  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -like '*dictation*tauri*' -or
      $_.CommandLine -like '*vite*1420*' -or
      $_.CommandLine -like '*npm*run*dev*'
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Refresh-DevDockWindow($process) {
  if (-not $process -or -not $process.MainWindowHandle -or $process.MainWindowHandle -eq [IntPtr]::Zero) {
    Write-Host 'dockWindow=missing'
    return
  }

  $SW_SHOWNOACTIVATE = 4
  $HWND_TOPMOST = [IntPtr](-1)
  $SWP_NOSIZE = 0x0001
  $SWP_NOMOVE = 0x0002
  $SWP_NOACTIVATE = 0x0010
  $SWP_SHOWWINDOW = 0x0040

  [DevDockWindowApi]::ShowWindowAsync($process.MainWindowHandle, $SW_SHOWNOACTIVATE) | Out-Null
  [DevDockWindowApi]::SetWindowPos(
    $process.MainWindowHandle,
    $HWND_TOPMOST,
    0,
    0,
    0,
    0,
    ($SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE -bor $SWP_SHOWWINDOW)
  ) | Out-Null
  Write-Host "dockWindow=refreshed pid=$($process.Id)"
}

if ($Restart) {
  Stop-DevDockProcesses
  Start-Sleep -Seconds 2
}

$dictation = Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $dictation -and -not $Status) {
  Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run','tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Minimized
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    Start-Sleep -Seconds 1
    $dictation = Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($dictation) { break }
  }

  if ($dictation) {
    # The process can exist before the WebView listener and native hotkeys are ready.
    # Keep smoke tests from racing dock startup after a cold restart.
    Start-Sleep -Seconds 15
  }
}

if ($Refresh -or (-not $Status -and $dictation)) {
  $dictation = Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -First 1
  Refresh-DevDockWindow $dictation
}

Get-Process -Name dictation-tauri,node -ErrorAction SilentlyContinue |
  Select-Object ProcessName,Id,MainWindowTitle,Path |
  Format-Table -AutoSize

Write-Host "stdout=$stdout"
Write-Host "stderr=$stderr"
