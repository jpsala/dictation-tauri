param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cloud = Join-Path $repo 'cloud/fixvox-proxy'
Set-Location $cloud

$localWrangler = Join-Path $cloud 'node_modules/.bin/wrangler.cmd'
if (Test-Path $localWrangler) {
  & $localWrangler deploy
  exit $LASTEXITCODE
}

# First-run fallback: deploys from this repo without requiring copied node_modules.
# This command may download the pinned Wrangler package into npm's cache.
npx --yes wrangler@4.74.0 deploy
exit $LASTEXITCODE
