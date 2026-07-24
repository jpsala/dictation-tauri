# Proxy Hot-Path Latency

## Objective

Reduce the Cloudflare audio transcription proxy overhead without weakening profile, engine, prompt, quota, or budget enforcement.

## Evidence

- Latest desktop run: proxy total 4401 ms, upstream 625 ms, compression 164 ms, postprocess disabled.
- Cloudflare `/health`: 42-62 ms warm.
- `proxyInitMs` currently includes the complete pre-upstream path and upstream call, so it hides roughly 3776 ms of control-plane work.
- Commit `bc9de65` added engine/profile binding and budget validation to `/v1/audio/transcriptions`; the Fixvox reference route does not perform this heavy resolution.

## Bounded Implementation

1. Add explicit proxy timings for engine binding, budget validation, and multipart parsing.
2. Resolve profile config once per request and reuse it for engine, prompt, and profile-budget selection.
3. Parallelize independent KV reads in effective-profile and variant-config resolution.
4. Preserve existing budget semantics and fail-closed behavior.
5. Add tests for timing headers, bounded KV reads, engine binding, prompt binding, and exceeded budgets.

## Out Of Scope / Architecture Gate

- No deploy, DNS, Cloudflare mutation, VPS change, provider call, or production benchmark in this batch.
- Do not replace budget event scans yet. A follow-up architecture decision should choose an O(1), concurrency-safe spend ledger (preferably Durable Object backed) after the new `budgetMs` metric confirms its share.

## Validation

```powershell
cd cloud/fixvox-proxy
bun test src/managed-execution.test.ts
bun test
cd ../..
npm run build
```

Also run Pi diagnostics and `git diff --check` on touched files.

## Local Result

- Engine/profile/prompt/budget resolution now shares one result per request.
- Independent account/config/projection KV reads run concurrently.
- Variant config reads its combined variants store once.
- Audio hot-path test is bounded to 18 KV reads and verifies at least three concurrent reads.
- New `engineBindingMs` and `budgetMs` headers flow into redacted desktop reports.
- Budget blocking and account-budget precedence remain covered.
- No deploy or production mutation was performed.

## Rollback

Revert the local timing/config-reuse/parallel-read changes. No storage schema or production state changes are introduced.
