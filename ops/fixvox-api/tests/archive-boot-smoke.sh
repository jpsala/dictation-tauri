#!/usr/bin/env bash
set -euo pipefail
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_DIR="$(cd "$TEST_DIR/.." && pwd)"
REPO_ROOT="$(cd "$OPS_DIR/../.." && pwd -P)"
BUN_BIN="${BUN_BIN:-bun}"
SENTINEL="f3r3_secret_sentinel_must_not_escape"
PROVIDER_SENTINEL="provider_fixture_secret_must_not_escape"
archive=""
manifest=""
provider_configured_fixture="false"
database_url="postgres://${SENTINEL}:${SENTINEL}@127.0.0.1:1/fixvox"

while (($#)); do
case "$1" in
--archive)
(($# >= 2)) || { printf 'archive boot smoke failed: --archive needs a value\n' >&2; exit 1; }
archive="$2"
shift 2
;;
--manifest)
(($# >= 2)) || { printf 'archive boot smoke failed: --manifest needs a value\n' >&2; exit 1; }
manifest="$2"
shift 2
;;
--provider-configured-fixture)
provider_configured_fixture="true"
shift
;;
--help)
printf 'Usage: archive-boot-smoke.sh [--archive PATH --manifest PATH] [--provider-configured-fixture]\n'
exit 0
;;
*)
printf 'archive boot smoke failed: unknown argument: %s\n' "$1" >&2
exit 1
;;
esac
done

if [[ -n "$archive" || -n "$manifest" ]]; then
[[ -n "$archive" && -n "$manifest" ]] || { printf 'archive boot smoke failed: archive and manifest must be supplied together\n' >&2; exit 1; }
[[ -f "$archive" && -f "$manifest" ]] || { printf 'archive boot smoke failed: supplied archive/manifest is missing\n' >&2; exit 1; }
fi
if [[ "$provider_configured_fixture" == "true" && ( -z "$archive" || -z "$manifest" ) ]]; then
fail_message='provider-configured fixture requires an explicit approved archive and manifest'
printf 'archive boot smoke failed: %s\n' "$fail_message" >&2
exit 1
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/fixvox-archive-boot.XXXXXX")"
child_pid=""
cleanup() {
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

fail() {
  printf 'archive boot smoke failed: %s\n' "$*" >&2
  exit 1
}

assert_port_available() {
  local port="$1"
  PORT_TO_CHECK="$port" "$BUN_BIN" -e '
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: Number(Bun.env.PORT_TO_CHECK),
      fetch() { return new Response("fixture"); },
    });
    server.stop(true);
  ' >/dev/null 2>&1 || fail "ephemeral port is not available: $port"
}

mkdir -p "$tmp/output" "$tmp/extracted"
if [[ -z "$archive" ]]; then
  bash "$OPS_DIR/bundle.sh" \
    --execute --approved-f1 \
    --repo-root "$REPO_ROOT" \
    --output-dir "$tmp/output" >/dev/null
  archive="$(find "$tmp/output" -maxdepth 1 -name '*.tar.gz' -print -quit)"
  manifest="$(find "$tmp/output" -maxdepth 1 -name '*.manifest.json' -print -quit)"
fi
[[ -n "$archive" && -n "$manifest" ]] || fail "archive/manifest input is incomplete"

archive_sha="$(sha256sum "$archive" | awk '{print $1}')"
manifest_sha="$($BUN_BIN -e '
  const manifest = JSON.parse(await Bun.file(process.argv[1]).text());
  console.log(manifest.archiveSha256);
' -- "$manifest")"
[[ "$archive_sha" == "$manifest_sha" ]] || fail "archive hash does not match manifest"

entries="$(tar -tzf "$archive")"
if grep -Eqi '(^|/)(fixvox-proxy|\.env|tests?|__tests__|artifacts?|node_modules|\.git)(/|$)|\.(test|spec)\.[^/]+$' <<<"$entries"; then
  fail "archive contains a forbidden path"
fi

tar -xzf "$archive" -C "$tmp/extracted"
if grep -R -Fq "$SENTINEL" "$tmp/extracted"; then
  fail "secret sentinel is present in extracted content"
fi

if [[ "$provider_configured_fixture" == "true" ]]; then
  database_url="${FIXVOX_API_DATABASE_URL:-}"
  [[ -n "$database_url" ]] || fail "provider-configured fixture requires FIXVOX_API_DATABASE_URL in the environment"
  DATABASE_URL_TO_CHECK="$database_url" "$BUN_BIN" -e '
    const value = Bun.env.DATABASE_URL_TO_CHECK ?? "";
    const url = new URL(value);
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new Error("unsafe_database_host");
    if (url.pathname.replace(/^\//, "") !== "fixvox_test") throw new Error("unsafe_database_name");
    const sql = new Bun.SQL(value);
    try {
      const [database] = await sql.unsafe("SELECT current_database() AS name");
      const [schema] = await sql.unsafe("SELECT MAX(version) AS version FROM schema_migrations");
      const [authority] = await sql.unsafe("SELECT mode FROM control_plane_authority WHERE singleton = true");
      if (database?.name !== "fixvox_test") throw new Error("unsafe_database_name");
      if (Number(schema?.version) !== 6) throw new Error("unsafe_schema_version");
      if (authority?.mode !== "cloudflare-authority") throw new Error("unsafe_authority");
    } finally {
      await sql.close();
    }
  ' >/dev/null || fail "local PostgreSQL fixture is not fixvox_test/schema-6/cloudflare-authority"
fi

port="$($BUN_BIN -e '
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() { return new Response("fixture"); },
  });
  console.log(server.port);
  server.stop(true);
')"
[[ "$port" =~ ^[0-9]+$ ]] || fail "could not allocate an ephemeral port"
assert_port_available "$port"

boot_log="$tmp/boot.log"
boot_target="cloud/fixvox-api/src/main.ts"
mock_providers="true"
if [[ "$provider_configured_fixture" == "true" ]]; then
  mock_providers="false"
fi
(
  cd "$tmp/extracted"
  exec env -u NODE_PATH \
    FIXVOX_API_DATABASE_URL="$database_url" \
    FIXVOX_DATABASE_URL="$database_url" \
    FIXVOX_API_PUBLIC_BASE_URL="http://127.0.0.1:${port}" \
    FIXVOX_API_HOST="127.0.0.1" \
    FIXVOX_API_PORT="$port" \
    FIXVOX_API_MOCK_PROVIDERS="$mock_providers" \
    GROQ_API_KEY="$PROVIDER_SENTINEL" \
    "$BUN_BIN" run "$boot_target"
) >"$boot_log" 2>&1 &
child_pid="$!"

health_body=""
health_ok="false"
for _ in $(seq 1 50); do
  if health_body="$(curl -fsS --max-time 1 "http://127.0.0.1:${port}/health" 2>/dev/null)"; then
    health_ok="true"
    break
  fi
  kill -0 "$child_pid" 2>/dev/null || break
  sleep 0.1
done
[[ "$health_ok" == "true" ]] || {
  cat "$boot_log" >&2
  fail "archive did not reach /health within five seconds"
}
kill -0 "$child_pid" 2>/dev/null || fail "archive process exited after serving /health"

HEALTH_BODY="$health_body" "$BUN_BIN" -e '
  const payload = JSON.parse(Bun.env.HEALTH_BODY ?? "null");
  if (payload?.ok !== true || payload?.service !== "fixvox-api") throw new Error("invalid_health_payload");
  if (typeof payload.date !== "string" || Number.isNaN(Date.parse(payload.date))) throw new Error("invalid_health_date");
' >/dev/null

readiness_result="not-requested"
if [[ "$provider_configured_fixture" == "true" ]]; then
  readiness_body="$(curl -fsS --max-time 1 "http://127.0.0.1:${port}/ready" 2>/dev/null)" || fail "provider-configured fixture did not reach /ready"
  READINESS_BODY="$readiness_body" "$BUN_BIN" -e '
    const payload = JSON.parse(Bun.env.READINESS_BODY ?? "null");
    if (payload?.ok !== true || payload?.database !== true || payload?.schema !== true || payload?.jobs !== true) {
      throw new Error("invalid_readiness_payload");
    }
    if (payload.authorityMode !== "cloudflare-authority") throw new Error("invalid_readiness_authority");
  ' >/dev/null
  readiness_result="200"
fi

kill -TERM "$child_pid" 2>/dev/null || fail "could not stop archive process"
for _ in $(seq 1 50); do
  kill -0 "$child_pid" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "$child_pid" 2>/dev/null; then
  fail "archive process did not stop within five seconds"
fi
set +e
wait "$child_pid"
set -e
child_pid=""

if grep -Fq "$SENTINEL" "$boot_log" || grep -Fq "$PROVIDER_SENTINEL" "$boot_log"; then
  fail "secret sentinel escaped into boot output"
fi
if grep -Eqi 'postgres(?:ql)?://|fixvox_test@' "$boot_log"; then
  fail "database credential material escaped into boot output"
fi
if grep -Eqi 'ECONN|database.*(error|failed)|address already in use|cannot find module|module not found|panic|unhandled|^error:' "$boot_log"; then
  cat "$boot_log" >&2
  fail "boot output contains an unexpected runtime error"
fi

assert_port_available "$port"
printf 'archive_boot=ok archive_sha256=%s health=200 readiness=%s provider_configured=%s provider_calls=0 isolated=true cleanup=ok\n' \
  "$archive_sha" "$readiness_result" "$provider_configured_fixture"
