$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$canonical = Join-Path $repoRoot "docs\skills"
$compat = Join-Path $repoRoot ".agents\skills"
$agentsDir = Join-Path $repoRoot ".agents"
$ensureScript = Join-Path $PSScriptRoot "ensure-skills-link.ps1"

$action = if ($args.Count -gt 0) { $args[0].ToLowerInvariant() } else { "status" }

function Get-SkillsLinkStatus {
  if (-not (Test-Path -LiteralPath $compat)) {
    return [pscustomobject]@{ State = "disabled"; Detail = ".agents/skills does not exist" }
  }

  $item = Get-Item -LiteralPath $compat -Force
  $isLink = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0

  if (-not $isLink) {
    return [pscustomobject]@{ State = "unsafe-real-directory"; Detail = ".agents/skills is a real directory; refusing to treat it as a toggle" }
  }

  $target = $item.Target
  if (-not $target) {
    return [pscustomobject]@{ State = "unsafe-link"; Detail = ".agents/skills is a reparse point without a readable target" }
  }

  try {
    $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
    $resolvedCanonical = (Resolve-Path -LiteralPath $canonical).Path
    if ($resolvedTarget -eq $resolvedCanonical) {
      return [pscustomobject]@{ State = "enabled"; Detail = ".agents/skills -> $resolvedTarget" }
    }

    return [pscustomobject]@{ State = "unsafe-link"; Detail = ".agents/skills points to $resolvedTarget, expected $resolvedCanonical" }
  } catch {
    return [pscustomobject]@{ State = "unsafe-link"; Detail = ".agents/skills target cannot be resolved: $target" }
  }
}

function Disable-SkillsLink {
  $status = Get-SkillsLinkStatus
  if ($status.State -eq "disabled") {
    Write-Output "OK: skills discovery already disabled ($($status.Detail))"
    return
  }

  if ($status.State -ne "enabled") {
    throw "Refusing to disable skills discovery: $($status.State). $($status.Detail)"
  }

  [System.IO.Directory]::Delete($compat, $false)
  Write-Output "DISABLED: removed .agents/skills junction. Canonical docs/skills was not touched. Run /reload in Pi if needed."
}

function Enable-SkillsLink {
  & powershell -ExecutionPolicy Bypass -File $ensureScript
}

switch ($action) {
  "status" {
    $status = Get-SkillsLinkStatus
    Write-Output "$($status.State): $($status.Detail)"
  }
  "on" { Enable-SkillsLink }
  "enable" { Enable-SkillsLink }
  "off" { Disable-SkillsLink }
  "disable" { Disable-SkillsLink }
  "toggle" {
    $status = Get-SkillsLinkStatus
    if ($status.State -eq "enabled") {
      Disable-SkillsLink
    } elseif ($status.State -eq "disabled") {
      Enable-SkillsLink
    } else {
      throw "Refusing to toggle skills discovery: $($status.State). $($status.Detail)"
    }
  }
  default {
    throw "Unknown action '$action'. Use: status | on | off | toggle"
  }
}
