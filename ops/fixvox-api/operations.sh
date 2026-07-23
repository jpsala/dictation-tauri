#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f4 "$@"
require_no_args
assert_runtime_contract
for template in \
  "$SCRIPT_DIR/templates/fixvox-api-maintenance.service" \
  "$SCRIPT_DIR/templates/fixvox-api-maintenance.timer" \
  "$SCRIPT_DIR/templates/fixvox-api-backup.service" \
  "$SCRIPT_DIR/templates/fixvox-api-backup.timer"; do
  [[ -f "$template" ]] || fail "F4 systemd template is missing: $template"
done
note "fixvox-api operations: mode=$MODE wrappers=$FIXVOX_BIN_DIR units=$FIXVOX_UNIT_DIR"
if [[ "$MODE" == "dry-run" ]]; then
  note "steps: install health/readiness/status/logs/maintenance/backup wrappers; verify units; daemon-reload; enable/start jittered timers"
  exit 0
fi

require_target_host
[[ -d "$FIXVOX_BIN_DIR" && "$(stat -c '%U' "$FIXVOX_BIN_DIR")" == "$FIXVOX_OWNER" ]] || fail "wrapper directory has an unexpected owner"
[[ -d "$FIXVOX_UNIT_DIR" && "$(stat -c '%U' "$FIXVOX_UNIT_DIR")" == "$FIXVOX_OWNER" ]] || fail "systemd user directory has an unexpected owner"
[[ -f "$FIXVOX_ENV_FILE" && "$(stat -c '%a' "$FIXVOX_ENV_FILE")" == "600" ]] || fail "protected env must exist with mode 0600"
[[ -d "$FIXVOX_BACKUP_DIR" && "$(stat -c '%a' "$FIXVOX_BACKUP_DIR")" == "700" ]] || fail "backup directory must be mode 0700"

install -m 0644 "$SCRIPT_DIR/lib.sh" "$FIXVOX_BIN_DIR/fixvox-api-lib.sh"
install -m 0755 "$SCRIPT_DIR/health-f4.sh" "$FIXVOX_BIN_DIR/fixvox-api-health"
install -m 0755 "$SCRIPT_DIR/readiness.sh" "$FIXVOX_BIN_DIR/fixvox-api-readiness"
install -m 0755 "$SCRIPT_DIR/status.sh" "$FIXVOX_BIN_DIR/fixvox-api-status"
install -m 0755 "$SCRIPT_DIR/logs.sh" "$FIXVOX_BIN_DIR/fixvox-api-logs"
install -m 0755 "$SCRIPT_DIR/maintenance.sh" "$FIXVOX_BIN_DIR/fixvox-api-maintenance"
install -m 0755 "$SCRIPT_DIR/backup.sh" "$FIXVOX_BIN_DIR/fixvox-api-backup"
install -m 0644 "$SCRIPT_DIR/templates/fixvox-api-maintenance.service" "$FIXVOX_UNIT_DIR/fixvox-api-maintenance.service"
install -m 0644 "$SCRIPT_DIR/templates/fixvox-api-maintenance.timer" "$FIXVOX_UNIT_DIR/fixvox-api-maintenance.timer"
install -m 0644 "$SCRIPT_DIR/templates/fixvox-api-backup.service" "$FIXVOX_UNIT_DIR/fixvox-api-backup.service"
install -m 0644 "$SCRIPT_DIR/templates/fixvox-api-backup.timer" "$FIXVOX_UNIT_DIR/fixvox-api-backup.timer"
for unit in \
  "$FIXVOX_UNIT_DIR/fixvox-api-maintenance.service" \
  "$FIXVOX_UNIT_DIR/fixvox-api-maintenance.timer" \
  "$FIXVOX_UNIT_DIR/fixvox-api-backup.service" \
  "$FIXVOX_UNIT_DIR/fixvox-api-backup.timer"; do
  systemd-analyze --user verify "$unit"
done
systemctl --user daemon-reload
systemctl --user enable --now fixvox-api-maintenance.timer fixvox-api-backup.timer
note "operations=installed timers=enabled"
