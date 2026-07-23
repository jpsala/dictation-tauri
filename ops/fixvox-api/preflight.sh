#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

init_args f2 "$@"
require_no_args
assert_runtime_contract
note "fixvox-api preflight: mode=$MODE host=$FIXVOX_EXPECTED_HOST owner=$FIXVOX_OWNER bind=$FIXVOX_HOST:$FIXVOX_PORT"
if [[ "$MODE" == "dry-run" ]]; then
  note "read-only checks: Ubuntu 24.04, Bun path, memory/disk thresholds, port 8790, dedicated paths, apt candidates"
  note "excluded surfaces: Docker, Coolify, Zulip, remote checkout"
  exit 0
fi

require_target_host
# shellcheck source=/etc/os-release disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || fail "expected Ubuntu 24.04"
[[ -x "$FIXVOX_BUN" ]] || fail "Bun runtime is missing at the approved path"
mem_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
disk_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
[[ "$mem_kib" =~ ^[0-9]+$ && "$mem_kib" -ge "$FIXVOX_MIN_MEM_KIB" ]] || fail "available memory is below 1 GiB"
[[ "$disk_kib" =~ ^[0-9]+$ && "$disk_kib" -ge "$FIXVOX_MIN_DISK_KIB" ]] || fail "free root disk is below 1 GiB"
if ss -H -ltn "sport = :$FIXVOX_PORT" | grep -q .; then
  fail "port $FIXVOX_PORT is already occupied"
fi
for path in "$FIXVOX_ROOT" "$FIXVOX_CONFIG_DIR" "$FIXVOX_BACKUP_DIR"; do
  if [[ -e "$path" ]]; then
    [[ "$(stat -c '%U' "$path")" == "$FIXVOX_OWNER" ]] || fail "existing approved path has a different owner: $path"
  fi
done
for package in postgresql-16 postgresql-client-16 age; do
  apt-cache show "$package" >/dev/null 2>&1 || fail "required apt candidate is unavailable: $package"
done
note "preflight=ok memory_kib=$mem_kib disk_kib=$disk_kib port=$FIXVOX_PORT"
