#!/usr/bin/env bash
set -Eeuo pipefail

STAGE=${1:?stage required}
RUN_ID=${2:?run id required}
SYNC_MIRRORS=${3:-0}
BACKUP_ROOT="/home/jpsal/.local/state/fixvox-agent-rollouts/$RUN_ID"
OPT_ROOT=/opt/fixvox-agent
MIRROR_ROOT=/var/lib/fixvox-workspace/repos
RUNTIME_FILES=(
  pi-chat-access.mjs
  pi-remote-policy.mjs
  pi-remote-agent-core.mjs
  pi-remote-agent-extension.mjs
  pi-workspace-broker-client.mjs
  pi-workspace-broker.mjs
  constelaciones-read-adapter.mjs
  constelaciones-read-broker.mjs
)
REPOS=(dictation-tauri constelaciones)
SWAPPED=()
RUNTIME_APPLIED=0

restore_runtime() {
  [[ $RUNTIME_APPLIED == 1 ]] || return 0
  sudo rm -rf "$OPT_ROOT/runtime"
  sudo mkdir -p "$OPT_ROOT/runtime"
  sudo tar -xzf "$BACKUP_ROOT/runtime-and-units.tar.gz" -C /
  sudo systemctl daemon-reload
}

rollback() {
  local code=$?
  trap - ERR
  for repo in "${SWAPPED[@]}"; do
    sudo rm -rf "$MIRROR_ROOT/$repo"
    sudo mv "$MIRROR_ROOT/.backup-$RUN_ID-$repo" "$MIRROR_ROOT/$repo" || true
  done
  restore_runtime || true
  sudo systemctl restart fixvox-workspace-broker.service fixvox-constelaciones-read-broker.service || true
  systemctl --user restart fixvox-admin-web.service || true
  exit "$code"
}
trap rollback ERR

mkdir -p "$BACKUP_ROOT"
sudo tar -czf "$BACKUP_ROOT/runtime-and-units.tar.gz" -C / \
  opt/fixvox-agent/runtime opt/fixvox-agent/run-pi.sh \
  etc/systemd/system/fixvox-workspace-broker.service \
  etc/systemd/system/fixvox-constelaciones-read-broker.service

for file in "${RUNTIME_FILES[@]}"; do
  node --check "$STAGE/admin/fixvox-web/$file"
done

if [[ $SYNC_MIRRORS == 1 ]]; then
  for repo in "${REPOS[@]}"; do
    sudo -u fixvox-workspace git -C "$MIRROR_ROOT/$repo" diff --quiet
    sudo -u fixvox-workspace git -C "$MIRROR_ROOT/$repo" diff --cached --quiet
    test -z "$(sudo -u fixvox-workspace git -C "$MIRROR_ROOT/$repo" ls-files --others --exclude-standard)"
    origin=$(git -C "/home/jpsal/dev/$repo" remote get-url origin)
    rm -rf "/tmp/fixvox-agent-$RUN_ID-$repo"
    git clone --depth 1 --branch main "$origin" "/tmp/fixvox-agent-$RUN_ID-$repo"
    if git -C "/tmp/fixvox-agent-$RUN_ID-$repo" ls-files \
      | grep -Ei '(^|/)(\.env($|\.)|auth\.json$|credentials?($|\.)|sessions?/|private-exports?/|[^/]+\.(sqlite|sqlite3|db)$)' \
      | grep -Eiv '\.env\.(example|sample|template)$' | grep -q .; then
      echo "Tracked sensitive path rejected in $repo" >&2
      exit 1
    fi
    git -C "/tmp/fixvox-agent-$RUN_ID-$repo" rev-parse HEAD > "$BACKUP_ROOT/$repo.candidate-commit"
    sudo rm -rf "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
    sudo mv "/tmp/fixvox-agent-$RUN_ID-$repo" "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
    sudo chown -R fixvox-workspace:fixvox-agent-broker "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
    sudo find "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" -type d -exec chmod 0711 {} +
    sudo find "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" -type f -exec chmod 0600 {} +
  done
fi

sudo install -d -o root -g root -m 0755 "$OPT_ROOT/runtime"
for file in "${RUNTIME_FILES[@]}"; do
  sudo install -o root -g root -m 0644 "$STAGE/admin/fixvox-web/$file" "$OPT_ROOT/runtime/$file"
done
sudo install -o root -g root -m 0755 "$STAGE/admin/fixvox-web/run-isolated-pi.sh" "$OPT_ROOT/run-pi.sh"
sudo install -o root -g root -m 0644 "$STAGE/admin/fixvox-web/systemd/fixvox-workspace-broker.service" /etc/systemd/system/fixvox-workspace-broker.service
sudo install -o root -g root -m 0644 "$STAGE/admin/fixvox-web/systemd/fixvox-constelaciones-read-broker.service" /etc/systemd/system/fixvox-constelaciones-read-broker.service
RUNTIME_APPLIED=1
sudo systemctl daemon-reload

if [[ $SYNC_MIRRORS == 1 ]]; then
  systemctl --user stop fixvox-admin-web.service
  sudo systemctl stop fixvox-workspace-broker.service
  for repo in "${REPOS[@]}"; do
    sudo mv "$MIRROR_ROOT/$repo" "$MIRROR_ROOT/.backup-$RUN_ID-$repo"
    sudo mv "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" "$MIRROR_ROOT/$repo"
    SWAPPED+=("$repo")
  done
fi

sudo systemctl restart fixvox-workspace-broker.service fixvox-constelaciones-read-broker.service
systemctl --user restart fixvox-admin-web.service
sleep 1
sudo systemctl is-active --quiet fixvox-workspace-broker.service
sudo systemctl is-active --quiet fixvox-constelaciones-read-broker.service
systemctl --user is-active --quiet fixvox-admin-web.service
sudo test "$(sudo stat -c %a /run/fixvox-agent/workspace-broker.sock)" = 660
sudo test "$(sudo stat -c %a /run/fixvox-agent/constelaciones-read.sock)" = 660
if sudo -u fixvox-agent test -r "$MIRROR_ROOT/dictation-tauri/package.json"; then
  echo 'Provider user can read workspace directly' >&2
  exit 1
fi
if sudo -u fixvox-workspace test -r /var/lib/fixvox-agent/.pi/agent/auth.json; then
  echo 'Workspace user can read provider auth' >&2
  exit 1
fi
sudo -u fixvox-agent env PI_CHAT_WORKSPACE_BROKER_SOCKET=/run/fixvox-agent/workspace-broker.sock \
  node --input-type=module -e "import {createBrokerOperations} from '$OPT_ROOT/runtime/pi-workspace-broker-client.mjs'; const o=createBrokerOperations(process.env.PI_CHAT_WORKSPACE_BROKER_SOCKET); const b=await o.read.readFile('$MIRROR_ROOT/dictation-tauri/package.json'); if(!b.length) process.exit(1)"
curl -fsS http://127.0.0.1:8787/healthz >/dev/null
curl -fsS https://fixvox.jpsala.dev/healthz >/dev/null

for repo in "${SWAPPED[@]}"; do
  sudo install -d -o root -g root -m 0700 "/var/lib/fixvox-workspace/rollout-backups/$RUN_ID"
  sudo mv "$MIRROR_ROOT/.backup-$RUN_ID-$repo" "/var/lib/fixvox-workspace/rollout-backups/$RUN_ID/$repo"
done
printf 'rollout=%s sync=%s status=ok\n' "$RUN_ID" "$SYNC_MIRRORS" > "$BACKUP_ROOT/receipt.txt"
trap - ERR
