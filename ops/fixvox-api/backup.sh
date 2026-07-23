#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

retention_days="14"
init_args f4 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --retention-days) ((++i < ${#args[@]})) || fail "--retention-days needs a value"; retention_days="${args[$i]}" ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done
[[ "$retention_days" =~ ^[1-9][0-9]{0,2}$ && "$retention_days" -le 365 ]] || fail "retention days must be 1..365"
assert_runtime_contract
note "fixvox-api backup: mode=$MODE target=$FIXVOX_BACKUP_DIR retention_days=$retention_days"
if [[ "$MODE" == "dry-run" ]]; then
  note "pipeline: pg_dump custom (PGSERVICE) -> zstd -> age public recipient; safe manifest; lock + restrictive permissions"
  exit 0
fi

require_target_host
load_protected_env
redacted_env_check FIXVOX_DATABASE_URL FIXVOX_BACKUP_AGE_RECIPIENT
[[ -f "$FIXVOX_PGSERVICE_FILE" && "$(stat -c '%a' "$FIXVOX_PGSERVICE_FILE")" == "600" ]] || fail "protected PostgreSQL service file must be mode 0600"
[[ -d "$FIXVOX_BACKUP_DIR" && "$(stat -c '%a' "$FIXVOX_BACKUP_DIR")" == "700" ]] || fail "backup directory must be mode 0700"
[[ "$FIXVOX_BACKUP_AGE_RECIPIENT" =~ ^age1[0-9a-z]+$ ]] || fail "age recipient is malformed"
if ! printf '' | age -r "$FIXVOX_BACKUP_AGE_RECIPIENT" -e -o /dev/null 2>/dev/null; then
  fail "age recipient could not be parsed"
fi

umask 077
exec 9>"$FIXVOX_BACKUP_DIR/.backup.lock"
flock -n 9 || fail "another backup is running"
stamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
base="fixvox-$stamp"
backup_tmp="$FIXVOX_BACKUP_DIR/.$base.dump.zst.age.tmp"
manifest_db_tmp="$FIXVOX_BACKUP_DIR/.$base.database.json.tmp"
manifest_tmp="$FIXVOX_BACKUP_DIR/.$base.manifest.json.tmp"
backup_path="$FIXVOX_BACKUP_DIR/$base.dump.zst.age"
manifest_path="$FIXVOX_BACKUP_DIR/$base.manifest.json"
trap 'rm -f "${backup_tmp:-}" "${manifest_db_tmp:-}" "${manifest_tmp:-}"' EXIT

PGSERVICEFILE="$FIXVOX_PGSERVICE_FILE" PGSERVICE=fixvox_api \
  pg_dump --format=custom --no-owner --no-acl \
  | zstd -T1 -q \
  | age -r "$FIXVOX_BACKUP_AGE_RECIPIENT" > "$backup_tmp"
[[ -s "$backup_tmp" ]] || fail "encrypted backup is empty"
"$FIXVOX_BUN" run "$FIXVOX_CURRENT/cloud/fixvox-api/src/postgres/generate-backup-manifest.ts" > "$manifest_db_tmp"
if grep -Eqi 'postgres(ql)?://|password|secret|token|transcript|audio|prompt|requestBody|authorization' "$manifest_db_tmp"; then
  fail "privacy sentinel rejected database manifest"
fi
encrypted_sha="$(sha256sum "$backup_tmp" | awk '{print $1}')"
[[ "$encrypted_sha" =~ ^[0-9a-f]{64}$ ]] || fail "encrypted backup hash is malformed"
"$FIXVOX_BUN" -e '
  const input = JSON.parse(await Bun.file(process.argv[1]).text());
  const countKeys = ["accounts", "devices", "profiles", "profile_versions", "policy_assignments", "usage_reservations", "usage_events", "audit_records"];
  const hashKeys = ["accounts", "profiles"];
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) throw new Error("manifest_schema_invalid");
  if (!input.authority || input.authority.mode !== "cloudflare-authority" || !Number.isSafeInteger(input.authority.revision) || input.authority.revision < 0) throw new Error("manifest_authority_invalid");
  if (!input.counts || Object.keys(input.counts).sort().join(",") !== countKeys.slice().sort().join(",")) throw new Error("manifest_counts_allowlist_invalid");
  for (const key of countKeys) if (!Number.isSafeInteger(input.counts[key]) || input.counts[key] < 0) throw new Error("manifest_count_invalid");
  if (!input.projectionHashes || Object.keys(input.projectionHashes).sort().join(",") !== hashKeys.join(",")) throw new Error("manifest_hash_allowlist_invalid");
  for (const key of hashKeys) if (!/^[0-9a-f]{64}$/.test(input.projectionHashes[key])) throw new Error("manifest_hash_invalid");
  if (!/^[0-9a-f]{64}$/.test(process.argv[2])) throw new Error("manifest_backup_hash_invalid");
  const output = {
    encryptedSha256: process.argv[2],
    database: {
      schemaVersion: input.schemaVersion,
      authority: input.authority,
      counts: input.counts,
      projectionHashes: input.projectionHashes,
    },
  };
  await Bun.write(process.argv[3], JSON.stringify(output, null, 2) + "\n");
' -- "$manifest_db_tmp" "$encrypted_sha" "$manifest_tmp"
if grep -Eqi 'postgres(ql)?://|password|secret|token|transcript|audio|prompt|requestBody|authorization|createdAt|toolVersion|backupFile' "$manifest_tmp"; then
  fail "privacy or manifest allowlist rejected final manifest"
fi
chmod 0600 "$backup_tmp" "$manifest_tmp"
mv "$backup_tmp" "$backup_path"
mv "$manifest_tmp" "$manifest_path"
rm -f "$manifest_db_tmp"
find "$FIXVOX_BACKUP_DIR" -maxdepth 1 -type f \( -name 'fixvox-*.dump.zst.age' -o -name 'fixvox-*.manifest.json' \) \
  -mtime "+$retention_days" -delete
trap - EXIT
note "backup=ok file=$(basename "$backup_path") manifest=$(basename "$manifest_path") encrypted_sha256=$encrypted_sha"
