#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
OPS_DIR="$(cd "$TEST_DIR/.." && pwd -P)"
REPO_ROOT="$(cd "$OPS_DIR/../.." && pwd -P)"
BUN_BIN="${BUN_BIN:-bun}"
APPROVED_SOURCE="f5r1"
SOURCE_ARCHIVE="${SOURCE_ARCHIVE:-}"
SOURCE_MANIFEST="${SOURCE_MANIFEST:-}"

usage() {
  cat <<'EOF'
Usage: rollback-control-smoke.sh [--approved-source f5r1|provider-loopback]
                                 [--source-archive PATH] [--source-manifest PATH]
Runs two independent control builds, compares every runtime path/hash, checks
privacy/allowlist metadata, and boots one candidate from an isolated extraction.
The provider-loopback profile also verifies the extracted main entrypoint with
provider config, a fixture key and real readiness against isolated fixvox_test.
EOF
}

fail() {
  printf 'rollback control smoke failed: %s\n' "$*" >&2
  exit 1
}

while (($#)); do
  case "$1" in
    --approved-source)
      (($# >= 2)) || fail "--approved-source needs a value"
      APPROVED_SOURCE="$2"
      shift 2
      ;;
    --source-archive)
      (($# >= 2)) || fail "--source-archive needs a value"
      SOURCE_ARCHIVE="$2"
      shift 2
      ;;
    --source-manifest)
      (($# >= 2)) || fail "--source-manifest needs a value"
      SOURCE_MANIFEST="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

case "$APPROVED_SOURCE" in
  f5r1)
    SOURCE_RELEASE_ID="9afa5dc85b783793"
    SOURCE_ARCHIVE_SHA256="9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d"
    SOURCE_MANIFEST_SHA256="62969be6d7fbef3c99f019f9f9cb26d54a97fecdf2832e8a8ca8d998e71dd6e8"
    ;;
  provider-loopback)
    SOURCE_RELEASE_ID="4075da53c365a8b1"
    SOURCE_ARCHIVE_SHA256="4075da53c365a8b1fa93bba16899a8c097d8a1378e7d1753ce9606592f5f914a"
    SOURCE_MANIFEST_SHA256="afb6da329985328a6ffaee7ce6b1ef4a891c13f5bc5d94a9d458102f79efb7b7"
    ;;
  *) fail "unknown approved source profile: $APPROVED_SOURCE" ;;
esac
SOURCE_ARCHIVE="${SOURCE_ARCHIVE:-$REPO_ROOT/artifacts/fixvox-api-bundles/fixvox-api-${SOURCE_RELEASE_ID}.tar.gz}"
SOURCE_MANIFEST="${SOURCE_MANIFEST:-$REPO_ROOT/artifacts/fixvox-api-bundles/fixvox-api-${SOURCE_RELEASE_ID}.manifest.json}"

[[ -f "$SOURCE_ARCHIVE" ]] || fail "approved source archive is missing"
[[ -f "$SOURCE_MANIFEST" ]] || fail "approved source manifest is missing"
[[ "$(sha256sum "$SOURCE_ARCHIVE" | awk '{print $1}')" == "$SOURCE_ARCHIVE_SHA256" ]] || fail "source archive SHA mismatch"
[[ "$(sha256sum "$SOURCE_MANIFEST" | awk '{print $1}')" == "$SOURCE_MANIFEST_SHA256" ]] || fail "source manifest SHA mismatch"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fixvox-rollback-control-smoke.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/one" "$TMP_DIR/two" "$TMP_DIR/source" "$TMP_DIR/candidate"

# The only builder input is the approved archive+manifest. In particular, this
# smoke never invokes bundle.sh and never supplies the checkout as a source.
bash "$OPS_DIR/rollback-control.sh" \
  --approved-source "$APPROVED_SOURCE" \
  --source-archive "$SOURCE_ARCHIVE" \
  --source-manifest "$SOURCE_MANIFEST" \
  --output-dir "$TMP_DIR/one" >/dev/null
bash "$OPS_DIR/rollback-control.sh" \
  --approved-source "$APPROVED_SOURCE" \
  --source-archive "$SOURCE_ARCHIVE" \
  --source-manifest "$SOURCE_MANIFEST" \
  --output-dir "$TMP_DIR/two" >/dev/null

archive_one="$(find "$TMP_DIR/one" -maxdepth 1 -type f -name '*.tar.gz' -print -quit)"
archive_two="$(find "$TMP_DIR/two" -maxdepth 1 -type f -name '*.tar.gz' -print -quit)"
manifest_one="$(find "$TMP_DIR/one" -maxdepth 1 -type f -name '*.manifest.json' -print -quit)"
manifest_two="$(find "$TMP_DIR/two" -maxdepth 1 -type f -name '*.manifest.json' -print -quit)"
[[ -n "$archive_one" && -n "$archive_two" && -n "$manifest_one" && -n "$manifest_two" ]] || fail "independent build output is incomplete"

archive_one_sha="$(sha256sum "$archive_one" | awk '{print $1}')"
archive_two_sha="$(sha256sum "$archive_two" | awk '{print $1}')"
manifest_one_sha="$(sha256sum "$manifest_one" | awk '{print $1}')"
manifest_two_sha="$(sha256sum "$manifest_two" | awk '{print $1}')"
[[ "$archive_one_sha" == "$archive_two_sha" ]] || fail "independent control archive hashes diverge"
[[ "$manifest_one_sha" == "$manifest_two_sha" ]] || fail "independent control manifest hashes diverge"
[[ "$archive_one_sha" != "$SOURCE_ARCHIVE_SHA256" ]] || fail "control archive equals approved source"

control_release_id="$(basename "$archive_one" | sed -n 's/^fixvox-api-\([0-9a-f]\{16\}\)\.tar\.gz$/\1/p')"
[[ -n "$control_release_id" && "$control_release_id" != "$SOURCE_RELEASE_ID" ]] || fail "control release ID is not distinct"
[[ "$(basename "$manifest_one")" == "fixvox-api-${control_release_id}.manifest.json" ]] || fail "control manifest name does not match release ID"

"$BUN_BIN" -e '
  const manifest = JSON.parse(await Bun.file(process.argv[1]).text());
  const expectedArchiveSha = process.argv[2];
  const expectedSourceSha = process.argv[3];
  const expectedSourceManifestSha = process.argv[4];
  const expectedReleaseId = process.argv[5];
  const expectedSourceReleaseId = process.argv[6];
  if (manifest.schemaVersion !== 1 || manifest.purpose !== "rollback-control") throw new Error("unsafe_control_manifest");
  if (manifest.releaseId !== expectedReleaseId || manifest.archiveSha256 !== expectedArchiveSha) throw new Error("control_manifest_identity");
  if (manifest.sourceArchiveSha256 !== expectedSourceSha) throw new Error("control_manifest_source");
  if (!/^[0-9a-f]{64}$/.test(manifest.sourceManifestSha256) || manifest.sourceManifestSha256 !== expectedSourceManifestSha) throw new Error("control_manifest_source_manifest");
  if (manifest.sourceReleaseId !== expectedSourceReleaseId) throw new Error("control_manifest_source_release");
  if (manifest.sourceDateEpoch !== 946684800 || manifest.controlDateEpoch !== 946684801) throw new Error("control_manifest_epoch");
  if (!Array.isArray(manifest.files) || manifest.files.length < 3) throw new Error("control_manifest_files");
  for (const file of manifest.files) {
    if (!/^[A-Za-z0-9._/-]+$/.test(file.path) || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error("control_manifest_file");
  }
' -- "$manifest_one" "$archive_one_sha" "$SOURCE_ARCHIVE_SHA256" "$SOURCE_MANIFEST_SHA256" "$control_release_id" "$SOURCE_RELEASE_ID"

tar -xzf "$SOURCE_ARCHIVE" -C "$TMP_DIR/source"
tar -xzf "$archive_one" -C "$TMP_DIR/candidate"

validate_archive() {
  local archive="$1"
  local entries
  entries="$TMP_DIR/$(basename "$archive").entries"
  tar -tzf "$archive" > "$entries"
  while IFS= read -r entry; do
    normalized="${entry%/}"
    case "$normalized" in
      cloud|cloud/fixvox-api|cloud/fixvox-api/src|cloud/fixvox-api/migrations|cloud/fixvox-core|cloud/fixvox-core/src|\
      cloud/fixvox-api/package.json|cloud/fixvox-api/src/*|cloud/fixvox-api/migrations/*|cloud/fixvox-core/src/*) ;;
      *) fail "archive contains a non-allowlisted path: $entry" ;;
    esac
  done < "$entries"
  if grep -Eqi '(^|/)(fixvox-proxy|test|tests|__tests__|artifacts?|\.env|\.git|node_modules)(/|$)|\.(test|spec)\.[^/]+$' "$entries"; then
    fail "archive contains proxy/tests/.env/artifacts/secrets path"
  fi
  if tar -xOzf "$archive" 2>/dev/null | grep -Eqi 'AGE-SECRET-KEY-|-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}'; then
    fail "archive contains a secret sentinel"
  fi
}
validate_archive "$SOURCE_ARCHIVE"
validate_archive "$archive_one"

(cd "$TMP_DIR/source" && find cloud -type f -print | sort) > "$TMP_DIR/source.paths"
(cd "$TMP_DIR/candidate" && find cloud -type f -print | sort) > "$TMP_DIR/candidate.paths"
cmp -s "$TMP_DIR/source.paths" "$TMP_DIR/candidate.paths" || fail "source/candidate runtime path sets differ"

while IFS= read -r path; do
  source_sha="$(sha256sum "$TMP_DIR/source/$path" | awk '{print $1}')"
  candidate_sha="$(sha256sum "$TMP_DIR/candidate/$path" | awk '{print $1}')"
  [[ "$source_sha" == "$candidate_sha" ]] || fail "source/candidate runtime bytes differ: $path"
done < "$TMP_DIR/source.paths"

# archive-boot-smoke.sh is passed the candidate explicitly; its isolated cwd
# and NODE_PATH guard prevent a fallback to checkout/node_modules.
boot_args=(--archive "$archive_one" --manifest "$manifest_one")
boot_result="health-200"
if [[ "$APPROVED_SOURCE" == "provider-loopback" ]]; then
  boot_args+=(--provider-configured-fixture)
  boot_result="health-200,readiness-200,provider-calls-0"
fi
bash "$TEST_DIR/archive-boot-smoke.sh" "${boot_args[@]}" >/dev/null

runtime_path_count="$(wc -l < "$TMP_DIR/source.paths" | tr -d '[:space:]')"
printf 'rollback_control_smoke=ok approved_source=%s source_sha256=%s source_manifest_sha256=%s control_sha256=%s control_manifest_sha256=%s control_release_id=%s runtime_paths=%s builds=2 boot=%s cleanup=ok\n' \
  "$APPROVED_SOURCE" "$SOURCE_ARCHIVE_SHA256" "$SOURCE_MANIFEST_SHA256" "$archive_one_sha" "$manifest_one_sha" "$control_release_id" "$runtime_path_count" "$boot_result"
