#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

backup=""
manifest=""
identity=""
temp_db=""
drop_after_success="false"
init_args f5 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --backup) ((++i < ${#args[@]})) || fail "--backup needs a value"; backup="${args[$i]}" ;;
    --manifest) ((++i < ${#args[@]})) || fail "--manifest needs a value"; manifest="${args[$i]}" ;;
    --identity) ((++i < ${#args[@]})) || fail "--identity needs a value"; identity="${args[$i]}" ;;
    --temp-db) ((++i < ${#args[@]})) || fail "--temp-db needs a value"; temp_db="${args[$i]}" ;;
    --drop-after-success) drop_after_success="true" ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done
note "fixvox-api restore rehearsal: mode=$MODE temporary_database=${temp_db:-fixvox_restore_allowlisted}"
if [[ "$MODE" == "dry-run" ]]; then
  note "off-host only: verify encrypted hash -> decrypt via identity FD/path -> isolated create/restore -> compare safe manifest"
  note "temporary DB is preserved unless --drop-after-success is explicitly supplied with the F5 gate"
  exit 0
fi

[[ "$(hostname -s)" != "$FIXVOX_EXPECTED_HOST" ]] || fail "private age identity must remain off the VPS"
for item in "$backup" "$manifest" "$identity"; do require_linux_absolute "$item" "rehearsal input"; done
[[ -f "$backup" && -f "$manifest" && -f "$identity" ]] || fail "backup, manifest, and off-host identity must exist"
require_safe_name "$temp_db" "temporary database"
[[ "$temp_db" == fixvox_restore_* ]] || fail "temporary database must use fixvox_restore_ prefix"
[[ -n "${PGSERVICEFILE:-}" && -f "$PGSERVICEFILE" ]] || fail "PGSERVICEFILE must point to an off-host protected connection file"
[[ "${PGSERVICE:-fixvox_migrator}" == "fixvox_migrator" ]] || fail "rehearsal requires the migrator service"
for command_name in age zstd pg_restore createdb psql; do
  command -v "$command_name" >/dev/null || fail "age, zstd, and PostgreSQL client tools are required"
done

expected_sha="$(sed -n 's/^[[:space:]]*"encryptedSha256": "\([0-9a-f]\{64\}\)",\{0,1\}$/\1/p' "$manifest")"
[[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || fail "backup manifest hash is missing or malformed"
[[ "$(sha256sum "$backup" | awk '{print $1}')" == "$expected_sha" ]] || fail "encrypted backup hash mismatch"
export PGSERVICE="fixvox_migrator"
if PGDATABASE=postgres psql --no-psqlrc --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '$temp_db'" | grep -qx 1; then
  fail "temporary database already exists"
fi
PGDATABASE=postgres createdb --owner=fixvox_migrator "$temp_db"
note "temporary_database_created=$temp_db"
if ! age --decrypt -i "$identity" "$backup" | zstd -d -q | \
  PGDATABASE="$temp_db" pg_restore --exit-on-error --no-owner --no-acl --dbname="$temp_db"; then
  fail "restore failed; temporary database preserved for redacted diagnosis"
fi

actual_manifest="$(mktemp "${TMPDIR:-/tmp}/fixvox-restore-manifest.XXXXXX.json")"
trap 'rm -f "${actual_manifest:-}"' EXIT
PGDATABASE="$temp_db" psql --no-psqlrc --tuples-only --no-align > "$actual_manifest" <<'SQL'
SELECT json_build_object(
  'schemaVersion', (SELECT COALESCE(MAX(version), 0)::integer FROM schema_migrations),
  'authority', (SELECT json_build_object('mode', mode, 'revision', revision) FROM control_plane_authority WHERE singleton = true),
  'counts', json_build_object(
    'accounts', (SELECT COUNT(*) FROM accounts),
    'devices', (SELECT COUNT(*) FROM devices),
    'profiles', (SELECT COUNT(*) FROM profiles),
    'profile_versions', (SELECT COUNT(*) FROM profile_versions),
    'policy_assignments', (SELECT COUNT(*) FROM policy_assignments),
    'usage_reservations', (SELECT COUNT(*) FROM usage_reservations),
    'usage_events', (SELECT COUNT(*) FROM usage_events),
    'audit_records', (SELECT COUNT(*) FROM audit_records)
  ),
  'projectionHashes', json_build_object(
    'accounts', (SELECT encode(digest(COALESCE(string_agg(provider || ':' || provider_subject_hash || ':' || status, '|' ORDER BY provider, provider_subject_hash), ''), 'sha256'), 'hex') FROM accounts),
    'profiles', (SELECT encode(digest(COALESCE(string_agg(profile_id || ':' || COALESCE(active_published_version::text, '-') || ':' || revision::text, '|' ORDER BY profile_id), ''), 'sha256'), 'hex') FROM profiles)
  )
);
SQL
BUN_BIN="${BUN_BIN:-bun}"
# shellcheck disable=SC2016
"$BUN_BIN" -e '
  const expected = JSON.parse(await Bun.file(process.argv[1]).text()).database;
  const actual = JSON.parse((await Bun.file(process.argv[2]).text()).trim());
  for (const key of ["schemaVersion", "authority", "counts", "projectionHashes"]) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) throw new Error(`restore_manifest_mismatch:${key}`);
  }
  if (actual.authority?.mode !== "cloudflare-authority") throw new Error("restore_authority_mismatch");
' -- "$manifest" "$actual_manifest"
note "restore_compare=ok authority=cloudflare-authority encrypted_sha256=$expected_sha"
if [[ "$drop_after_success" == "true" ]]; then
  PGDATABASE=postgres dropdb "$temp_db"
  note "temporary_database_dropped=$temp_db"
else
  note "temporary_database_preserved=$temp_db"
fi
