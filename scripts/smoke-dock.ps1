param(
  [ValidateSet('AltSpace','Fallback')]
  [string]$Mode = 'AltSpace',
  [int]$RecordSeconds = 5,
  [string]$SpeakText = 'dictation smoke test'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$audioDir = Join-Path $repo 'artifacts/microphone-capture/audio'
$reportsDir = Join-Path $repo 'artifacts/microphone-capture/reports'
New-Item -ItemType Directory -Force -Path $audioDir,$reportsDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $reportsDir "smoke-target-$Mode-$stamp.txt"
$report = Join-Path $reportsDir "dock-smoke-$Mode-$stamp.json"
Set-Content -Path $target -Value '' -NoNewline
$sentinel = "DICTATION_SMOKE_SENTINEL_$stamp"
for ($attempt = 0; $attempt -lt 8; $attempt += 1) {
  try {
    Set-Clipboard -Value $sentinel
    break
  } catch {
    if ($attempt -eq 7) { throw }
    Start-Sleep -Milliseconds 150
  }
}

$before = @(Get-ChildItem -Path $audioDir -Filter '*.wav' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
$beforeLatest = $before | Select-Object -Last 1

$notepad = Start-Process -FilePath 'notepad.exe' -ArgumentList $target -PassThru
Start-Sleep -Seconds 2
$wshell = New-Object -ComObject WScript.Shell
[void]$wshell.AppActivate($notepad.Id)
Start-Sleep -Milliseconds 500

Add-Type -AssemblyName System.Windows.Forms
$keys = if ($Mode -eq 'AltSpace') { '% ' } else { '^+{F9}' }
[System.Windows.Forms.SendKeys]::SendWait($keys)
Start-Sleep -Milliseconds 600
if (-not [string]::IsNullOrWhiteSpace($SpeakText)) {
  try {
    $voice = New-Object -ComObject SAPI.SpVoice
    [void]$voice.Speak($SpeakText, 1)
  } catch {
    # Speech synthesis is best-effort; the smoke still verifies hotkey/capture artifacts.
  }
}
Start-Sleep -Seconds $RecordSeconds
[System.Windows.Forms.SendKeys]::SendWait($keys)

# Give capture, STT, focus/clipboard paste and UI recovery time to settle.
Start-Sleep -Seconds 25
[void]$wshell.AppActivate($notepad.Id)
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('^s')
Start-Sleep -Milliseconds 500

$after = @(Get-ChildItem -Path $audioDir -Filter '*.wav' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
$afterLatest = $after | Select-Object -Last 1
$content = Get-Content -Raw -Path $target -ErrorAction SilentlyContinue
$clipboard = Get-Clipboard -Raw -ErrorAction SilentlyContinue
$dictation = Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Select-Object -First 1

$result = [ordered]@{
  mode = $Mode
  sentKeys = if ($Mode -eq 'AltSpace') { 'Alt+Space twice' } else { 'Ctrl+Shift+F9 twice' }
  spokenFixture = if ([string]::IsNullOrWhiteSpace($SpeakText)) { $null } else { '[REDACTED_SYNTHETIC_SPEECH]' }
  targetPath = $target
  targetBytes = (Get-Item $target).Length
  targetChanged = ((Get-Item $target).Length -gt 0)
  clipboardRestored = ($clipboard -eq $sentinel)
  beforeLatestWav = if ($beforeLatest) { $beforeLatest.FullName } else { $null }
  afterLatestWav = if ($afterLatest) { $afterLatest.FullName } else { $null }
  freshWavCreated = ($afterLatest -and ((-not $beforeLatest) -or ($afterLatest.FullName -ne $beforeLatest.FullName) -or ($afterLatest.LastWriteTime -gt $beforeLatest.LastWriteTime)))
  dictationDockRunning = [bool]$dictation
  dictationDockPid = if ($dictation) { $dictation.Id } else { $null }
  contentPreviewRedacted = if ([string]::IsNullOrWhiteSpace($content)) { '' } else { '[REDACTED_NONEMPTY]' }
  recordedAt = (Get-Date).ToString('o')
}

$result | ConvertTo-Json -Depth 4 | Set-Content -Path $report
$result | ConvertTo-Json -Depth 4
Write-Host "report=$report"
