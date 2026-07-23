#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

section="all"
init_args f3 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --section) ((++i < ${#args[@]})) || fail "--section needs a value"; section="${args[$i]}" ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done
[[ "$section" =~ ^(all|status|health|ready|logs)$ ]] || fail "section must be all, status, health, ready, or logs"
assert_runtime_contract
note "fixvox-api health: mode=$MODE section=$section endpoint=http://127.0.0.1:8790"
if [[ "$MODE" == "dry-run" ]]; then
  note "checks: user unit, single loopback listener, /health, /ready cloudflare-authority, allowlisted structured logs"
  exit 0
fi

require_target_host
if [[ "$section" == "all" || "$section" == "status" ]]; then
  systemctl --user status fixvox-api.service --no-pager
  listeners="$(ss -H -ltn "sport = :$FIXVOX_PORT")"
  [[ "$(printf '%s\n' "$listeners" | sed '/^$/d' | wc -l)" -eq 1 ]] || fail "expected exactly one listener"
  printf '%s\n' "$listeners" | grep -Eq '127\.0\.0\.1:8790([^0-9]|$)' || fail "listener is not IPv4 loopback:8790"
  if printf '%s\n' "$listeners" | grep -Eq '0\.0\.0\.0:8790|\[::\]:8790'; then
    fail "public listener detected"
  fi
fi
if [[ "$section" == "all" || "$section" == "health" ]]; then
  health="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8790/health)"
  [[ "$health" == *'"ok":true'* && "$health" == *'"service":"fixvox-api"'* ]] || fail "health contract mismatch"
  printf '%s\n' "$health"
fi
if [[ "$section" == "all" || "$section" == "ready" ]]; then
  ready="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8790/ready)"
  [[ "$ready" == *'"ok":true'* && "$ready" == *'"authorityMode":"cloudflare-authority"'* ]] || fail "readiness or authority contract mismatch"
  printf '%s\n' "$ready"
fi
if [[ "$section" == "all" || "$section" == "logs" ]]; then
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
fi
