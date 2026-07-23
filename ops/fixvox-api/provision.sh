#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

bootstrap_fd=""
migration_root=""
init_args f2 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --bootstrap-fd) ((++i < ${#args[@]})) || fail "--bootstrap-fd needs a value"; bootstrap_fd="${args[$i]}" ;;
    --migration-root) ((++i < ${#args[@]})) || fail "--migration-root needs a value"; migration_root="${args[$i]}" ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done
assert_runtime_contract
note "fixvox-api provision: mode=$MODE"
note "packages: postgresql-16 postgresql-client-16 age"
note "database/roles: fixvox, fixvox_migrator, fixvox_api (dedicated; no container reuse)"
note "protected files: $FIXVOX_ENV_FILE and $FIXVOX_PGSERVICE_FILE (0600)"
if [[ "$MODE" == "dry-run" ]]; then
  note "approved package command: sudo apt-get update && sudo apt-get install --yes postgresql-16 postgresql-client-16 age"
  note "execution additionally requires --bootstrap-fd FD and --migration-root under $FIXVOX_STAGING"
  exit 0
fi

require_target_host
[[ "$bootstrap_fd" =~ ^[3-9][0-9]*$ ]] || fail "--bootstrap-fd must name an already-open protected file descriptor"
require_under "$migration_root" "$FIXVOX_STAGING" "migration root"
[[ -f "$migration_root/cloud/fixvox-api/src/postgres/migrate.ts" ]] || fail "approved migration source is missing"

migrator_password=""
runtime_password=""
migration_database_url=""
runtime_database_url=""
backup_age_recipient=""
while IFS='=' read -r key value <&"$bootstrap_fd" || [[ -n "${key:-}" ]]; do
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "bootstrap value contains a newline"
  case "$key" in
    migrator_password) migrator_password="$value" ;;
    runtime_password) runtime_password="$value" ;;
    migration_database_url) migration_database_url="$value" ;;
    runtime_database_url) runtime_database_url="$value" ;;
    backup_age_recipient) backup_age_recipient="$value" ;;
    ''|'#'*) ;;
    *) fail "bootstrap input contains a non-allowlisted field" ;;
  esac
done
for value in "$migrator_password" "$runtime_password" "$migration_database_url" "$runtime_database_url" "$backup_age_recipient"; do
  [[ -n "$value" && "$value" != *$'\r'* && "$value" != *$'\n'* ]] || fail "bootstrap input is incomplete or malformed"
done
[[ "$migrator_password" =~ ^[0-9a-f]{64}$ ]] || fail "migrator password must be a 64-character lowercase hex secret"
[[ "$runtime_password" =~ ^[0-9a-f]{64}$ ]] || fail "runtime password must be a 64-character lowercase hex secret"
[[ "$migration_database_url" == "postgresql://fixvox_migrator:${migrator_password}@127.0.0.1:5432/fixvox" ]] \
  || fail "migration URL must match the protected migrator credentials and loopback database fixvox"
[[ "$runtime_database_url" == "postgresql://fixvox_api:${runtime_password}@127.0.0.1:5432/fixvox" ]] \
  || fail "runtime URL must match the protected runtime credentials and loopback database fixvox"
[[ "$backup_age_recipient" =~ ^age1[0-9a-z]+$ ]] || fail "backup recipient is not a public age recipient"

sudo apt-get update
sudo apt-get install --yes postgresql-16 postgresql-client-16 age
sudo install -d -m 0755 -o "$FIXVOX_OWNER" -g "$FIXVOX_OWNER" "$FIXVOX_ROOT" "$FIXVOX_RELEASES" "$FIXVOX_STAGING" "$FIXVOX_CONFIG_DIR" "$FIXVOX_UNIT_DIR" "$FIXVOX_BIN_DIR"
sudo install -d -m 0700 -o "$FIXVOX_OWNER" -g "$FIXVOX_OWNER" "$FIXVOX_BACKUP_DIR"

sql_literal() { local v="$1"; printf '%s' "${v//\'/\'\'}"; }
mp="$(sql_literal "$migrator_password")"
rp="$(sql_literal "$runtime_password")"
umask 077
sql_temp="$(mktemp "${TMPDIR:-/tmp}/fixvox-provision.XXXXXX.sql")"
trap 'rm -f "${sql_temp:-}"' EXIT
cat > "$sql_temp" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fixvox_migrator') THEN
    CREATE ROLE fixvox_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fixvox_api') THEN
    CREATE ROLE fixvox_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
\$\$;
ALTER ROLE fixvox_migrator PASSWORD '$mp';
ALTER ROLE fixvox_api PASSWORD '$rp';
SQL
cat "$sql_temp" | sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=postgres >/dev/null
if ! sudo -u postgres psql --no-psqlrc --tuples-only --no-align --dbname=postgres \
  --command="SELECT 1 FROM pg_database WHERE datname = 'fixvox'" | grep -qx 1; then
  sudo -u postgres createdb --owner=fixvox_migrator fixvox
fi
sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=postgres >/dev/null <<'SQL'
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL

FIXVOX_DATABASE_URL="$migration_database_url" "$FIXVOX_BUN" run "$migration_root/cloud/fixvox-api/src/postgres/migrate.ts"
sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=fixvox >/dev/null <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM fixvox_api;
GRANT CONNECT ON DATABASE fixvox TO fixvox_api;
GRANT USAGE ON SCHEMA public TO fixvox_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fixvox_api;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO fixvox_api;
ALTER DEFAULT PRIVILEGES FOR ROLE fixvox_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fixvox_api;
ALTER DEFAULT PRIVILEGES FOR ROLE fixvox_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO fixvox_api;
SQL

systemd_quote() { local v="$1"; v="${v//\\/\\\\}"; v="${v//\"/\\\"}"; printf '"%s"' "$v"; }
{
  printf 'FIXVOX_API_DATABASE_URL=%s\n' "$(systemd_quote "$runtime_database_url")"
  printf 'FIXVOX_DATABASE_URL=%s\n' "$(systemd_quote "$runtime_database_url")"
  printf 'FIXVOX_API_PUBLIC_BASE_URL=http://127.0.0.1:8790\n'
  printf 'FIXVOX_API_HOST=127.0.0.1\n'
  printf 'FIXVOX_API_PORT=8790\n'
  printf 'FIXVOX_API_MOCK_PROVIDERS=true\n'
  printf 'FIXVOX_API_REQUEST_TIMEOUT_MS=30000\n'
  printf 'FIXVOX_API_MAX_REQUEST_BYTES=26214400\n'
  printf 'FIXVOX_BACKUP_AGE_RECIPIENT=%s\n' "$backup_age_recipient"
} > "$FIXVOX_ENV_FILE"

{
  printf '[fixvox_migrator]\nhost=127.0.0.1\nport=5432\ndbname=fixvox\nuser=fixvox_migrator\npassword=%s\n' "$migrator_password"
  printf '[fixvox_api]\nhost=127.0.0.1\nport=5432\ndbname=fixvox\nuser=fixvox_api\npassword=%s\n' "$runtime_password"
} > "$FIXVOX_PGSERVICE_FILE"
chmod 0600 "$FIXVOX_ENV_FILE" "$FIXVOX_PGSERVICE_FILE"
note "provision=ok (secret values redacted)"
