# Spec 019 — Checkpoint B Lean Loop execution plan

## Context

Execute only Spec 019 Checkpoint B (`T007–T012`) under Lean Checkpoint Loop v0.1. The checkpoint is **L1** because it extracts shared architecture/ports while preserving the existing Worker API and behavior. Authorization is local-only and `if-green`; hard stop before `T013`/Checkpoint C. No installs, real providers, secrets, production/deploy, real data, or out-of-scope changes.

The worktree is already substantially dirty (67 modified and 15 untracked paths). Relevant pre-existing work includes Checkpoint A's untracked Spec 019/contract fixtures and modifications to proxy source/tests/package metadata. Before B edits, capture path status plus tracked diff and hashes of relevant untracked files to a temporary location outside the repo; use that baseline to preserve unrelated changes and report only the B delta.

## Approach

- Use one capable owner and a bounded Checkpoint B context capsule.
- Treat the existing generic `KvNamespaceLike` seam as an adapter primitive, not the final domain contract. Define explicit core ports named by responsibility (`ControlPlaneRepository`, `ProfilePublicationRepository`, `UsageQuotaRepository`, `AuthSessionRepository`, `RequestEventRepository`, `Clock`, `IdGenerator`, `ProviderGateway`, `BackgroundJobScheduler`). Their signatures must use Web/TypeScript/domain values only—no `Env`, KV, Durable Object, or `cloudflare:workers` types.
- `cloud/fixvox-core/` does not exist yet and the repo has no workspace/package wiring for it. Create it as source-only TypeScript imported by relative paths from the existing Worker so Checkpoint B adds no package manifest, dependency, install, or lockfile change; prove Wrangler can bundle those cross-directory imports in the closing dry-run.
- Move platform-neutral policy/profile and store logic into `fixvox-core` in bounded slices. Keep compatibility re-exports in `fixvox-proxy` only where they preserve existing imports/tests; re-exports contain no business authority.
- Keep Cloudflare-only code (`Env`, KV/DO namespace construction, Durable Object classes, Worker `fetch`/`scheduled`) in `fixvox-proxy`, implementing/delegating to the core ports. Inject clock/ID/fetch/provider/job dependencies where current core candidates call `new Date`, `crypto.randomUUID`, or global `fetch`.
- Extract behavior incrementally by bounded slice, preserving all HTTP fixtures and production composition. The first slice is read-only effective profile/engine resolution; later slices cover device binding, publication, auth sessions, quota/preflight, providers/jobs, request events, and Admin use cases.
- Run cheap focused tests after each slice; run cloud/contract/dry-run only once at checkpoint close (rerun only after a repair).
- Apply at most two materially distinct local repairs per concrete failure. Invoke a read-only advisor only on the documented L1 triggers; otherwise stop with evidence when budget/scope is exceeded.
- Update only Checkpoint B task/evidence documentation after deterministic proof, then hard-stop before Checkpoint C.

## Files to modify

Expected paths:

- `cloud/fixvox-core/src/ports/**` — new responsibility-specific platform-neutral interfaces plus shared storage/clock/ID/provider/job types.
- `cloud/fixvox-core/src/control-plane/**`, `auth/**`, `execution/**`, `providers/**`, `jobs/**` — new source-only extracted use cases and policy logic (no new `package.json` or dependency wiring in B).
- `cloud/fixvox-core/src/**/*.test.ts` — direct provider-free core tests proving the extracted code has no Cloudflare runtime dependency.
- `cloud/fixvox-proxy/src/index.ts` — Worker routing/composition only.
- `cloud/fixvox-proxy/src/control-plane-publish-lock.ts` and new/adjacent adapter modules — KV/DO/provider/scheduler implementations of core ports.
- Existing `cloud/fixvox-proxy/src/{control-plane-store,runtime-policy-store,recipe-policy-store,admin-store,pricing-*,provider-model-catalog,scheduled-tasks,support-channel}.ts` — convert to thin compatibility re-exports or adapter-only modules as appropriate; do not retain duplicate implementations.
- Existing adjacent `cloud/fixvox-proxy/src/*.test.ts` — preserve adapter/route coverage and adjust imports only as required.
- `specs/019-fixvox-self-hosted-control-plane/tasks.md` — mark only proven T007–T012 and record receipt/evidence.
- `specs/019-fixvox-self-hosted-control-plane/quickstart.md` — only if durable next-session state must reflect B completion/hard stop.

No Checkpoint C files, dependency/package/lockfile changes attributable to B, infrastructure, provider, deployment, or production artifacts. The pre-existing proxy package/lockfile diff must remain untouched.

## Reuse

- Existing `KvNamespaceLike` (`cloud/fixvox-proxy/src/admin-store.ts`) as the narrow Worker KV adapter shape; extend/rename it in core rather than inventing a Cloudflare mock API.
- Existing effective-profile/engine resolution, policy stores, device/preflight/Admin logic in `cloud/fixvox-proxy/src/control-plane-store.ts`; relocate the implementation instead of rewriting behavior.
- Existing provider-free memory KV/DO and mocked upstream harnesses in `cloud/fixvox-proxy/src/{contract-runner,managed-execution,control-plane-publish-lock}.test.ts`.
- Existing Worker handlers/business rules in `cloud/fixvox-proxy/src/index.ts` and neighboring modules; current `index.ts` directly imports the store modules, so those import points are the composition seams to redirect incrementally.
- Existing direct test imports of `control-plane-store`, `runtime-policy-store`, `recipe-policy-store`, and `admin-store`; compatibility re-exports can preserve them while authority moves.
- Provider-free Worker contract runner and fixtures in `tests/cloud-contract/`.
- Existing cloud test command: `npm run cloud:test`.
- Existing close contract command: `npm run test:pipeline -- tests/cloud-contract`.
- Existing no-deploy bundle check: `npx wrangler deploy --dry-run` from `cloud/fixvox-proxy`.
- Checkpoint A baseline/evidence and scope gates in `specs/019-fixvox-self-hosted-control-plane/{tasks.md,quickstart.md}`.

## Steps

- [ ] Snapshot/classify the pre-existing dirty state in B paths (Checkpoint A already modified/untracked proxy, fixture, and Spec 019 files); never revert or count those changes as B work.
- [ ] Create the source-only `cloud/fixvox-core/src/` boundary and define ports for control-plane storage, publication, quotas, auth sessions, request events, clock/IDs, providers, and jobs without Cloudflare types; add a test/import guard proving core does not reference `cloudflare:workers`, `Env`, KV, or Durable Object bindings.
- [ ] Extract one low-risk read-only effective policy/profile/engine-resolution slice and adapt KV composition, then run the directly related core/store tests.
- [ ] Extract remaining bounded slices in order: device binding; profiles/publication; auth sessions; preflight/quota; provider proxy and background jobs; request events/Admin. After each slice run only its directly related existing/core test files.
- [ ] Reduce `index.ts` to adapter/routing composition without changing request/response/schema behavior.
- [ ] Review the scoped diff for Cloudflare leakage, behavior drift, secrets, dependencies, and out-of-scope changes.
- [ ] Run the single closing cloud/contract/dry-run gate; repair only within budget and rerun only if justified.
- [ ] Mark only evidenced T007–T012, write the compact receipt/metrics/result, and stop before T013.

## Verification

Focused checks per slice use Bun's existing test runner from `cloud/fixvox-proxy` (and direct core test paths once created), for example:

- policy/profile: `bun test src/runtime-policy-store.test.ts src/control-plane-store.test.ts` with a narrow test-name filter where practical;
- device/auth/preflight/provider route composition: targeted tests in `src/managed-execution.test.ts`;
- publication: `bun test src/control-plane-publish-lock.test.ts`;
- request events/Admin: `bun test src/control-plane-store.test.ts src/pricing-admin.test.ts` with relevant filters;
- jobs/providers: `bun test src/scheduled-tasks.test.ts src/pricing-refresh.test.ts` plus new direct core tests.

These are representative groupings; each focused run must include only the files/filter affected by that slice, not `bun test src`.

Closing gate, once after all slices:

```text
npm run cloud:test
npm run test:pipeline -- tests/cloud-contract
cd cloud/fixvox-proxy && npx --no-install wrangler deploy --dry-run
```

Final mechanical checks:

- `fixvox-core` remains source-only/provider-free and the Worker dry-run proves its relative imports bundle without package/install changes;
- no API/schema/fixture drift;
- no deploy or real/provider/production calls;
- no dependency or lockfile additions attributable to B;
- no changes outside the approved B paths;
- all T007–T012 have direct evidence;
- receipt reports wall-clock elapsed time, tasks completed, focused/close command counts, suite reruns, failures/repairs, advisor triggers/results, human interruptions, changed-file count, out-of-scope count, remaining risks, and `Green | Yellow | Red`;
- hard stop before T013.
