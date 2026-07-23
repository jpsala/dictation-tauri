#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage: bundle.sh [--dry-run | --execute --approved-f1] [--repo-root PATH] [--output-dir PATH]
Builds a reproducible runtime-only archive and deterministic hash manifest.
EOF
}

repo_root="$(pwd -P)"
output_dir="$repo_root/artifacts/fixvox-api-bundles"
init_args f1 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --repo-root) ((++i < ${#args[@]})) || fail "--repo-root needs a value"; repo_root="${args[$i]}" ;;
    --output-dir) ((++i < ${#args[@]})) || fail "--output-dir needs a value"; output_dir="${args[$i]}" ;;
    --help) usage; exit 0 ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done
require_linux_absolute "$repo_root" "repo root"
require_linux_absolute "$output_dir" "output directory"
repo_root="$(cd "$repo_root" && pwd -P)"
[[ -f "$repo_root/cloud/fixvox-api/package.json" ]] || fail "missing fixvox-api package.json"
[[ -d "$repo_root/cloud/fixvox-api/src" ]] || fail "missing fixvox-api src"
[[ -d "$repo_root/cloud/fixvox-api/migrations" ]] || fail "missing fixvox-api migrations"
[[ -d "$repo_root/cloud/fixvox-core/src" ]] || fail "missing fixvox-core src"

note "fixvox-api bundle: mode=$MODE"
note "content roots: cloud/fixvox-api/package.json, cloud/fixvox-api/src, cloud/fixvox-api/migrations, cloud/fixvox-core/src"
if [[ "$MODE" == "dry-run" ]]; then
  note "output: runtime archive + deterministic manifest (path validated; content not created)"
  exit 0
fi

mkdir -p "$output_dir"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/fixvox-api-bundle.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
stage="$work_dir/stage"
mkdir -p "$stage/cloud/fixvox-api" "$stage/cloud/fixvox-core"
cp "$repo_root/cloud/fixvox-api/package.json" "$stage/cloud/fixvox-api/package.json"
cp -R "$repo_root/cloud/fixvox-api/src" "$stage/cloud/fixvox-api/src"
cp -R "$repo_root/cloud/fixvox-api/migrations" "$stage/cloud/fixvox-api/migrations"
cp -R "$repo_root/cloud/fixvox-core/src" "$stage/cloud/fixvox-core/src"

find "$stage/cloud" -type f \( -name '*.test.*' -o -name '*.spec.*' \) -delete
find "$stage/cloud" -type d \( -name test -o -name tests -o -name __tests__ -o -name .codemapper \) -prune -exec rm -rf {} +

mapfile -d '' files < <(cd "$stage" && find cloud -type f -print0 | sort -z)
((${#files[@]} > 2)) || fail "runtime allowlist is unexpectedly empty"
for file in "${files[@]}"; do
  [[ "$file" =~ ^cloud/fixvox-api/package\.json$|^cloud/fixvox-api/src/[A-Za-z0-9._/-]+$|^cloud/fixvox-api/migrations/[A-Za-z0-9._/-]+$|^cloud/fixvox-core/src/[A-Za-z0-9._/-]+$ ]] \
    || fail "bundle contains non-allowlisted path: $file"
  [[ ! "$file" =~ (^|/)\.|(^|/)(test|tests|__tests__)(/|$)|\.(test|spec)\.[^/]+$ ]] \
    || fail "bundle contains hidden/cache/test path: $file"
done

archive_tmp="$work_dir/fixvox-api.tar.gz"
(
  cd "$stage"
  tar --format=gnu --sort=name --mtime='@946684800' --owner=0 --group=0 --numeric-owner -cf - cloud \
    | gzip -n > "$archive_tmp"
)
archive_sha="$(sha256sum "$archive_tmp" | awk '{print $1}')"
release_id="${archive_sha:0:16}"
archive_name="fixvox-api-${release_id}.tar.gz"
manifest_name="fixvox-api-${release_id}.manifest.json"
archive_path="$output_dir/$archive_name"
manifest_path="$output_dir/$manifest_name"

mv "$archive_tmp" "$archive_path"
{
  printf '{\n'
  printf '  "schemaVersion": 1,\n'
  printf '  "releaseId": "%s",\n' "$release_id"
  printf '  "archive": "%s",\n' "$archive_name"
  printf '  "archiveSha256": "%s",\n' "$archive_sha"
  printf '  "sourceDateEpoch": 946684800,\n'
  printf '  "contentRoots": ["cloud/fixvox-api/package.json", "cloud/fixvox-api/src", "cloud/fixvox-api/migrations", "cloud/fixvox-core/src"],\n'
  printf '  "files": [\n'
  for ((i=0; i<${#files[@]}; i++)); do
    file="${files[$i]}"
    file_sha="$(sha256sum "$stage/$file" | awk '{print $1}')"
    comma=','; ((i == ${#files[@]} - 1)) && comma=''
    printf '    {"path": "%s", "sha256": "%s"}%s\n' "$file" "$file_sha" "$comma"
  done
  printf '  ]\n'
  printf '}\n'
} > "$manifest_path"
chmod 0644 "$archive_path" "$manifest_path"
printf 'release_id=%s\narchive=%s\nmanifest=%s\nsha256=%s\n' \
  "$release_id" "$archive_path" "$manifest_path" "$archive_sha"
