# Plan: Fixvox Cloud Consolidation

## Strategy

Migrate in safe stages. First vendor/copy the Worker into this repo and prove tests run locally. Then make `dictation-tauri` the deploy source with explicit approval. Finally reduce `C:\dev\fixvox` to legacy/reference status for the new Tauri product.

Status 2026-06-30: all stages completed for the Tauri Cloud Worker. Production deploys for `auth-fixvox.jpsala.dev` now use `cloud/fixvox-proxy/` from this repo; `C:\dev\fixvox` is legacy/reference only for this product surface.

## Target Layout

- `cloud/fixvox-proxy/` — Cloudflare Worker source copied from `C:\dev\fixvox\proxy`.
- `cloud/fixvox-proxy/src/` — Worker routes, control-plane store, policy stores, pricing, tests.
- `cloud/fixvox-proxy/wrangler.toml` — production Worker/bindings config for `auth-fixvox.jpsala.dev`.
- root `package.json` scripts:
  - `cloud:test`
  - `cloud:dev`
  - `cloud:deploy` (gated, do not run without explicit approval)

## Stages

1. **Bootstrap copy**: copy Worker source/config excluding `node_modules`, `.wrangler`, `.dev.vars`; run provider-free tests.
2. **Docs + ownership**: update active track/spec/working memory so future sessions start here.
3. **Cutover deploy**: with JP approval, deploy `cloud/fixvox-proxy` from this repo and rerun T021.
4. **Legacy demotion**: document `C:\dev\fixvox` as legacy/reference for Tauri Cloud; no longer required for new endpoint work. **Done 2026-06-30.**
5. **Optional cleanup**: extract shared contracts/types if duplication appears between desktop and Worker.

## Risks

- Secrets in `.dev.vars` or local env accidentally copied: guarded by `.gitignore` and explicit exclusion.
- Divergence between copied Worker and production Worker before cutover: record deploy source and version IDs.
- Existing `C:\dev\fixvox` uncommitted generated-debug changes: do not touch/revert.
- Root dependency mismatch: `cloud/fixvox-proxy` keeps its own package metadata initially.

## Verification

- `npm run cloud:test`
- `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`
- `npm run build`
- `cd src-tauri && cargo fmt --check && CARGO_TARGET_DIR=target/pi-cloud-consolidation cargo check`
- After approved cutover: rerun T021 login/link smoke redacted.
