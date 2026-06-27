param(
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [switch]$StopExisting,
  [switch]$NoHidden
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$root = Join-Path $repo "artifacts/live-app/$RunId"
New-Item -ItemType Directory -Force -Path $root | Out-Null
$logPath = Join-Path $root 'tauri-dev.log'

function Stop-Tree([int]$ProcessIdToStop) {
  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessIdToStop })
  foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
  Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue
}

if ($StopExisting) {
  $repoNeedle = $repo.ToLowerInvariant()
  $candidates = @(Get-CimInstance Win32_Process | Where-Object {
    $commandLine = if ($_.CommandLine) { $_.CommandLine.ToLowerInvariant() } else { '' }
    $commandLine.Contains($repoNeedle) -and (
      $commandLine -match 'tauri:dev' -or
      $commandLine -match 'tauri dev' -or
      $commandLine -match 'vite .*--port 1420' -or
      $commandLine -match 'dictation-tauri\.exe'
    )
  })
  $candidatePids = @($candidates | ForEach-Object { [int]$_.ProcessId })
  $roots = @($candidates | Where-Object { $candidatePids -notcontains [int]$_.ParentProcessId })
  foreach ($process in $roots) {
    Stop-Tree ([int]$process.ProcessId)
  }
  Start-Sleep -Seconds 1
}

$command = @"
Set-Location "$repo"
`$env:DICTATION_TAURI_STARTED_HIDDEN = 'true'
npm run tauri:dev *> "$logPath"
"@

$startInfo = @{
  FilePath = 'powershell.exe'
  ArgumentList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command)
  WorkingDirectory = $repo
  PassThru = $true
}

if (-not $NoHidden) {
  $startInfo.WindowStyle = 'Hidden'
}

$process = Start-Process @startInfo
[ordered]@{
  wrapperPid = $process.Id
  hidden = -not [bool]$NoHidden
  log = $logPath
  runId = $RunId
} | ConvertTo-Json -Depth 4
