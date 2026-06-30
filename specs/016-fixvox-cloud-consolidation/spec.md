# Spec: Fixvox Cloud Consolidation Into Dictation Tauri

## Goal

Make `C:\dev\dictation-tauri` the owner of the Fixvox Tauri desktop client **and** the Fixvox Cloud Worker used by that client, so future work does not depend on `C:\dev\fixvox` for the new product surface.

## Scope

- Bring the current Fixvox Cloud Worker source into this repo under `cloud/fixvox-proxy/`.
- Preserve the existing production contract for `auth-fixvox.jpsala.dev`.
- Keep deploy/push gated by explicit JP approval.
- Keep secrets out of git (`.dev.vars`, `.env*`, tokens, invite codes, account IDs).
- Document a staged cutover from `C:\dev\fixvox` to this repo.

## Non-goals

- No production deploy without explicit approval.
- No deletion or archival of `C:\dev\fixvox` in this spec.
- No rewrite of the Worker architecture during the initial copy.
- No migration of legacy desktop/Electrobun app code unless a later spec asks for it.

## Acceptance Criteria

1. `cloud/fixvox-proxy/` contains the Worker source, tests, `wrangler.toml`, and package metadata needed to test/deploy from this repo.
2. Root npm scripts expose cloud test/dev/deploy entrypoints.
3. Provider-free cloud tests pass from this repo.
4. Docs identify this repo as the intended future owner of the Tauri Cloud Worker, with production cutover status explicit.
5. T021 remains green after any approved production cutover.
