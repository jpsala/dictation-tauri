$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$bundleDir = Join-Path $repoRoot 'src-tauri/target/release/bundle/nsis'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Script
  )

  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Script
}

try {
  Push-Location $repoRoot

  Invoke-Step 'Run focused product checks' {
    & npm.cmd run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control
    if ($LASTEXITCODE -ne 0) { throw "Product checks failed with exit code $LASTEXITCODE" }
  }

  Invoke-Step 'Build frontend' {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
  }

  Invoke-Step 'Check Rust formatting and compile' {
    Push-Location (Join-Path $repoRoot 'src-tauri')
    try {
      & cargo fmt --check
      if ($LASTEXITCODE -ne 0) { throw "Rust formatting check failed with exit code $LASTEXITCODE" }

      & cargo check
      if ($LASTEXITCODE -ne 0) { throw "Rust compile check failed with exit code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }

  Invoke-Step 'Build unsigned local NSIS installer' {
    if (Test-Path $bundleDir) {
      Get-ChildItem -Path $bundleDir -Filter '*.exe' -File | Remove-Item -Force
    }

    & npx.cmd tauri build --bundles nsis --ci --no-sign
    if ($LASTEXITCODE -ne 0) { throw "Tauri installer build failed with exit code $LASTEXITCODE" }
  }

  $installers = @()
  if (Test-Path $bundleDir) {
    $installers = @(Get-ChildItem -Path $bundleDir -Filter '*.exe' -File | Sort-Object LastWriteTime -Descending)
  }

  if ($installers.Count -eq 0) {
    throw "No NSIS installer was generated under target/release/bundle/nsis"
  }

  Write-Host "`nGenerated local Windows installer(s):" -ForegroundColor Green
  foreach ($installer in $installers) {
    $relativePath = Resolve-Path -Relative $installer.FullName
    Write-Host " - $relativePath"
  }

  Write-Host "`nLocal build only: this script does not publish, upload, deploy, or touch release secrets." -ForegroundColor Yellow
} finally {
  Pop-Location
}
