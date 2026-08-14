#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/tool" "$TMP/root/releases/650b4c8f6ed00a2a" "$TMP/staging" "$TMP/config" "$TMP/bin"
cp "$SOURCE_DIR/code-release.sh" "$SOURCE_DIR/lib.sh" "$TMP/tool/"
chmod +x "$TMP/tool/code-release.sh"
printf 'FIXVOX_API_PUBLIC_BASE_URL=https://auth-fixvox.jpsala.dev\n' > "$TMP/config/fixvox-api.env"
printf '[fixvox_api]\n' > "$TMP/config/fixvox-api.pg_service.conf"
chmod 600 "$TMP/config/fixvox-api.env" "$TMP/config/fixvox-api.pg_service.conf"

cat > "$TMP/db.rows" <<'ROWS'
1|initial_control_plane|8e2a8120084b41fa633317c5ceb194a5f2576f9ebb0e6f5bc87c2a6b7db85f75
2|immutable_history_guards|143264c2217588b8d3c6d157b3f5f556ead052fc643542c4089ab91123644c97
3|auth_desktop_handoff|5e312efb6236f3dca721c528f0e7c5f904cd8daa2f5cf6d5c039937dae058f9c
4|admin_read_projections|2772d250353dba8706ee28e2cd2b3a4f76b3c6ce9dd9d87c9999bd23815a3b54
5|budget_ledger|aa625e1ab43b0c71b3ee1c5fca0160bc5311c9b6e7d8262d7a468fac912de75e
6|budget_ledger_async_projection|8ada0856c149d79e7b10afc56db61d2e79774db5f35c72b8203e121dc4938a80
7|engine_catalog_lifecycle|c607b83019ffd18ea9b948dbaef5028b7ae7cb543e2b753f76445fa90a78b5a6
8|personal_vocabulary|0b841d3041ca6203b26c802f728c479dd17408fa8c08334256203f8a0be585ad
9|laboratory_execution_grants|82dbdf93a23aca25d8a1df6abb32546f82dcf33dea0a20a1523fbcd6d168a5a5
ROWS

archive="$TMP/staging/candidate.tar.gz"
printf 'provider-free-code-release-smoke\n' > "$archive"
archive_sha="$(sha256sum "$archive" | awk '{print $1}')"
release_id="${archive_sha:0:16}"
manifest="$TMP/staging/candidate.manifest.json"
receipt="$TMP/staging/code-release-$release_id.receipt.json"
{
  printf '{\n  "schemaVersion": 1,\n  "releaseId": "%s",\n  "archive": "candidate.tar.gz",\n  "archiveSha256": "%s",\n  "files": [' "$release_id" "$archive_sha"
  first=true
  while IFS='|' read -r version name checksum; do
    [[ "$first" == true ]] || printf ','
    first=false
    printf '{"path":"cloud/fixvox-api/migrations/%04d_%s.sql","sha256":"%s"}' "$version" "$name" "$checksum"
  done < "$TMP/db.rows"
  printf ']\n}\n'
} > "$manifest"
cp "$manifest" "$TMP/root/releases/650b4c8f6ed00a2a/release-manifest.json"
printf '650b4c8f6ed00a2a\n' > "$TMP/current-id"

cat > "$TMP/tool/deploy.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
manifest=""
while (($#)); do case "$1" in --manifest) manifest="$2"; shift 2;; *) shift;; esac; done
release_id="$(sed -n 's/^[[:space:]]*"releaseId": "\([0-9a-f]\{16\}\)",\{0,1\}$/\1/p' "$manifest")"
mkdir "$FIXVOX_RELEASES/$release_id"
cp "$manifest" "$FIXVOX_RELEASES/$release_id/release-manifest.json"
SH
chmod +x "$TMP/tool/deploy.sh"

cat > "$TMP/bin/systemctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *" restart "*|"--user restart "*) printf 'restart\n' >> "$FIXVOX_CODE_RELEASE_TEST_ROOT/restarts" ;;
  *"is-active"*) printf 'active\n' ;;
  *"is-enabled"*) printf 'enabled\n' ;;
  *"NRestarts"*) printf '0\n' ;;
  *) exit 2 ;;
esac
SH
cat > "$TMP/bin/ss" <<'SH'
#!/usr/bin/env bash
printf 'LISTEN 0 511 127.0.0.1:8790 0.0.0.0:*\n'
SH
cat > "$TMP/bin/psql" <<'SH'
#!/usr/bin/env bash
cat "$FIXVOX_CODE_RELEASE_TEST_ROOT/db.rows"
SH
cat > "$TMP/bin/stat" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"%a"*) printf '600\n' ;;
  *"%U"*) id -un ;;
  *) /usr/bin/stat "$@" ;;
esac
SH
cat > "$TMP/bin/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
out=""; url=""
while (($#)); do case "$1" in -o) out="$2"; shift 2;; http*) url="$1"; shift;; *) shift;; esac; done
current="$(cat "$FIXVOX_CODE_RELEASE_TEST_ROOT/current-id")"
if [[ "${FAIL_TARGET:-0}" == "1" && "$current" == "${TEST_RELEASE_ID:-}" ]]; then exit 22; fi
if [[ "$url" == */health ]]; then printf '{"ok":true,"service":"fixvox-api"}\n' > "$out"; else printf '{"ok":true,"database":true,"schema":true,"jobs":true,"authorityMode":"cloudflare-authority"}\n' > "$out"; fi
SH
chmod +x "$TMP/bin/"*

export FIXVOX_CODE_RELEASE_TESTING=1 FIXVOX_CODE_RELEASE_TEST_ROOT="$TMP" FIXVOX_CODE_RELEASE_TEST_BUN="$(command -v bun)"
export PATH="$TMP/bin:$PATH" TEST_RELEASE_ID="$release_id"
args=(--archive "$archive" --manifest "$manifest" --expected-current 650b4c8f6ed00a2a --rollback-release 650b4c8f6ed00a2a --receipt "$receipt")

if "$TMP/tool/code-release.sh" --execute "${args[@]}" >/dev/null 2>&1; then echo 'missing gate unexpectedly succeeded' >&2; exit 1; fi
"$TMP/tool/code-release.sh" --dry-run "${args[@]}" >/dev/null
"$TMP/tool/code-release.sh" --execute --approved-f3 "${args[@]}" >/dev/null
[[ "$(cat "$TMP/current-id")" == "$release_id" ]]
[[ "$(wc -l < "$TMP/restarts" | tr -d ' ')" == "1" ]]
[[ "$(stat -c '%a' "$receipt")" == "600" ]]
grep -q '"outcome": "succeeded"' "$receipt"

rm -rf "$TMP/root/releases/$release_id" "$receipt" "$TMP/restarts"
printf '650b4c8f6ed00a2a\n' > "$TMP/current-id"
export FAIL_TARGET=1
if "$TMP/tool/code-release.sh" --execute --approved-f3 "${args[@]}" >/dev/null 2>&1; then echo 'failed verification unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "$TMP/current-id")" == "650b4c8f6ed00a2a" ]]
[[ "$(wc -l < "$TMP/restarts" | tr -d ' ')" == "2" ]]
[[ "$(stat -c '%a' "$receipt")" == "600" ]]
grep -q '"outcome": "rolled_back"' "$receipt"
grep -q '"rollbackAttempted": true' "$receipt"
if grep -Eqi 'token|password|session|audio|transcript|provider payload' "$receipt"; then echo 'receipt privacy failure' >&2; exit 1; fi
printf 'code_release_smoke=ok success_restarts=1 rollback_path_restarts=2 receipt_mode=600 provider_calls=0\n'
