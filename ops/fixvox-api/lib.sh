#!/usr/bin/env bash
set -euo pipefail

# Shared constants are consumed by sourced operation scripts.
# shellcheck disable=SC2034
FIXVOX_OWNER="jpsal"
FIXVOX_HOST="127.0.0.1"
FIXVOX_PORT="8790"
FIXVOX_EXPECTED_HOST="${FIXVOX_EXPECTED_HOST:-srv1761438}"
FIXVOX_BUN="/home/jpsal/.bun/bin/bun"
FIXVOX_ROOT="/home/jpsal/opt/fixvox-api"
FIXVOX_RELEASES="$FIXVOX_ROOT/releases"
FIXVOX_CURRENT="$FIXVOX_ROOT/current"
FIXVOX_STAGING="/home/jpsal/staging/fixvox-api"
FIXVOX_CONFIG_DIR="/home/jpsal/.config/dictation-tauri"
FIXVOX_ENV_FILE="$FIXVOX_CONFIG_DIR/fixvox-api.env"
FIXVOX_PGSERVICE_FILE="$FIXVOX_CONFIG_DIR/fixvox-api.pg_service.conf"
FIXVOX_UNIT_DIR="/home/jpsal/.config/systemd/user"
FIXVOX_UNIT_FILE="$FIXVOX_UNIT_DIR/fixvox-api.service"
FIXVOX_BIN_DIR="/home/jpsal/.local/bin"
FIXVOX_BACKUP_DIR="/home/jpsal/backups/fixvox-api"
FIXVOX_MIN_MEM_KIB="1048576"
FIXVOX_MIN_DISK_KIB="1048576"
export FIXVOX_OWNER FIXVOX_HOST FIXVOX_PORT FIXVOX_EXPECTED_HOST FIXVOX_BUN FIXVOX_ROOT
export FIXVOX_RELEASES FIXVOX_CURRENT FIXVOX_STAGING FIXVOX_CONFIG_DIR FIXVOX_ENV_FILE
export FIXVOX_PGSERVICE_FILE FIXVOX_UNIT_DIR FIXVOX_UNIT_FILE FIXVOX_BIN_DIR FIXVOX_BACKUP_DIR
export FIXVOX_MIN_MEM_KIB FIXVOX_MIN_DISK_KIB

MODE="dry-run"
APPROVED_GATE=""
REMAINING_ARGS=()

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

note() {
  printf '%s\n' "$*"
}

init_args() {
  local expected_gate="$1"
  shift
  MODE="dry-run"
  APPROVED_GATE=""
  REMAINING_ARGS=()
  while (($#)); do
    case "$1" in
      --dry-run) MODE="dry-run" ;;
      --execute) MODE="execute" ;;
      --approved-f1|--approved-f2|--approved-f3|--approved-f4|--approved-f5)
        APPROVED_GATE="${1#--approved-}"
        ;;
      *) REMAINING_ARGS+=("$1") ;;
    esac
    shift
  done
  if [[ "$MODE" == "execute" && "$APPROVED_GATE" != "$expected_gate" ]]; then
    fail "execution requires --execute --approved-${expected_gate}"
  fi
  if [[ -n "$APPROVED_GATE" && "$APPROVED_GATE" != "$expected_gate" ]]; then
    fail "wrong approval gate: expected ${expected_gate}"
  fi
}

require_no_args() {
  ((${#REMAINING_ARGS[@]} == 0)) || fail "unknown arguments: ${REMAINING_ARGS[*]}"
}

require_target_host() {
  [[ "$(id -un)" == "$FIXVOX_OWNER" ]] || fail "must run as ${FIXVOX_OWNER}"
  [[ "$(hostname -s)" == "$FIXVOX_EXPECTED_HOST" ]] || fail "unexpected host"
}

require_linux_absolute() {
  local value="$1" label="$2"
  [[ "$value" == /* ]] || fail "$label must be an absolute Linux path"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "$label contains a newline"
  [[ "$value" != *'/../'* && "$value" != */.. && "$value" != *'/./'* ]] || fail "$label contains traversal"
}

require_under() {
  local value="$1" root="$2" label="$3"
  require_linux_absolute "$value" "$label"
  [[ "$value" == "$root"/* ]] || fail "$label must be under $root"
}

require_safe_name() {
  local value="$1" label="$2"
  [[ "$value" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]] || fail "$label is not allowlisted"
}

print_command() {
  printf '  '
  printf '%q ' "$@"
  printf '\n'
}

run_command() {
  if [[ "$MODE" == "dry-run" ]]; then
    print_command "$@"
  else
    "$@"
  fi
}

assert_runtime_contract() {
  [[ "$FIXVOX_HOST" == "127.0.0.1" ]] || fail "host contract drift"
  [[ "$FIXVOX_PORT" == "8790" ]] || fail "port contract drift"
  [[ "$FIXVOX_CURRENT" == "/home/jpsal/opt/fixvox-api/current" ]] || fail "release path contract drift"
}

load_protected_env() {
  [[ -f "$FIXVOX_ENV_FILE" ]] || fail "protected env file is missing"
  [[ "$(stat -c '%a' "$FIXVOX_ENV_FILE")" == "600" ]] || fail "protected env must be mode 0600"
  [[ "$(stat -c '%U' "$FIXVOX_ENV_FILE")" == "$FIXVOX_OWNER" ]] || fail "protected env has an unexpected owner"
  set -a
  # shellcheck disable=SC1090
  source "$FIXVOX_ENV_FILE"
  set +a
}

redacted_env_check() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || fail "required protected value is not present: $name"
  done
}
