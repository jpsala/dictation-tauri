param(
  [switch]$Restart,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$reports = Join-Path $repo 'artifacts/microphone-capture/reports'
New-Item -ItemType Directory -Force -Path $reports | Out-Null
$stdout = Join-Path $reports 'tauri-dev-live.log'
$stderr = Join-Path $reports 'tauri-dev-live.err.log'

function Get-DictationDevProcesses {
  Get-Process -Name dictation-tauri,node -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowTitle -like '*Dictation*' -or
      ($_.Path -and $_.Path -like '*dictation*') -or
      ($_.CommandLine -and $_.CommandLine -like '*tauri*')
    }
}

if ($Restart) {
  Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

$dictation = Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $dictation -and -not $Status) {
  Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run','tauri:dev') `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Minimized
  Start-Sleep -Seconds 12
}

Get-Process -Name dictation-tauri,node -ErrorAction SilentlyContinue |
  Select-Object ProcessName,Id,MainWindowTitle,Path |
  Format-Table -AutoSize

Write-Host "stdout=$stdout"
Write-Host "stderr=$stderr"
