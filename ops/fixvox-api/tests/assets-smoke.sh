#!/usr/bin/env bash
set -euo pipefail
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_DIR="$(cd "$TEST_DIR/.." && pwd)"
REPO_ROOT="$(cd "$OPS_DIR/../.." && pwd)"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/fixvox-assets-smoke.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

scripts=(bundle preflight provision deploy service health health-f4 readiness status logs maintenance backup operations restore-rehearsal)
for script in "${scripts[@]}"; do
  bash -n "$OPS_DIR/$script.sh"
  bash "$OPS_DIR/$script.sh" --dry-run >/dev/null
done
bash -n "$OPS_DIR/lib.sh"
grep -Fq 'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;' "$OPS_DIR/provision.sh"
grep -Fq 'REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;' "$OPS_DIR/provision.sh"
# Assertions intentionally match literal shell source.
# shellcheck disable=SC2016
grep -Fq '[[ "$migrator_password" =~ ^[0-9a-f]{64}$ ]]' "$OPS_DIR/provision.sh"
# shellcheck disable=SC2016
grep -Fq '[[ "$runtime_password" =~ ^[0-9a-f]{64}$ ]]' "$OPS_DIR/provision.sh"
grep -Fq 'password=%s\n' "$OPS_DIR/provision.sh"
grep -Fq 'cloud/fixvox-api/migrations/[A-Za-z0-9._/-]+' "$OPS_DIR/deploy.sh"
# Match literal variables in the reviewed service source.
# shellcheck disable=SC2016
grep -Fq 'install -m 0755 "$SCRIPT_DIR/health.sh" "$FIXVOX_BIN_DIR/fixvox-api-health"' "$OPS_DIR/service.sh"
if grep -Fq 'pg_quote' "$OPS_DIR/provision.sh"; then
  echo "libpq password quoting regression" >&2
  exit 1
fi
if grep -Fq 'fixvox-api-backup' "$OPS_DIR/service.sh"; then
  echo "F3 service must not install F4 backup wrapper" >&2
  exit 1
fi
grep -Fq 'flock -n 9' "$OPS_DIR/maintenance.sh"
grep -Fq 'flock -n 9' "$OPS_DIR/backup.sh"
grep -Fq 'pg_dump --format=custom' "$OPS_DIR/backup.sh"
grep -Fq 'age -r "$FIXVOX_BACKUP_AGE_RECIPIENT"' "$OPS_DIR/backup.sh"
grep -Fq 'RandomizedDelaySec=15m' "$OPS_DIR/templates/fixvox-api-maintenance.timer"
grep -Fq 'RandomizedDelaySec=30m' "$OPS_DIR/templates/fixvox-api-backup.timer"
grep -Fq 'cloudflare-authority' "$OPS_DIR/backup.sh"
if grep -Fq -- '-i ' "$OPS_DIR/backup.sh"; then
  echo "backup wrapper must not use a private age identity" >&2
  exit 1
fi

if bash "$OPS_DIR/provision.sh" --execute >/dev/null 2>&1; then
  echo "provision execution gate failed closed check" >&2
  exit 1
fi
if bash "$OPS_DIR/deploy.sh" --execute --approved-f2 >/dev/null 2>&1; then
  echo "wrong approval gate check failed" >&2
  exit 1
fi
install_only="$(bash "$OPS_DIR/deploy.sh" --dry-run --install-only)"
grep -Fq 'promote=false' <<<"$install_only"
if grep -Fq 'promotion: atomic current symlink' <<<"$install_only"; then
  echo "install-only deploy must not promote current" >&2
  exit 1
fi

mkdir -p "$tmp/one" "$tmp/two"
bash "$OPS_DIR/bundle.sh" --execute --approved-f1 --repo-root "$REPO_ROOT" --output-dir "$tmp/one" >/dev/null
bash "$OPS_DIR/bundle.sh" --execute --approved-f1 --repo-root "$REPO_ROOT" --output-dir "$tmp/two" >/dev/null
archive_one="$(find "$tmp/one" -maxdepth 1 -name '*.tar.gz' -print -quit)"
archive_two="$(find "$tmp/two" -maxdepth 1 -name '*.tar.gz' -print -quit)"
manifest_one="$(find "$tmp/one" -maxdepth 1 -name '*.manifest.json' -print -quit)"
manifest_two="$(find "$tmp/two" -maxdepth 1 -name '*.manifest.json' -print -quit)"
[[ -n "$archive_one" && -n "$archive_two" && -n "$manifest_one" && -n "$manifest_two" ]]
[[ "$(basename "$archive_one")" == "$(basename "$archive_two")" ]]
[[ "$(sha256sum "$archive_one" | awk '{print $1}')" == "$(sha256sum "$archive_two" | awk '{print $1}')" ]]
[[ "$(sha256sum "$manifest_one" | awk '{print $1}')" == "$(sha256sum "$manifest_two" | awk '{print $1}')" ]]

mkdir -p "$tmp/hidden-repo/cloud/fixvox-api" "$tmp/hidden-repo/cloud/fixvox-core"
cp "$REPO_ROOT/cloud/fixvox-api/package.json" "$tmp/hidden-repo/cloud/fixvox-api/package.json"
cp -R "$REPO_ROOT/cloud/fixvox-api/src" "$REPO_ROOT/cloud/fixvox-api/migrations" "$tmp/hidden-repo/cloud/fixvox-api/"
cp -R "$REPO_ROOT/cloud/fixvox-core/src" "$tmp/hidden-repo/cloud/fixvox-core/"
mkdir -p "$tmp/hidden-repo/cloud/fixvox-api/src/.codemapper/cache"
printf 'must-not-ship\n' > "$tmp/hidden-repo/cloud/fixvox-api/src/.codemapper/cache/sentinel"
mkdir -p "$tmp/hidden-output"
bash "$OPS_DIR/bundle.sh" --execute --approved-f1 --repo-root "$tmp/hidden-repo" --output-dir "$tmp/hidden-output" >/dev/null
hidden_archive="$(find "$tmp/hidden-output" -maxdepth 1 -name '*.tar.gz' -print -quit)"
if tar -tzf "$hidden_archive" | grep -Eq '(^|/)\.'; then
  echo "hidden/cache runtime bundle content" >&2
  exit 1
fi

while IFS= read -r entry; do
  normalized="${entry%/}"
  [[ "$normalized" == "cloud" \
    || "$normalized" == "cloud/fixvox-api" \
    || "$normalized" == "cloud/fixvox-core" \
    || "$normalized" == "cloud/fixvox-api/package.json" \
    || "$normalized" == "cloud/fixvox-api/src" \
    || "$normalized" == "cloud/fixvox-api/migrations" \
    || "$normalized" == "cloud/fixvox-core/src" \
    || "$normalized" =~ ^cloud/fixvox-api/src/[A-Za-z0-9._/-]+$ \
    || "$normalized" =~ ^cloud/fixvox-api/migrations/[A-Za-z0-9._/-]+$ \
    || "$normalized" =~ ^cloud/fixvox-core/src/[A-Za-z0-9._/-]+$ ]] || {
      printf 'non-allowlisted archive path: %s\n' "$entry" >&2
      exit 1
    }
done < <(tar -tzf "$archive_one")
if tar -tzf "$archive_one" | grep -Eqi '(^|/)(\.env|tests?|__tests__|artifacts?|\.git)(/|$)|\.(test|spec)\.[^/]+$'; then
  echo "forbidden runtime bundle content" >&2
  exit 1
fi
if tar -xOzf "$archive_one" 2>/dev/null | grep -Eqi 'AGE-SECRET-KEY-|-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----'; then
  echo "secret sentinel rejected runtime bundle" >&2
  exit 1
fi

BUN_BIN="${BUN_BIN:-bun}"
"$BUN_BIN" -e '
  const manifest = JSON.parse(await Bun.file(process.argv[1]).text());
  if (!/^[0-9a-f]{16}$/.test(manifest.releaseId)) throw new Error("bad_release_id");
  if (!/^[0-9a-f]{64}$/.test(manifest.archiveSha256)) throw new Error("bad_archive_hash");
  if (!Array.isArray(manifest.files) || manifest.files.length < 3) throw new Error("bad_file_manifest");
  const roots = new Set(manifest.contentRoots);
  for (const root of [
    "cloud/fixvox-api/package.json",
    "cloud/fixvox-api/src",
    "cloud/fixvox-api/migrations",
    "cloud/fixvox-core/src",
  ]) {
    if (!roots.has(root)) throw new Error("missing_content_root");
  }
' -- "$manifest_one"

printf 'assets_smoke=ok archive_sha256=%s\n' "$(sha256sum "$archive_one" | awk '{print $1}')"
