#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
if [[ -n "${FIXVOX_CODE_RELEASE_TEST_ROOT:-}" ]]; then
  [[ "${FIXVOX_CODE_RELEASE_TESTING:-}" == "1" && "$FIXVOX_CODE_RELEASE_TEST_ROOT" == /tmp/* ]] \
    || fail "test root override is restricted to explicit /tmp harnesses"
  FIXVOX_ROOT="$FIXVOX_CODE_RELEASE_TEST_ROOT/root"
  FIXVOX_RELEASES="$FIXVOX_ROOT/releases"
  FIXVOX_CURRENT="$FIXVOX_ROOT/current"
  FIXVOX_STAGING="$FIXVOX_CODE_RELEASE_TEST_ROOT/staging"
  FIXVOX_CONFIG_DIR="$FIXVOX_CODE_RELEASE_TEST_ROOT/config"
  FIXVOX_ENV_FILE="$FIXVOX_CONFIG_DIR/fixvox-api.env"
  FIXVOX_PGSERVICE_FILE="$FIXVOX_CONFIG_DIR/fixvox-api.pg_service.conf"
  FIXVOX_BUN="${FIXVOX_CODE_RELEASE_TEST_BUN:-$FIXVOX_BUN}"
  FIXVOX_OWNER="$(id -un)"
  export FIXVOX_ROOT FIXVOX_RELEASES FIXVOX_CURRENT FIXVOX_STAGING FIXVOX_CONFIG_DIR
  export FIXVOX_ENV_FILE FIXVOX_PGSERVICE_FILE FIXVOX_BUN FIXVOX_OWNER
  require_target_host() { :; }
  assert_runtime_contract() {
    [[ "$FIXVOX_HOST" == "127.0.0.1" && "$FIXVOX_PORT" == "8790" ]] || fail "host contract drift"
  }
fi

archive=""
manifest=""
expected_current=""
rollback_release=""
receipt=""
init_args f3 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --archive) ((++i < ${#args[@]})) || fail "--archive needs a value"; archive="${args[$i]}" ;;
    --manifest) ((++i < ${#args[@]})) || fail "--manifest needs a value"; manifest="${args[$i]}" ;;
    --expected-current) ((++i < ${#args[@]})) || fail "--expected-current needs a value"; expected_current="${args[$i]}" ;;
    --rollback-release) ((++i < ${#args[@]})) || fail "--rollback-release needs a value"; rollback_release="${args[$i]}" ;;
    --receipt) ((++i < ${#args[@]})) || fail "--receipt needs a value"; receipt="${args[$i]}" ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done

[[ "$expected_current" =~ ^[0-9a-f]{16}$ ]] || fail "expected current release ID is malformed"
[[ "$rollback_release" == "$expected_current" ]] || fail "code-only rollback must equal expected current"
require_under "$archive" "$FIXVOX_STAGING" "archive"
require_under "$manifest" "$FIXVOX_STAGING" "manifest"
require_under "$receipt" "$FIXVOX_STAGING" "receipt"
[[ "$(basename "$receipt")" =~ ^code-release-[0-9a-f]{16}\.receipt\.json$ ]] || fail "receipt filename is not allowlisted"
assert_runtime_contract

if [[ "$MODE" == "dry-run" ]]; then
  note "fixvox-api code release: mode=dry-run expected_current=$expected_current rollback=$rollback_release"
  note "steps: exact read-only preflight -> immutable install -> atomic promotion -> one restart -> one-shot verification"
  note "failure after promotion: atomic rollback -> one restart -> one-shot rollback verification; no retry"
  exit 0
fi

require_target_host
[[ -f "$archive" && -f "$manifest" ]] || fail "staged archive and manifest must exist"
[[ -f "$FIXVOX_ENV_FILE" && "$(stat -c '%a' "$FIXVOX_ENV_FILE")" == "600" ]] || fail "protected env must be mode 0600"
[[ -f "$FIXVOX_PGSERVICE_FILE" && "$(stat -c '%a' "$FIXVOX_PGSERVICE_FILE")" == "600" ]] || fail "protected PostgreSQL config must be mode 0600"
[[ "$(stat -c '%U' "$FIXVOX_ENV_FILE")" == "$FIXVOX_OWNER" && "$(stat -c '%U' "$FIXVOX_PGSERVICE_FILE")" == "$FIXVOX_OWNER" ]] || fail "protected config owner drift"
load_protected_env
redacted_env_check FIXVOX_API_PUBLIC_BASE_URL
[[ "$FIXVOX_API_PUBLIC_BASE_URL" == "https://auth-fixvox.jpsala.dev" ]] || fail "public base URL drift"

release_id="$(sed -n 's/^[[:space:]]*"releaseId": "\([0-9a-f]\{16\}\)",\{0,1\}$/\1/p' "$manifest")"
archive_sha="$(sed -n 's/^[[:space:]]*"archiveSha256": "\([0-9a-f]\{64\}\)",\{0,1\}$/\1/p' "$manifest")"
[[ "$release_id" =~ ^[0-9a-f]{16}$ && "$archive_sha" =~ ^[0-9a-f]{64}$ && "$release_id" == "${archive_sha:0:16}" ]] || fail "candidate manifest identity is malformed"
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$archive_sha" ]] || fail "candidate archive hash mismatch"
release_path="$FIXVOX_RELEASES/$release_id"
rollback_path="$FIXVOX_RELEASES/$rollback_release"
[[ ! -e "$release_path" ]] || fail "candidate release already exists"
current_release_id() {
  if [[ -n "${FIXVOX_CODE_RELEASE_TEST_ROOT:-}" ]]; then
    cat "$FIXVOX_CODE_RELEASE_TEST_ROOT/current-id"
    return
  fi
  [[ -L "$FIXVOX_CURRENT" ]] || return 1
  basename "$(readlink -f "$FIXVOX_CURRENT")"
}
[[ -d "$rollback_path" && -f "$rollback_path/release-manifest.json" ]] || fail "rollback release is missing"
[[ "$(current_release_id)" == "$expected_current" ]] || fail "current release drift"

if [[ -n "${FIXVOX_CODE_RELEASE_TEST_ROOT:-}" ]]; then
  mem_kib=2097152
  disk_kib=2097152
else
  mem_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  disk_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
fi
[[ "$mem_kib" =~ ^[0-9]+$ && "$mem_kib" -ge "$FIXVOX_MIN_MEM_KIB" ]] || fail "available memory is below 1 GiB"
[[ "$disk_kib" =~ ^[0-9]+$ && "$disk_kib" -ge "$FIXVOX_MIN_DISK_KIB" ]] || fail "free root disk is below 1 GiB"
[[ "$(systemctl --user is-active fixvox-api.service)" == "active" ]] || fail "service is not active"
[[ "$(systemctl --user is-enabled fixvox-api.service)" == "enabled" ]] || fail "service is not enabled"
[[ "$(systemctl --user show fixvox-api.service --property=NRestarts --value)" == "0" ]] || fail "service restart loop detected"

migration_rows() {
  PGSERVICEFILE="$FIXVOX_PGSERVICE_FILE" PGSERVICE=fixvox_api \
    psql --no-psqlrc --tuples-only --no-align --field-separator='|' --set=ON_ERROR_STOP=1 \
      --command="SELECT version, name, checksum FROM schema_migrations ORDER BY version"
}
manifest_migrations() {
  "$FIXVOX_BUN" -e 'const m=await Bun.file(Bun.argv[1]).json(); const rows=m.files.filter((x)=>x.path.startsWith("cloud/fixvox-api/migrations/")).map((x)=>{const n=x.path.split("/").at(-1);const z=/^(\d{4})_([a-z0-9_]+)\.sql$/.exec(n);if(!z)throw new Error("migration_manifest_invalid");return `${Number(z[1])}|${z[2]}|${x.sha256}`}); console.log(rows.join("\n"));' "$1"
}
assert_schema_exact() {
  local db candidate rollback
  db="$(migration_rows)"
  candidate="$(manifest_migrations "$manifest")"
  rollback="$(manifest_migrations "$rollback_path/release-manifest.json")"
  [[ "$(printf '%s\n' "$db" | wc -l | tr -d ' ')" == "9" ]] || return 1
  [[ "$candidate" == "$db" && "$rollback" == "$db" ]] || return 1
  [[ "$(printf '%s\n' "$db" | tail -n 1)" == "9|laboratory_execution_grants|82dbdf93a23aca25d8a1df6abb32546f82dcf33dea0a20a1523fbcd6d168a5a5" ]] || return 1
}
listener_exact() {
  local rows
  rows="$(ss -H -ltn "sport = :$FIXVOX_PORT")"
  [[ "$(printf '%s\n' "$rows" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')" == "1" ]] || return 1
  printf '%s\n' "$rows" | grep -Eq '127\.0\.0\.1:8790([[:space:]]|$)'
}
http_exact() {
  local base="$1" health ready
  health="$(mktemp)"; ready="$(mktemp)"
  if ! curl -fsS --max-time 10 "$base/health" -o "$health" || ! curl -fsS --max-time 10 "$base/ready" -o "$ready"; then rm -f "$health" "$ready"; return 1; fi
  if ! "$FIXVOX_BUN" -e 'const h=await Bun.file(Bun.argv[1]).json();const r=await Bun.file(Bun.argv[2]).json();if(h.ok!==true||h.service!=="fixvox-api"||r.ok!==true||r.database!==true||r.schema!==true||r.jobs!==true||r.authorityMode!=="cloudflare-authority")process.exit(1)' "$health" "$ready"; then rm -f "$health" "$ready"; return 1; fi
  rm -f "$health" "$ready"
}
verify_live() {
  local wanted="$1"
  [[ "$(current_release_id)" == "$wanted" ]] || return 1
  [[ "$(systemctl --user is-active fixvox-api.service)" == "active" ]] || return 1
  [[ "$(systemctl --user is-enabled fixvox-api.service)" == "enabled" ]] || return 1
  [[ "$(systemctl --user show fixvox-api.service --property=NRestarts --value)" == "0" ]] || return 1
  listener_exact || return 1
  assert_schema_exact || return 1
  http_exact "http://127.0.0.1:$FIXVOX_PORT" || return 1
  http_exact "$FIXVOX_API_PUBLIC_BASE_URL" || return 1
}
barrier() {
  local i
  for i in $(seq 1 30); do
    if [[ "$(systemctl --user is-active fixvox-api.service 2>/dev/null || true)" == "active" ]] && listener_exact; then return 0; fi
    sleep 1
  done
  return 1
}
write_receipt() {
  local outcome="$1" phase="$2" failure="$3" rollback_attempted="$4" rollback_outcome="$5"
  umask 077
  local tmp="${receipt}.tmp.$$"
  printf '{\n  "schemaVersion": 1,\n  "operation": "code-release",\n  "outcome": "%s",\n  "phase": "%s",\n  "releaseId": "%s",\n  "archiveSha256": "%s",\n  "expectedCurrent": "%s",\n  "rollbackRelease": "%s",\n  "schema": 9,\n  "verificationFailure": %s,\n  "rollbackAttempted": %s,\n  "rollbackOutcome": %s\n}\n' \
    "$outcome" "$phase" "$release_id" "$archive_sha" "$expected_current" "$rollback_release" \
    "$(if [[ -n "$failure" ]]; then printf '"%s"' "$failure"; else printf 'null'; fi)" "$rollback_attempted" \
    "$(if [[ -n "$rollback_outcome" ]]; then printf '"%s"' "$rollback_outcome"; else printf 'null'; fi)" > "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$receipt"
}
atomic_current() {
  local target="$1"
  if [[ -n "${FIXVOX_CODE_RELEASE_TEST_ROOT:-}" ]]; then
    basename "$target" > "$FIXVOX_CODE_RELEASE_TEST_ROOT/current-id"
    return
  fi
  local tmp="$FIXVOX_ROOT/.current.$$.tmp"
  ln -s "$target" "$tmp"
  mv -Tf "$tmp" "$FIXVOX_CURRENT"
}

assert_schema_exact || fail "schema, migration checksum, candidate, or rollback compatibility drift"
listener_exact || fail "listener is not exactly 127.0.0.1:8790"
http_exact "http://127.0.0.1:$FIXVOX_PORT" || fail "local health/readiness failed"
http_exact "$FIXVOX_API_PUBLIC_BASE_URL" || fail "public health/readiness failed"

"$SCRIPT_DIR/deploy.sh" --execute --approved-f3 --archive "$archive" --manifest "$manifest" --install-only
promoted=false
atomic_current "$release_path"
promoted=true
systemctl --user restart fixvox-api.service
if barrier && verify_live "$release_id"; then
  write_receipt "succeeded" "verified" "" false ""
  note "code_release=succeeded release_id=$release_id rollback=$rollback_release schema=9"
  exit 0
fi

failure="post_promotion_verification_failed"
if [[ "$promoted" == "true" ]]; then
  atomic_current "$rollback_path"
  systemctl --user restart fixvox-api.service
  if barrier && verify_live "$rollback_release"; then
    write_receipt "rolled_back" "rollback_verified" "$failure" true "succeeded"
    fail "release verification failed; exact rollback verified"
  fi
  write_receipt "rollback_failed" "rollback_verification_failed" "$failure" true "failed"
  fail "release verification failed and exact rollback verification failed"
fi
write_receipt "failed" "install" "immutable_install_failed" false ""
fail "immutable install failed"
