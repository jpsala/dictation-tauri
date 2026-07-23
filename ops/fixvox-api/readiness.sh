#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f4 "$@"
require_no_args
assert_runtime_contract
note "fixvox-api readiness: mode=$MODE endpoint=http://127.0.0.1:8790/ready"
if [[ "$MODE" == "dry-run" ]]; then
  note "read-only check: database/schema/jobs and cloudflare-authority readiness"
  exit 0
fi

require_target_host
ready="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8790/ready)"
[[ "$ready" == *'"ok":true'* && "$ready" == *'"authorityMode":"cloudflare-authority"'* ]] || fail "readiness or authority contract mismatch"
printf '%s\n' "$ready"
note "readiness=ok authority=cloudflare-authority"
