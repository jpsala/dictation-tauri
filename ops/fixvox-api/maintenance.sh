#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f4 "$@"
require_no_args
assert_runtime_contract
note "fixvox-api maintenance: mode=$MODE lock=$FIXVOX_BACKUP_DIR/.maintenance.lock"
if [[ "$MODE" == "dry-run" ]]; then
  note "pipeline: protected env -> non-overlapping maintenance lock -> provider-free Bun jobs"
  exit 0
fi

require_target_host
load_protected_env
redacted_env_check FIXVOX_DATABASE_URL
[[ -L "$FIXVOX_CURRENT" && -f "$FIXVOX_CURRENT/cloud/fixvox-api/src/run-maintenance.ts" ]] || fail "current release has no maintenance entry point"
[[ -d "$FIXVOX_BACKUP_DIR" && "$(stat -c '%a' "$FIXVOX_BACKUP_DIR")" == "700" ]] || fail "backup directory must be mode 0700"
umask 077
exec 9>"$FIXVOX_BACKUP_DIR/.maintenance.lock"
flock -n 9 || fail "another maintenance run is active"
"$FIXVOX_BUN" run "$FIXVOX_CURRENT/cloud/fixvox-api/src/run-maintenance.ts" >/dev/null
note "maintenance=ok"
