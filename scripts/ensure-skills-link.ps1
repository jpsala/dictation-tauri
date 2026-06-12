$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$canonical = Join-Path $repoRoot "docs\\skills"
$compat = Join-Path $repoRoot ".agents\\skills"
$agentsDir = Join-Path $repoRoot ".agents"

function Copy-MissingChildren($source, $destination) {
  if (-not (Test-Path $source)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $destination | Out-Null

  foreach ($child in Get-ChildItem -LiteralPath $source -Force) {
    $target = Join-Path $destination $child.Name
    if (Test-Path $target) {
      Write-Warning "Preserved existing canonical skill item, backup still has: $($child.FullName)"
      continue
    }

    Copy-Item -LiteralPath $child.FullName -Destination $target -Recurse -Force
    Write-Output "MERGED: $($child.Name) -> docs/skills"
  }
}

if (-not (Test-Path $agentsDir)) {
  New-Item -ItemType Directory -Path $agentsDir | Out-Null
}

if (Test-Path $compat) {
  $item = Get-Item $compat -Force
  $isLink = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  $target = $item.Target

  if ($isLink -and $target) {
    $resolvedTarget = (Resolve-Path $target).Path
    $resolvedCanonical = (Resolve-Path $canonical).Path
    if ($resolvedTarget -eq $resolvedCanonical) {
      Write-Output "OK: .agents/skills -> $resolvedTarget"
      exit 0
    }
  }

  if ($isLink) {
    throw ".agents/skills is a reparse point but does not resolve to docs/skills. Repair it manually before continuing."
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = Join-Path $agentsDir "skills.backup-$stamp"
  Move-Item -LiteralPath $compat -Destination $backup
  Write-Warning "Moved real .agents/skills directory to $backup before creating junction."

  if (-not (Test-Path $canonical)) {
    New-Item -ItemType Directory -Force -Path $canonical | Out-Null
    Write-Output "CREATED: docs/skills"
  }

  Copy-MissingChildren -source $backup -destination $canonical
}

if (-not (Test-Path $canonical)) {
  New-Item -ItemType Directory -Force -Path $canonical | Out-Null
  Write-Output "CREATED: docs/skills"
}

New-Item -ItemType Junction -Path $compat -Target (Resolve-Path $canonical) | Out-Null
Write-Output "CREATED: .agents/skills -> $canonical"
