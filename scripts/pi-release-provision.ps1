param(
  [switch]$ConfirmProduction,
  [switch]$RegisterDeployKey,
  [switch]$EnableReleaseBroker,
  [ValidateRange(1, 5)] [int]$UploadAttempts = 3
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteHost = 'vps'
$remoteStage = "/tmp/fixvox-release-provision-$runId"
$remoteBundle = "/tmp/fixvox-release-provision-$runId.tar.gz"
$localBundle = Join-Path ([IO.Path]::GetTempPath()) "fixvox-release-provision-$runId.tar.gz"
$windowsTar = Join-Path $env:SystemRoot 'System32/tar.exe'
$manifest = @(
  'admin/fixvox-web/pi-release-broker.mjs', 'admin/fixvox-web/pi-release-broker-client.mjs',
  'admin/fixvox-web/pi-release-git-runner.mjs', 'admin/fixvox-web/pi-release-service.mjs',
  'admin/fixvox-web/pi-admin-deploy-broker.mjs', 'admin/fixvox-web/pi-admin-deploy-operations.mjs',
  'admin/fixvox-web/pi-admin-deploy-service.mjs', 'admin/fixvox-web/pi-admin-deploy-client.mjs',
  'admin/fixvox-web/release-recipes.example.json', 'admin/fixvox-web/admin-deploy.example.json',
  'admin/fixvox-web/systemd/fixvox-release-broker.service',
  'admin/fixvox-web/systemd/fixvox-admin-deploy-helper.service'
)

function Invoke-Checked([string]$FilePath, [string[]]$ArgumentList = @()) { & $FilePath @ArgumentList; if ($LASTEXITCODE -ne 0) { throw "Command failed: $FilePath" } }
function Invoke-Remote([string]$Command) { Invoke-Checked 'ssh' @($remoteHost, "set -e; $Command") }
function Get-Sha256([string]$Path) { $s=[IO.File]::OpenRead($Path); try { $h=[Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($h.ComputeHash($s))).Replace('-','').ToLowerInvariant() } finally { $h.Dispose() } } finally { $s.Dispose() } }

foreach ($file in $manifest) { if (-not (Test-Path (Join-Path $repo $file))) { throw "Missing provision file: $file" } }
foreach ($file in ($manifest | Where-Object { $_.EndsWith('.mjs') })) { Invoke-Checked 'node' @('--check', (Join-Path $repo $file)) }
if (-not $ConfirmProduction) {
  Write-Host 'DRY RUN: no users, keys, GitHub settings, services, configs, credentials, or feature flags changed.' -ForegroundColor Cyan
  Write-Host "Register key: $([bool]$RegisterDeployKey); enable broker: $([bool]$EnableReleaseBroker)"
  $manifest | ForEach-Object { Write-Host "  $_" }
  exit 0
}
if ($EnableReleaseBroker -and -not $RegisterDeployKey) { throw '-EnableReleaseBroker requires -RegisterDeployKey during first provisioning.' }

try {
  Invoke-Checked $windowsTar (@('-czf', $localBundle, '-C', $repo) + $manifest)
  $hash = Get-Sha256 $localBundle
  Invoke-Remote "rm -rf '$remoteStage' '$remoteBundle'; mkdir -p '$remoteStage'"
  $uploaded = $false
  for ($attempt=1; $attempt -le $UploadAttempts; $attempt++) { & scp $localBundle "${remoteHost}:$remoteBundle"; if ($LASTEXITCODE -eq 0) { $uploaded=$true; break }; Start-Sleep -Seconds (2*$attempt) }
  if (-not $uploaded) { throw 'Provision bundle upload failed.' }
  Invoke-Remote "echo '$hash  $remoteBundle' | sha256sum -c -; tar -xzf '$remoteBundle' -C '$remoteStage'"
  $register = if ($RegisterDeployKey) { '1' } else { '0' }
  $enable = if ($EnableReleaseBroker) { '1' } else { '0' }
  $remoteScript = @'
set -Eeuo pipefail
stage=$1; run=$2; register=$3; enable=$4
backup=/home/jpsal/.local/state/fixvox-release-provision/$run
mkdir -p "$backup"
sudo tar --ignore-failed-read -czf "$backup/pre-provision.tar.gz" -C / etc/fixvox-release etc/systemd/system/fixvox-release-broker.service etc/systemd/system/fixvox-admin-deploy-helper.service opt/fixvox-agent/runtime 2>/dev/null || true
sudo groupadd --system fixvox-release-broker 2>/dev/null || true
id fixvox-release >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /var/lib/fixvox-release --shell /usr/sbin/nologin fixvox-release
sudo usermod -a -G fixvox-release-broker fixvox-release
sudo usermod -a -G fixvox-release-broker fixvox-agent
sudo usermod -a -G fixvox-workspace fixvox-release
sudo chown -R fixvox-workspace:fixvox-workspace /var/lib/fixvox-workspace/repos/dictation-tauri
sudo find /var/lib/fixvox-workspace/repos/dictation-tauri -type d -exec chmod 0771 {} +
sudo find /var/lib/fixvox-workspace/repos/dictation-tauri -type f -exec chmod 0660 {} +
sudo install -d -o root -g root -m 0755 /opt/fixvox-agent/runtime
for f in pi-release-broker.mjs pi-release-broker-client.mjs pi-release-git-runner.mjs pi-release-service.mjs pi-admin-deploy-broker.mjs pi-admin-deploy-operations.mjs pi-admin-deploy-service.mjs pi-admin-deploy-client.mjs; do
  sudo install -o root -g root -m 0644 "$stage/admin/fixvox-web/$f" "/opt/fixvox-agent/runtime/$f"
done
sudo install -d -o root -g fixvox-release-broker -m 0750 /etc/fixvox-release
sudo install -o root -g fixvox-release-broker -m 0640 "$stage/admin/fixvox-web/release-recipes.example.json" /etc/fixvox-release/release.json
sudo install -o root -g fixvox-release-broker -m 0640 "$stage/admin/fixvox-web/admin-deploy.example.json" /etc/fixvox-release/admin-deploy.json
sudo install -o root -g root -m 0644 "$stage/admin/fixvox-web/systemd/fixvox-release-broker.service" /etc/systemd/system/fixvox-release-broker.service
sudo install -o root -g root -m 0644 "$stage/admin/fixvox-web/systemd/fixvox-admin-deploy-helper.service" /etc/systemd/system/fixvox-admin-deploy-helper.service
sudo install -d -o fixvox-release -g fixvox-release -m 0700 /var/lib/fixvox-release/.ssh /var/lib/fixvox-release/audit
if [[ $register == 1 ]]; then
  key=/var/lib/fixvox-release/.ssh/dictation-tauri
  if [[ ! -f $key ]]; then sudo -u fixvox-release ssh-keygen -q -t ed25519 -N '' -C fixvox-release-dictation -f "$key"; fi
  title=fixvox-release-dictation
  existing=$(gh api repos/jpsala/dictation-tauri/keys --jq ".[] | select(.title == \"$title\") | .id" | head -1)
  if [[ -z $existing ]]; then public=$(sudo cat "$key.pub"); gh api -X POST repos/jpsala/dictation-tauri/keys -f title="$title" -f key="$public" -F read_only=false >/dev/null; fi
  sudo tee /etc/fixvox-release/ssh_config >/dev/null <<CFG
Host github.com
  HostName github.com
  User git
  IdentityFile $key
  IdentitiesOnly yes
  StrictHostKeyChecking yes
CFG
  sudo chown root:fixvox-release-broker /etc/fixvox-release/ssh_config
  sudo chmod 0640 /etc/fixvox-release/ssh_config
fi
sudo systemctl daemon-reload
if [[ $enable == 1 ]]; then
  sudo python3 - <<'PY'
import json
from pathlib import Path
p=Path('/etc/fixvox-release/release.json'); o=json.loads(p.read_text()); o['recipes']['fixvox-admin-vps']['enabled']=True; p.write_text(json.dumps(o,separators=(',',':'))+'\n')
PY
  python3 - <<'PY'
from pathlib import Path
p=Path.home()/'.config/dictation-tauri/admin-web.env'; lines=p.read_text().splitlines(); updates={'PI_CHAT_RELEASE_BROKER_ENABLED':'1','PI_CHAT_RELEASE_BROKER_SOCKET':'/run/fixvox-release/release.sock'}; out=[]; seen=set()
for line in lines:
 k=line.split('=',1)[0] if '=' in line else ''
 if k in updates: out.append(f'{k}={updates[k]}'); seen.add(k)
 else: out.append(line)
for k,v in updates.items():
 if k not in seen: out.append(f'{k}={v}')
p.write_text('\n'.join(out)+'\n')
PY
  sudo systemctl enable --now fixvox-admin-deploy-helper.service fixvox-release-broker.service
  systemctl --user restart fixvox-admin-web.service
else
  sudo systemctl disable fixvox-admin-deploy-helper.service fixvox-release-broker.service >/dev/null 2>&1 || true
fi
printf 'run=%s key=%s enabled=%s status=ok\n' "$run" "$register" "$enable" > "$backup/receipt.txt"
'@
  $scriptPath = Join-Path ([IO.Path]::GetTempPath()) "fixvox-release-provision-$runId.sh"
  [IO.File]::WriteAllText($scriptPath, $remoteScript.Replace("`r`n","`n"), [Text.UTF8Encoding]::new($false))
  try { Invoke-Checked 'scp' @($scriptPath, "${remoteHost}:$remoteStage/provision.sh"); Invoke-Remote "bash '$remoteStage/provision.sh' '$remoteStage' '$runId' '$register' '$enable'" }
  finally { Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue }
  Write-Host "Release provisioning complete. Run: $runId; key: $RegisterDeployKey; enabled: $EnableReleaseBroker" -ForegroundColor Green
} finally {
  Remove-Item $localBundle -Force -ErrorAction SilentlyContinue
  try { Invoke-Remote "rm -rf '$remoteStage' '$remoteBundle'" } catch { }
}
