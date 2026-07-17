# Quickstart: Fixvox Self-Hosted Control Plane

## Clean Session Prompt

Use this in the next clean Pi session:

```text
Continue manually, without Taskflow, with SpecKit 019 in C:/dev/dictation-tauri.
Read docs/.generated/context-index.md, docs/WORKING_MEMORY.md,
specs/019-fixvox-self-hosted-control-plane/{spec.md,plan.md,research.md,data-model.md,contracts/http-api.md,tasks.md,quickstart.md}.

Checkpoints A-B (T001-T012) are complete. Stop before Checkpoint C. Do not begin T013, add/install dependencies, provision PostgreSQL/VPS, deploy, change DNS/Tunnel/secrets, import production data, mutate Admin, or call real providers without a new explicit authorization. Preserve the dirty worktree and do not revert unrelated changes. Use direct read/rg/bash and deterministic checks; no Taskflow or subagent fan-out.
```

## Session Workflow

1. Confirm no Taskflow run will be started/resumed.
2. Read the spec route above and inspect current git status.
3. State the single checkpoint and acceptance gate.
4. Work manually in one bounded batch.
5. Run focused checks, then closing checks.
6. Mark only completed tasks.
7. Update durable docs if behavior/architecture changed.
8. Stop and ask before the next checkpoint or any gated action.

## Baseline Checks

```powershell
npm run cloud:test
npm run build
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
cd cloud/fixvox-proxy
npx wrangler deploy --dry-run
```

Checkpoint A evidence is under ignored `artifacts/self-hosted-control-plane/checkpoint-a/`; T001-T006 are complete. Checkpoint B's Lean Checkpoint Loop receipt is in `tasks.md`; T007-T012 are complete and the Worker contract/dry-run gate passed provider-free. Planned commands such as self-hosted local start, PostgreSQL migrations, export/import, VPS deploy, canary, and cutover do not exist yet. Add them only in their assigned checkpoint and behind dependency/production gates.

## Mandatory Gates

Ask JP before:

- adding/installing Bun/npm/database dependencies;
- provisioning PostgreSQL, containers, services, timers, backups, ports, or users;
- copying/creating/rotating secrets;
- Worker/VPS deploy;
- DNS/Tunnel/edge changes;
- production export/import or Admin mutation freeze;
- real account/device/provider canary;
- authority cutover or Worker retirement;
- commit, push, release, or publication.

## Privacy

- No raw audio/transcript/selected text in DB, logs, fixtures, docs, or reports.
- No raw account/device/install/OAuth IDs in evidence.
- Migration payloads/backups stay private and outside the repo.
- Contract fixtures use synthetic values.
- Never mirror provider requests to compare origins.

## Rollback Reminder

Before canary: routing back to Worker is sufficient because VPS is not authority.

After VPS accepts authoritative writes: DNS-only rollback is unsafe; reconcile new writes or forward-fix. The authority mode/revision must make this boundary explicit.
