#!/usr/bin/env bash
set -euo pipefail

# Repackage only an already-approved archive. This script deliberately has no
# checkout/source-root input: F5R1 must never rebuild from a dirty workspace.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
BUN_BIN="${BUN_BIN:-bun}"
# One second after each approved archive's normalized epoch makes its control
# archive distinct while keeping every extracted runtime byte unchanged.
CONTROL_DATE_EPOCH="946684801"

usage() {
  cat <<'EOF'
Usage: rollback-control.sh [--approved-source f5r1|provider-loopback]
                           [--source-archive PATH] [--source-manifest PATH]
                           [--output-dir PATH]

Builds deterministic rollback-control artifacts from one closed, approved
archive profile. The historical f5r1 profile remains the default. Runtime bytes
are never read from this checkout.
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

approved_source="f5r1"
source_archive=""
source_manifest=""
output_dir="$REPO_ROOT/artifacts/fixvox-api-rollback-control"

while (($#)); do
  case "$1" in
    --approved-source)
      (($# >= 2)) || fail "--approved-source needs a value"
      approved_source="$2"
      shift 2
      ;;
    --source-archive)
      (($# >= 2)) || fail "--source-archive needs a value"
      source_archive="$2"
      shift 2
      ;;
    --source-manifest)
      (($# >= 2)) || fail "--source-manifest needs a value"
      source_manifest="$2"
      shift 2
      ;;
    --output-dir)
      (($# >= 2)) || fail "--output-dir needs a value"
      output_dir="$2"
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

case "$approved_source" in
  f5r1)
    EXPECTED_SOURCE_ARCHIVE_SHA256="9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d"
    EXPECTED_SOURCE_MANIFEST_SHA256="62969be6d7fbef3c99f019f9f9cb26d54a97fecdf2832e8a8ca8d998e71dd6e8"
    EXPECTED_SOURCE_RELEASE_ID="9afa5dc85b783793"
    ;;
  provider-loopback)
    EXPECTED_SOURCE_ARCHIVE_SHA256="4075da53c365a8b1fa93bba16899a8c097d8a1378e7d1753ce9606592f5f914a"
    EXPECTED_SOURCE_MANIFEST_SHA256="afb6da329985328a6ffaee7ce6b1ef4a891c13f5bc5d94a9d458102f79efb7b7"
    EXPECTED_SOURCE_RELEASE_ID="4075da53c365a8b1"
    ;;
  *) fail "unknown approved source profile: $approved_source" ;;
esac
EXPECTED_SOURCE_DATE_EPOCH="946684800"
DEFAULT_SOURCE_ARCHIVE="$REPO_ROOT/artifacts/fixvox-api-bundles/fixvox-api-${EXPECTED_SOURCE_RELEASE_ID}.tar.gz"
DEFAULT_SOURCE_MANIFEST="$REPO_ROOT/artifacts/fixvox-api-bundles/fixvox-api-${EXPECTED_SOURCE_RELEASE_ID}.manifest.json"
source_archive="${source_archive:-$DEFAULT_SOURCE_ARCHIVE}"
source_manifest="${source_manifest:-$DEFAULT_SOURCE_MANIFEST}"

resolve_file() {
  local value="$1"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "path contains a newline"
  if [[ "$value" != /* ]]; then
    value="$(pwd -P)/$value"
  fi
  local parent
  parent="$(dirname "$value")"
  [[ -d "$parent" ]] || fail "parent directory is missing: $parent"
  printf '%s/%s\n' "$(cd "$parent" && pwd -P)" "$(basename "$value")"
}

source_archive="$(resolve_file "$source_archive")"
source_manifest="$(resolve_file "$source_manifest")"
[[ -f "$source_archive" ]] || fail "approved source archive is missing"
[[ -f "$source_manifest" ]] || fail "approved source manifest is missing"
[[ "$source_archive" != "$source_manifest" ]] || fail "archive and manifest must be distinct files"

mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd -P)"

archive_sha="$(sha256sum "$source_archive" | awk '{print $1}')"
[[ "$archive_sha" == "$EXPECTED_SOURCE_ARCHIVE_SHA256" ]] || fail "source archive SHA-256 is not approved for profile $approved_source"
manifest_sha="$(sha256sum "$source_manifest" | awk '{print $1}')"
[[ "$manifest_sha" == "$EXPECTED_SOURCE_MANIFEST_SHA256" ]] || fail "source manifest SHA-256 is not the approved manifest"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/fixvox-rollback-control.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
source_stage="$work_dir/source"
mkdir -p "$source_stage"

expected_files="$work_dir/expected-files.tsv"
"$BUN_BIN" -e '
  const manifest = JSON.parse(await Bun.file(process.argv[1]).text());
  const expectedManifestSha = process.argv[2];
  const expectedArchiveSha = process.argv[3];
  const expectedArchiveName = process.argv[4];
  const expectedReleaseId = process.argv[5];
  const expectedRoots = [
    "cloud/fixvox-api/package.json",
    "cloud/fixvox-api/src",
    "cloud/fixvox-api/migrations",
    "cloud/fixvox-core/src",
  ];
  if (manifest.schemaVersion !== 1) throw new Error("source_manifest_schema");
  if (manifest.releaseId !== expectedReleaseId) throw new Error("source_manifest_release");
  if (manifest.archive !== expectedArchiveName) throw new Error("source_manifest_archive");
  if (manifest.archiveSha256 !== expectedArchiveSha) throw new Error("source_manifest_archive_sha");
  if (manifest.sourceDateEpoch !== Number(process.argv[6])) throw new Error("source_manifest_epoch");
  if (JSON.stringify(manifest.contentRoots) !== JSON.stringify(expectedRoots)) {
    throw new Error("source_manifest_roots");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("source_manifest_files");
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !/^[A-Za-z0-9._/-]+$/.test(file.path)) {
      throw new Error("source_manifest_path");
    }
    if (!/^cloud\/(?:fixvox-api\/(?:package\.json|src\/[A-Za-z0-9._/-]+|migrations\/[A-Za-z0-9._/-]+)|fixvox-core\/src\/[A-Za-z0-9._/-]+)$/.test(file.path)) {
      throw new Error(`source_manifest_allowlist:${file.path}`);
    }
    if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error("source_manifest_file_sha");
    if (seen.has(file.path)) throw new Error("source_manifest_duplicate_path");
    seen.add(file.path);
    console.log(`${file.path}\t${file.sha256}`);
  }
' -- "$source_manifest" "$manifest_sha" "$archive_sha" "$(basename "$source_archive")" "$EXPECTED_SOURCE_RELEASE_ID" "$EXPECTED_SOURCE_DATE_EPOCH" > "$expected_files"

archive_entries="$work_dir/source.entries"
archive_verbose="$work_dir/source.verbose"
tar -tzf "$source_archive" > "$archive_entries"
tar -tvzf "$source_archive" > "$archive_verbose"

while IFS= read -r entry; do
  [[ -n "$entry" ]] || fail "source archive has an empty entry"
  normalized="${entry%/}"
  [[ "$normalized" != /* && "$normalized" != *".."* ]] || fail "source archive has an unsafe path"
  case "$normalized" in
    cloud|cloud/fixvox-api|cloud/fixvox-api/src|cloud/fixvox-api/migrations|cloud/fixvox-core|cloud/fixvox-core/src|\
    cloud/fixvox-api/package.json|cloud/fixvox-api/src/*|cloud/fixvox-api/migrations/*|cloud/fixvox-core/src/*) ;;
    *) fail "source archive contains a non-allowlisted path: $entry" ;;
  esac
done < "$archive_entries"

while IFS= read -r line; do
  mode="${line%% *}"
  [[ "$mode" == d* || "$mode" == -* ]] || fail "source archive contains a link or special file"
done < "$archive_verbose"

if grep -Eqi '(^|/)(fixvox-proxy|test|tests|__tests__|artifacts?|\.env|\.git|node_modules)(/|$)|\.(test|spec)\.[^/]+$' "$archive_entries"; then
  fail "source archive contains a forbidden path"
fi

tar --no-same-owner --no-same-permissions -xzf "$source_archive" -C "$source_stage"
[[ -d "$source_stage/cloud" ]] || fail "source archive did not extract a cloud root"
if find "$source_stage/cloud" \( -type l -o -type b -o -type c -o -type p \) -print -quit | grep -q .; then
  fail "source archive extracted a link or special file"
fi

cut -f1 "$expected_files" | sort > "$work_dir/expected-paths"
(cd "$source_stage" && find cloud -type f -print | sort) > "$work_dir/actual-paths"
cmp -s "$work_dir/expected-paths" "$work_dir/actual-paths" || fail "source archive paths do not match its manifest"

while IFS=$'\t' read -r path expected_sha; do
  [[ -n "$path" && -n "$expected_sha" ]] || fail "source manifest contains a malformed file row"
  [[ -f "$source_stage/$path" ]] || fail "manifest file is absent from source archive: $path"
  actual_sha="$(sha256sum "$source_stage/$path" | awk '{print $1}')"
  [[ "$actual_sha" == "$expected_sha" ]] || fail "source file hash mismatch: $path"
done < "$expected_files"

if grep -R -E -I -n -m1 'AGE-SECRET-KEY-|-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}' "$source_stage/cloud" >/dev/null; then
  fail "source archive contains a secret sentinel"
fi

archive_tmp="$work_dir/control.tar.gz"
(
  cd "$source_stage"
  tar --format=gnu --sort=name --mtime="@${CONTROL_DATE_EPOCH}" --owner=0 --group=0 --numeric-owner -cf - cloud \
    | gzip -n > "$archive_tmp"
)
control_sha="$(sha256sum "$archive_tmp" | awk '{print $1}')"
[[ "$control_sha" != "$EXPECTED_SOURCE_ARCHIVE_SHA256" ]] || fail "control archive did not differ from source"
control_release_id="${control_sha:0:16}"
[[ "$control_release_id" != "$EXPECTED_SOURCE_RELEASE_ID" ]] || fail "control release ID did not differ from source"
control_archive_name="fixvox-api-${control_release_id}.tar.gz"
control_manifest_name="fixvox-api-${control_release_id}.manifest.json"
control_archive="$output_dir/$control_archive_name"
control_manifest="$output_dir/$control_manifest_name"

mv "$archive_tmp" "$control_archive"
{
  printf '{\n'
  printf '  "schemaVersion": 1,\n'
  printf '  "purpose": "rollback-control",\n'
  printf '  "releaseId": "%s",\n' "$control_release_id"
  printf '  "archive": "%s",\n' "$control_archive_name"
  printf '  "archiveSha256": "%s",\n' "$control_sha"
  printf '  "sourceArchiveSha256": "%s",\n' "$EXPECTED_SOURCE_ARCHIVE_SHA256"
  printf '  "sourceManifestSha256": "%s",\n' "$EXPECTED_SOURCE_MANIFEST_SHA256"
  printf '  "sourceReleaseId": "%s",\n' "$EXPECTED_SOURCE_RELEASE_ID"
  printf '  "sourceDateEpoch": %s,\n' "$EXPECTED_SOURCE_DATE_EPOCH"
  printf '  "controlDateEpoch": %s,\n' "$CONTROL_DATE_EPOCH"
  printf '  "contentRoots": ["cloud/fixvox-api/package.json", "cloud/fixvox-api/src", "cloud/fixvox-api/migrations", "cloud/fixvox-core/src"],\n'
  printf '  "files": [\n'
  file_count="$(wc -l < "$expected_files" | tr -d '[:space:]')"
  index=0
  while IFS=$'\t' read -r path file_sha; do
    index=$((index + 1))
    comma=','
    [[ "$index" == "$file_count" ]] && comma=''
    printf '    {"path": "%s", "sha256": "%s"}%s\n' "$path" "$file_sha" "$comma"
  done < "$expected_files"
  printf '  ]\n'
  printf '}\n'
} > "$control_manifest"
chmod 0644 "$control_archive" "$control_manifest"

printf 'approved_source=%s\nsource_archive_sha256=%s\nsource_manifest_sha256=%s\ncontrol_date_epoch=%s\nrelease_id=%s\narchive=%s\nmanifest=%s\narchive_sha256=%s\n' \
  "$approved_source" "$EXPECTED_SOURCE_ARCHIVE_SHA256" "$EXPECTED_SOURCE_MANIFEST_SHA256" "$CONTROL_DATE_EPOCH" \
  "$control_release_id" "$control_archive" "$control_manifest" "$control_sha"
