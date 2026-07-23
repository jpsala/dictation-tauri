#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f4 "$@"
require_no_args
assert_runtime_contract
note "fixvox-api logs: mode=$MODE source=fixvox-api.service lines=100 allowlist=requestId,route,method,status,durationMs,code"
if [[ "$MODE" == "dry-run" ]]; then
  note "read-only check: journal output is projected through the structured-log allowlist"
  exit 0
fi

require_target_host
journalctl --user -u fixvox-api.service -n 100 --no-pager -o cat \
  | "$FIXVOX_BUN" -e '
    const allowed = ["requestId", "route", "method", "status", "durationMs", "code"];
    for (const line of (await Bun.stdin.text()).split(/\r?\n/)) {
      try {
        const source = JSON.parse(line);
        if (!source || typeof source !== "object" || typeof source.requestId !== "string" || typeof source.route !== "string") continue;
        const safe = Object.fromEntries(allowed.filter((key) => key in source).map((key) => [key, source[key]]));
        console.log(JSON.stringify(safe));
      } catch {}
    }
  '
