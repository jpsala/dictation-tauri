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
}

Get-Process -Name dictation-tauri,node -ErrorAction SilentlyContinue |
  Select-Object ProcessName,Id,MainWindowTitle,Path |
  Format-Table -AutoSize

Write-Host "stdout=$stdout"
Write-Host "stderr=$stderr"
