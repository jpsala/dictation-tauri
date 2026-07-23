#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib.sh"; [[ -f "$LIB" ]] || LIB="$SCRIPT_DIR/fixvox-api-lib.sh"
# shellcheck source=lib.sh
source "$LIB"

archive=""
manifest=""
promote="true"
init_args f3 "$@"
args=("${REMAINING_ARGS[@]}")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[$i]}" in
    --archive) ((++i < ${#args[@]})) || fail "--archive needs a value"; archive="${args[$i]}" ;;
    --manifest) ((++i < ${#args[@]})) || fail "--manifest needs a value"; manifest="${args[$i]}" ;;
    --install-only) promote="false" ;;
    *) fail "unknown argument: ${args[$i]}" ;;
  esac
done
assert_runtime_contract
note "fixvox-api deploy: mode=$MODE releases=$FIXVOX_RELEASES current=$FIXVOX_CURRENT promote=$promote"
if [[ "$MODE" == "dry-run" ]]; then
  note "steps: validate staging paths -> verify manifest/archive hash -> enforce tar allowlist -> immutable release"
  [[ "$promote" == "false" ]] || note "promotion: atomic current symlink"
  exit 0
fi

require_target_host
require_under "$archive" "$FIXVOX_STAGING" "archive"
require_under "$manifest" "$FIXVOX_STAGING" "manifest"
[[ -f "$archive" && -f "$manifest" ]] || fail "archive and manifest must exist"
manifest_sha="$(sed -n 's/^[[:space:]]*"archiveSha256": "\([0-9a-f]\{64\}\)",\{0,1\}$/\1/p' "$manifest")"
release_id="$(sed -n 's/^[[:space:]]*"releaseId": "\([0-9a-f]\{16\}\)",\{0,1\}$/\1/p' "$manifest")"
manifest_archive="$(sed -n 's/^[[:space:]]*"archive": "\([A-Za-z0-9._-]*\)",\{0,1\}$/\1/p' "$manifest")"
[[ "$manifest_sha" =~ ^[0-9a-f]{64}$ ]] || fail "manifest archive hash is missing or malformed"
[[ "$release_id" =~ ^[0-9a-f]{16}$ && "$release_id" == "${manifest_sha:0:16}" ]] || fail "manifest release ID does not match hash"
[[ "$manifest_archive" == "$(basename "$archive")" ]] || fail "manifest archive name does not match input"
actual_sha="$(sha256sum "$archive" | awk '{print $1}')"
[[ "$actual_sha" == "$manifest_sha" ]] || fail "archive hash mismatch"

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
    || "$normalized" =~ ^cloud/fixvox-core/src/[A-Za-z0-9._/-]+$ ]] \
    || fail "archive contains non-allowlisted path"
done < <(tar -tzf "$archive")
while IFS= read -r mode _; do
  [[ "${mode:0:1}" == "-" || "${mode:0:1}" == "d" ]] || fail "archive contains a link or special file"
done < <(tar -tvzf "$archive")

release_path="$FIXVOX_RELEASES/$release_id"
[[ ! -e "$release_path" ]] || fail "release already exists; immutable releases are never overwritten"
tmp_release="$FIXVOX_RELEASES/.${release_id}.tmp.$$"
trap 'rm -rf "${tmp_release:-}"' EXIT
mkdir -p "$tmp_release"
tar -xzf "$archive" -C "$tmp_release" --no-same-owner --no-same-permissions
cp "$manifest" "$tmp_release/release-manifest.json"
chmod -R a-w "$tmp_release"
mv "$tmp_release" "$release_path"
if [[ "$promote" == "true" ]]; then
  tmp_link="$FIXVOX_ROOT/.current.$$.tmp"
  ln -s "$release_path" "$tmp_link"
  mv -Tf "$tmp_link" "$FIXVOX_CURRENT"
fi
trap - EXIT
note "deploy=ok release_id=$release_id archive_sha256=$actual_sha promoted=$promote"
