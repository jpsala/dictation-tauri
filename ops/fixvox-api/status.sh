#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f4 "$@"
require_no_args
assert_runtime_contract
note "fixvox-api status: mode=$MODE service=fixvox-api.service bind=$FIXVOX_HOST:$FIXVOX_PORT"
if [[ "$MODE" == "dry-run" ]]; then
  note "read-only check: enabled/active user service and exactly one loopback listener"
  exit 0
fi

require_target_host
active="$(systemctl --user is-active fixvox-api.service)"
enabled="$(systemctl --user is-enabled fixvox-api.service)"
[[ "$active" == "active" ]] || fail "fixvox-api.service is not active"
[[ "$enabled" == "enabled" ]] || fail "fixvox-api.service is not enabled"
listeners="$(ss -H -ltn "sport = :$FIXVOX_PORT")"
count="$(printf '%s\n' "$listeners" | sed '/^$/d' | wc -l)"
[[ "$count" -eq 1 ]] || fail "expected exactly one API listener"
printf '%s\n' "$listeners" | grep -Eq '127\.0\.0\.1:8790([^0-9]|$)' || fail "API listener is not IPv4 loopback:8790"
if printf '%s\n' "$listeners" | grep -Eq '0\.0\.0\.0:8790|\[::\]:8790'; then
  fail "public API listener detected"
fi
printf 'service_active=%s service_enabled=%s listener=127.0.0.1:8790\n' "$active" "$enabled"
