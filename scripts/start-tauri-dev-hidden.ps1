param(
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [switch]$StopExisting,
  [switch]$NoHidden,
  [int]$StopTimeoutMs = 3000
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$root = Join-Path $repo "artifacts/live-app/$RunId"
New-Item -ItemType Directory -Force -Path $root | Out-Null
$logPath = Join-Path $root 'tauri-dev.log'
$stopWarnings = [System.Collections.Generic.List[string]]::new()

function Get-PortOwnerPids {
  param([int]$Port)

  try {
    $lines = & netstat.exe -ano -p tcp 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $lines) {
      return @()
    }

    return @(
      $lines |
        Where-Object { $_ -match "^\s*TCP\s+\S+:$Port\s+" } |
        ForEach-Object {
          if ($_ -match "\s+(\d+)\s*$") { [int]$Matches[1] }
        } |
        Where-Object { $_ -and $_ -ne $PID } |
        Select-Object -Unique
    )
  } catch {
    $stopWarnings.Add("port-scan-failed: $($_.Exception.Message)") | Out-Null
    return @()
  }
}

function Stop-PidBounded {
  param(
    [int]$TargetPid,
    [string]$Reason,
    [datetime]$Deadline
  )

  if (-not $TargetPid -or $TargetPid -eq $PID) {
    return
  }

  $remaining = [int][Math]::Ceiling(($Deadline - (Get-Date)).TotalSeconds)
  if ($remaining -lt 1) {
    $stopWarnings.Add("stop-timeout-before-pid:${TargetPid}:${Reason}") | Out-Null
    return
  }

  $process = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }

  try {
    & taskkill.exe /PID $TargetPid /T /F *> $null
  } catch {
    try {
      Stop-Process -Id $TargetPid -Force -ErrorAction Stop
    } catch {
      $stopWarnings.Add("stop-failed:${TargetPid}:${Reason}:$($_.Exception.Message)") | Out-Null
      return
    }
  }

  try {
    Wait-Process -Id $TargetPid -Timeout $remaining -ErrorAction SilentlyContinue
  } catch {
    # Wait-Process throws if the process exits before it starts waiting; that is OK.
  }

  Start-Sleep -Milliseconds 250
  if (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) {
    $stopWarnings.Add("stop-timeout:${TargetPid}:${Reason}") | Out-Null
  }
}

if ($StopExisting) {
  $deadline = (Get-Date).AddMilliseconds([Math]::Max(500, $StopTimeoutMs))

  $existingAppPids = @(
    Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -ne $PID } |
      Select-Object -ExpandProperty Id -Unique
  )

  foreach ($processId in $existingAppPids) {
    Stop-PidBounded -TargetPid ([int]$processId) -Reason 'dictation-tauri' -Deadline $deadline
  }

  foreach ($processId in (Get-PortOwnerPids -Port 1420)) {
    Stop-PidBounded -TargetPid ([int]$processId) -Reason 'port-1420' -Deadline $deadline
  }
}

$command = @"
Set-Location "$repo"
`$env:DICTATION_TAURI_STARTED_HIDDEN = 'true'
cmd.exe /d /s /c "npm run tauri:dev > ""$logPath"" 2>&1"
"@

if ($NoHidden) {
  $process = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
    -WorkingDirectory $repo `
    -WindowStyle Normal `
    -PassThru
} else {
  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($command))
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'powershell.exe'
  $startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand $encodedCommand"
  $startInfo.WorkingDirectory = $repo
  # UseShellExecute keeps the long-lived child detached from npm/pi stdout pipes.
  # Without this, `npm run tauri:dev:hidden -- -StopExisting` can appear to hang
  # until the nested `tauri dev` process exits even though this wrapper is done.
  $startInfo.UseShellExecute = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $process = [System.Diagnostics.Process]::Start($startInfo)
}

[ordered]@{
  wrapperPid = $process.Id
  hidden = -not [bool]$NoHidden
  log = $logPath
  runId = $RunId
  stopExisting = [bool]$StopExisting
  stopTimeoutMs = $StopTimeoutMs
  stopWarnings = @($stopWarnings)
} | ConvertTo-Json -Depth 4
