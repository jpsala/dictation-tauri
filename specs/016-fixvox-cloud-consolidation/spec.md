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
4. Docs identify this repo as the owner of the Tauri Cloud Worker, with `C:\dev\fixvox` legacy/reference only.
5. T021 remains green after any approved production cutover.
6. T022 proves signed-in Pro unlocks managed dictation and denied/basic signed-in policy fails closed before provider.

Status 2026-06-30: criteria met. Production Worker version after T022: `8218d344-adfc-467e-bd12-b4ad271e1826`.
