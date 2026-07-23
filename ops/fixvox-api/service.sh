#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f3 "$@"
require_no_args
assert_runtime_contract
template="$SCRIPT_DIR/templates/fixvox-api.service"
[[ -f "$template" ]] || fail "service template is missing"
note "fixvox-api service: mode=$MODE unit=$FIXVOX_UNIT_FILE"
if [[ "$MODE" == "dry-run" ]]; then
  note "steps: verify protected env/current -> install unit and wrappers -> systemd verify -> daemon-reload -> enable --now"
  exit 0
fi

require_target_host
[[ -L "$FIXVOX_CURRENT" ]] || fail "current must be a release symlink"
current_target="$(readlink -f "$FIXVOX_CURRENT")"
require_under "$current_target" "$FIXVOX_RELEASES" "current target"
[[ -f "$current_target/cloud/fixvox-api/src/main.ts" ]] || fail "current release has no API entry point"
[[ -f "$FIXVOX_ENV_FILE" && "$(stat -c '%a' "$FIXVOX_ENV_FILE")" == "600" ]] || fail "protected env must exist with mode 0600"
if ss -H -ltn "sport = :$FIXVOX_PORT" | grep -q .; then
  fail "port $FIXVOX_PORT is occupied before service start"
fi
install -m 0644 "$template" "$FIXVOX_UNIT_FILE"
install -m 0755 "$SCRIPT_DIR/health.sh" "$FIXVOX_BIN_DIR/fixvox-api-health"
install -m 0644 "$SCRIPT_DIR/lib.sh" "$FIXVOX_BIN_DIR/fixvox-api-lib.sh"
systemd-analyze --user verify "$FIXVOX_UNIT_FILE"
systemctl --user daemon-reload
systemctl --user enable --now fixvox-api.service
note "service=started bind=$FIXVOX_HOST:$FIXVOX_PORT"
