#!/usr/bin/env bash
set -Eeuo pipefail

STAGE=${1:?stage required}
RUN_ID=${2:?run id required}
SYNC_MIRRORS=${3:-0}
BACKUP_ROOT="/home/jpsal/.local/state/fixvox-agent-rollouts/$RUN_ID"
OPT_ROOT=/opt/fixvox-agent
MIRROR_ROOT=/var/lib/fixvox-workspace/repos
RUNTIME_FILES=(
  omp-chat-access.mjs
  omp-remote-policy.mjs
  omp-host-tools.mjs
  omp-rpc-framing.mjs
  omp-workspace-broker-client.mjs
  omp-workspace-broker.mjs
  constelaciones-read-adapter.mjs
  constelaciones-read-broker.mjs
  omp-release-broker.mjs
  omp-release-broker-client.mjs
  omp-release-git-runner.mjs
  omp-release-service.mjs
  omp-admin-deploy-broker.mjs
  omp-admin-deploy-operations.mjs
  omp-admin-deploy-service.mjs
  omp-admin-deploy-client.mjs
)
REPOS=(dictation-tauri constelaciones)
SWAPPED=()
RUNTIME_APPLIED=0
RELEASE_WAS_ACTIVE=0
ADMIN_HELPER_WAS_ACTIVE=0

verify_health() {
  sudo systemctl is-active --quiet fixvox-workspace-broker.service || return 1
  sudo systemctl is-active --quiet fixvox-constelaciones-read-broker.service || return 1
  systemctl --user is-active --quiet fixvox-admin-web.service || return 1
  if [[ $RELEASE_WAS_ACTIVE == 1 ]]; then sudo systemctl is-active --quiet fixvox-release-broker.service || return 1; fi
  if [[ $ADMIN_HELPER_WAS_ACTIVE == 1 ]]; then sudo systemctl is-active --quiet fixvox-admin-deploy-helper.service || return 1; fi
  sudo test "$(sudo stat -c %a /run/fixvox-agent/workspace-broker.sock)" = 660 || return 1
  sudo test "$(sudo stat -c %a /run/fixvox-agent/constelaciones-read.sock)" = 660 || return 1
  curl -fsS http://127.0.0.1:8787/healthz >/dev/null || return 1
  curl -fsS https://fixvox.jpsala.dev/healthz >/dev/null || return 1
}

restore_runtime() {
  [[ $RUNTIME_APPLIED == 1 ]] || return 0
  sha256sum -c "$BACKUP_ROOT/runtime-and-units.tar.gz.sha256" || return 1
  sudo rm -rf "$OPT_ROOT/runtime" || return 1
  sudo mkdir -p "$OPT_ROOT/runtime" || return 1
  sudo tar -xzf "$BACKUP_ROOT/runtime-and-units.tar.gz" -C / || return 1
  sudo tar -dzf "$BACKUP_ROOT/runtime-and-units.tar.gz" -C / || return 1
  sudo systemctl daemon-reload || return 1
}

rollback() {
  local original_code=$?
  local rollback_failed=0
  local repo backup failed current_moved
  trap - ERR
  set +e
  for repo in "${SWAPPED[@]}"; do
    backup="$MIRROR_ROOT/.backup-$RUN_ID-$repo"
    failed="$MIRROR_ROOT/.failed-$RUN_ID-$repo"
    if ! sudo test -d "$backup"; then
      echo "Rollback backup missing for $repo" >&2
      rollback_failed=1
      continue
    fi
    if ! sudo rm -rf "$failed"; then rollback_failed=1; continue; fi
    current_moved=0
    if sudo test -e "$MIRROR_ROOT/$repo"; then
      if ! sudo mv "$MIRROR_ROOT/$repo" "$failed"; then rollback_failed=1; continue; fi
      current_moved=1
    fi
    if ! sudo mv "$backup" "$MIRROR_ROOT/$repo"; then
      echo "Rollback restore rename failed for $repo" >&2
      rollback_failed=1
      if [[ $current_moved == 1 ]] && ! sudo mv "$failed" "$MIRROR_ROOT/$repo"; then
        echo "Rollback recovery rename also failed for $repo" >&2
      fi
      continue
    fi
    if ! sudo -u fixvox-workspace test "$(sudo -u fixvox-workspace git -C "$MIRROR_ROOT/$repo" rev-parse HEAD)" = "$(cat "$BACKUP_ROOT/$repo.previous-commit")"; then
      echo "Rollback commit verification failed for $repo" >&2
      rollback_failed=1
    fi
    if [[ $current_moved == 1 ]] && ! sudo rm -rf "$failed"; then rollback_failed=1; fi
  done
  if ! restore_runtime; then
    echo 'Runtime rollback restore or archive verification failed' >&2
    rollback_failed=1
  fi
  if ! sudo systemctl restart fixvox-workspace-broker.service fixvox-constelaciones-read-broker.service; then rollback_failed=1; fi
  if [[ $RELEASE_WAS_ACTIVE == 1 ]] && ! sudo systemctl restart fixvox-release-broker.service; then rollback_failed=1; fi
  if [[ $ADMIN_HELPER_WAS_ACTIVE == 1 ]] && ! sudo systemctl restart fixvox-admin-deploy-helper.service; then rollback_failed=1; fi
  if ! systemctl --user restart fixvox-admin-web.service; then rollback_failed=1; fi
  if ! verify_health; then
    echo 'Rollback health verification failed' >&2
    rollback_failed=1
  fi
  if [[ $rollback_failed != 0 ]]; then
    echo "Rollout failed with status $original_code and rollback was not verified" >&2
    exit 70
  fi
  echo "Rollout failed with status $original_code; rollback restored and verified" >&2
  exit "$original_code"
}
trap rollback ERR

mkdir -p "$BACKUP_ROOT"
sudo tar -czf "$BACKUP_ROOT/runtime-and-units.tar.gz" -C / \
  opt/fixvox-agent/runtime \
  etc/systemd/system/fixvox-workspace-broker.service \
  etc/systemd/system/fixvox-constelaciones-read-broker.service \
  etc/systemd/system/fixvox-release-broker.service \
  etc/systemd/system/fixvox-admin-deploy-helper.service \
  opt/fixvox-agent/run-omp.sh
sha256sum "$BACKUP_ROOT/runtime-and-units.tar.gz" > "$BACKUP_ROOT/runtime-and-units.tar.gz.sha256"
if sudo systemctl is-active --quiet fixvox-release-broker.service; then RELEASE_WAS_ACTIVE=1; fi
if sudo systemctl is-active --quiet fixvox-admin-deploy-helper.service; then ADMIN_HELPER_WAS_ACTIVE=1; fi

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
      | grep -Ei '(^|/)(\.env($|\.)|[^/]+\.env$|\.dev\.vars($|\.)|\.wrangler(/|$)|auth\.json$|id_(rsa|dsa|ecdsa|ed25519)$|private[-_.]?key($|\.)|[^/]+\.(key|pem|p12|pfx)$|credentials?($|\.)|sessions?/|private-exports?/|[^/]+\.(sqlite|sqlite3|db)$)' \
      | grep -Eiv '\.env\.(example|sample|template)$' | grep -q .; then
      echo "Tracked sensitive path rejected in $repo" >&2
      exit 1
    fi
    git -C "/tmp/fixvox-agent-$RUN_ID-$repo" rev-parse HEAD > "$BACKUP_ROOT/$repo.candidate-commit"
    sudo rm -rf "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
    sudo mv "/tmp/fixvox-agent-$RUN_ID-$repo" "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
    if [[ $repo == dictation-tauri ]] && id fixvox-release >/dev/null 2>&1; then
      sudo chown -R fixvox-workspace:fixvox-workspace "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
      sudo find "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" -type d -exec chmod 0771 {} +
      sudo find "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" -type f -exec chmod 0660 {} +
    else
      sudo chown -R fixvox-workspace:fixvox-agent-broker "$MIRROR_ROOT/.candidate-$RUN_ID-$repo"
      sudo find "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" -type d -exec chmod 0711 {} +
      sudo find "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" -type f -exec chmod 0600 {} +
    fi
  done
fi

RUNTIME_APPLIED=1
sudo install -d -o root -g root -m 0755 "$OPT_ROOT/runtime"
for file in "${RUNTIME_FILES[@]}"; do
  sudo install -o root -g root -m 0644 "$STAGE/admin/fixvox-web/$file" "$OPT_ROOT/runtime/$file"
done
sudo install -o root -g root -m 0755 "$STAGE/admin/fixvox-web/run-isolated-omp.sh" "$OPT_ROOT/run-omp.sh"
for unit in fixvox-workspace-broker.service fixvox-constelaciones-read-broker.service fixvox-release-broker.service fixvox-admin-deploy-helper.service; do
  sudo install -o root -g root -m 0644 "$STAGE/admin/fixvox-web/systemd/$unit" "/etc/systemd/system/$unit"
done
sudo systemctl daemon-reload

if [[ $SYNC_MIRRORS == 1 ]]; then
  systemctl --user stop fixvox-admin-web.service
  sudo systemctl stop fixvox-workspace-broker.service
  if sudo systemctl is-active --quiet fixvox-release-broker.service; then RELEASE_WAS_ACTIVE=1; sudo systemctl stop fixvox-release-broker.service; fi
  for repo in "${REPOS[@]}"; do
    sudo -u fixvox-workspace git -C "$MIRROR_ROOT/$repo" rev-parse HEAD > "$BACKUP_ROOT/$repo.previous-commit"
    sudo mv "$MIRROR_ROOT/$repo" "$MIRROR_ROOT/.backup-$RUN_ID-$repo"
    SWAPPED+=("$repo")
    sudo mv "$MIRROR_ROOT/.candidate-$RUN_ID-$repo" "$MIRROR_ROOT/$repo"
  done
fi

sudo systemctl restart fixvox-workspace-broker.service fixvox-constelaciones-read-broker.service
if [[ $RELEASE_WAS_ACTIVE == 1 ]]; then sudo systemctl restart fixvox-release-broker.service; fi
if [[ $ADMIN_HELPER_WAS_ACTIVE == 1 ]]; then sudo systemctl restart fixvox-admin-deploy-helper.service; fi
systemctl --user restart fixvox-admin-web.service
sleep 1
if sudo -u fixvox-agent test -r "$MIRROR_ROOT/dictation-tauri/package.json"; then
  echo 'Provider user can read workspace directly' >&2
  exit 1
fi
if sudo -u fixvox-workspace test -r /var/lib/fixvox-agent/.omp/agent/auth.json; then
  echo 'Workspace user can read provider auth' >&2
  exit 1
fi
sudo -u fixvox-agent env OMP_CHAT_WORKSPACE_BROKER_SOCKET=/run/fixvox-agent/workspace-broker.sock \
  node --input-type=module -e "import {createBrokerOperations} from '$OPT_ROOT/runtime/omp-workspace-broker-client.mjs'; const o=createBrokerOperations(process.env.OMP_CHAT_WORKSPACE_BROKER_SOCKET); const b=await o.read.readFile('$MIRROR_ROOT/dictation-tauri/package.json'); if(!b.length) process.exit(1)"
verify_health

for repo in "${SWAPPED[@]}"; do
  sudo install -d -o root -g root -m 0700 "/var/lib/fixvox-workspace/rollout-backups/$RUN_ID"
  sudo mv "$MIRROR_ROOT/.backup-$RUN_ID-$repo" "/var/lib/fixvox-workspace/rollout-backups/$RUN_ID/$repo"
done
printf 'rollout=%s sync=%s status=ok\n' "$RUN_ID" "$SYNC_MIRRORS" > "$BACKUP_ROOT/receipt.txt"
trap - ERR
