param(
  [switch]$AllowDesktopSideEffects
)

$ErrorActionPreference = 'Stop'

if (-not $AllowDesktopSideEffects) {
  throw 'Desktop hotkey smoke opens Tauri and sends Ctrl+Shift+F9. Re-run with -AllowDesktopSideEffects only after explicit local approval.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$artifactRoot = Join-Path $repo 'artifacts/desktop-control'
$audioRoot = Join-Path $repo 'artifacts/microphone-capture/audio'
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null

$outLog = Join-Path $artifactRoot "tauri-hotkey-smoke-$stamp.out.log"
$errLog = Join-Path $artifactRoot "tauri-hotkey-smoke-$stamp.err.log"
$resultPath = Join-Path $artifactRoot "hotkey-smoke-$stamp.json"
$startedAt = Get-Date
$proc = $null

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) {
    Stop-Tree ([int]$child.ProcessId)
  }
  $p = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
  if ($p) {
    Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue
  }
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DesktopHotkeySmokeKeyboard {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

function Send-CtrlShiftF9() {
  $KEYEVENTF_KEYUP = 0x0002
  $VK_CONTROL = 0x11
  $VK_SHIFT = 0x10
  $VK_F9 = 0x78
  [DesktopHotkeySmokeKeyboard]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
  [DesktopHotkeySmokeKeyboard]::keybd_event($VK_SHIFT, 0, 0, [UIntPtr]::Zero)
  [DesktopHotkeySmokeKeyboard]::keybd_event($VK_F9, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
  [DesktopHotkeySmokeKeyboard]::keybd_event($VK_F9, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [DesktopHotkeySmokeKeyboard]::keybd_event($VK_SHIFT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [DesktopHotkeySmokeKeyboard]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

try {
  $proc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run', 'tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

  $ready = $false
  $deadline = (Get-Date).AddSeconds(55)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if ($proc.HasExited) {
      throw "tauri dev exited early with code $($proc.ExitCode). See $outLog and $errLog"
    }

    $combined = ''
    if (Test-Path $outLog) { $combined += (Get-Content $outLog -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $errLog) { $combined += (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) }

    $appProcess = Get-Process -Name 'dictation-tauri' -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1

    if (($combined -match 'Running.*target\\debug\\dictation-tauri.exe' -or $combined -match 'target\\debug\\dictation-tauri.exe') -and $appProcess) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    Write-Host 'Tauri window readiness was not confirmed before timeout; sending hotkeys anyway for gated smoke.'
  }

  Start-Sleep -Seconds 3
  Send-CtrlShiftF9
  $firstHotkeyAt = Get-Date
  Start-Sleep -Seconds 5
  Send-CtrlShiftF9
  $secondHotkeyAt = Get-Date
  Start-Sleep -Seconds 5

  $newAudio = @(Get-ChildItem -Path $audioRoot -Filter '*.wav' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $startedAt } |
    Sort-Object LastWriteTime -Descending)

  $status = if ($newAudio.Count -gt 0) { 'artifact_created' } else { 'no_audio_artifact_detected' }
  $result = [ordered]@{
    check = 'desktop-hotkey-smoke'
    approvedByUser = $true
    shortcut = 'Ctrl+Shift+F9'
    startedAt = $startedAt.ToString('o')
    firstHotkeyAt = $firstHotkeyAt.ToString('o')
    secondHotkeyAt = $secondHotkeyAt.ToString('o')
    tauriReadinessLogMatched = $ready
    status = $status
    audioArtifacts = @($newAudio | ForEach-Object { [ordered]@{
      name = $_.Name
      relativePath = ('artifacts/microphone-capture/audio/' + $_.Name)
      sizeBytes = $_.Length
      lastWriteTime = $_.LastWriteTime.ToString('o')
    }})
    stdoutLog = ('artifacts/desktop-control/' + (Split-Path $outLog -Leaf))
    stderrLog = ('artifacts/desktop-control/' + (Split-Path $errLog -Leaf))
    notes = 'Redacted local smoke evidence. No provider call, no selection capture, no paste automation, no transcript content.'
  }

  $result | ConvertTo-Json -Depth 6 | Set-Content -Path $resultPath -Encoding UTF8
  Write-Host "HOTKEY_SMOKE_RESULT=$resultPath"
  Write-Host "HOTKEY_SMOKE_STATUS=$status"
  if ($newAudio.Count -gt 0) {
    $newAudio | Select-Object -First 3 | ForEach-Object { Write-Host ("HOTKEY_SMOKE_AUDIO={0} size={1}" -f $_.FullName, $_.Length) }
  }
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Tree ([int]$proc.Id)
  }
}
