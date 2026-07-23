---
status: active
updated: 2026-07-22
track: docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
---

# Runbook — Fixvox API VPS Loopback

Checkpoint F2, F3R5, F4 and local F5R1 are complete. Provider-loopback R1-R3/P1-P3 now runs immutable release `4075da53c365a8b1` on schema 6, provider-configured and only on `127.0.0.1:8790`; markers historical/canary are 1/1 and immediate rollback is `66652d0fa6073c26`. `90ca…`/`c0deb…` remain earlier schema-6-compatible rollbacks. F5R2 is superseded; F5R3-F5R4/F6 require replan. Cloudflare remains authority/hot path.

The operational mirror is `C:/dev/infra/docs/runbooks/fixvox-api-vps.md`. If either runbook disagrees with the other or with the selected track, stop before execution.

## Fixed Contract

| Area | Value |
| --- | --- |
| Host / owner | `srv1761438` / `jpsal` |
| API bind | `127.0.0.1:8790` only; `8787` remains Admin BFF |
| Runtime | `/home/jpsal/.bun/bin/bun` |
| Releases | `/home/jpsal/opt/fixvox-api/releases/<release-id>` + atomic `current` symlink |
| Current / immediate rollback | `4075da53c365a8b1` / `66652d0fa6073c26` |
| Earlier schema 6 rollbacks | `90ca26a7e3bd6f50`, then `c0deb60ab0f39b3a` |
| Staging | `/home/jpsal/staging/fixvox-api` |
| Protected config | `/home/jpsal/.config/dictation-tauri/fixvox-api.env`, mode `0600` |
| Protected libpq config | `/home/jpsal/.config/dictation-tauri/fixvox-api.pg_service.conf`, mode `0600` |
| User unit | `/home/jpsal/.config/systemd/user/fixvox-api.service` |
| Wrappers | `/home/jpsal/.local/bin/fixvox-api-*` |
| Backups | `/home/jpsal/backups/fixvox-api`, mode `0700` |
| PostgreSQL | Ubuntu host-managed PostgreSQL 16; DB `fixvox`; schema 6; roles `fixvox_migrator` and `fixvox_api` |
| Authority / providers | `cloudflare-authority`; `FIXVOX_API_MOCK_PROVIDERS=false`; Groq key protected in env `0600` |

Never inspect, reuse, mutate, or depend on PostgreSQL containers or volumes belonging to Coolify or Zulip. Never deploy from or mutate `/home/jpsal/dev/dictation-tauri`.

## F1 Assets

All scripts default to dry-run. Mutating execution fails closed unless it receives `--execute` plus the matching `--approved-fN` gate.

| Asset | Gate | Purpose |
| --- | --- | --- |
| `ops/fixvox-api/bundle.sh` | F1 | Reproducible runtime-only archive and deterministic manifest |
| `ops/fixvox-api/preflight.sh` | F2 | Read-only OS/runtime/resources/port/path/package checks |
| `ops/fixvox-api/provision.sh` | F2 | Dedicated PostgreSQL, roles/grants, protected config and migrations |
| `ops/fixvox-api/deploy.sh` | F3 | Staging validation, hash verification, immutable release and `current` switch |
| `ops/fixvox-api/service.sh` | F3 | Unit/wrapper install, systemd verification and loopback start |
| `ops/fixvox-api/health.sh` | F3 | Status, listener, health/readiness and allowlisted structured logs |
| `ops/fixvox-api/health-f4.sh`, `readiness.sh`, `status.sh`, `logs.sh` | F4 | Read-only health, readiness, status and allowlisted journal projections |
| `ops/fixvox-api/maintenance.sh` | F4 | Provider-free maintenance jobs behind a non-overlapping lock |
| `ops/fixvox-api/backup.sh` | F4 | Locked custom dump → zstd → age plus safe manifest and retention |
| `ops/fixvox-api/operations.sh` | F4 | Install F4 wrappers and jittered user timers; verify and enable them |
| `ops/fixvox-api/templates/fixvox-api-{maintenance,backup}.{service,timer}` | F4 | Sandboxed oneshots and persistent timers with randomized delay |
| `ops/fixvox-api/restore-rehearsal.sh` | F5 | Off-host decrypt, isolated restore and safe manifest comparison |
| `ops/fixvox-api/templates/fixvox-api.service` | F3 | Reviewed user-service unit |
| `ops/fixvox-api/tests/assets-smoke.sh` | F1/F4 | Parse, dry-run, gate, reproducibility, allowlist and privacy checks |
| `ops/fixvox-api/rollback-control.sh` | F5R1 | Repackage only the approved `9afa…` archive with fixed control metadata |
| `ops/fixvox-api/tests/rollback-control-smoke.sh` | F5R1 | Two control builds, source/candidate file identity, privacy and isolated boot |

Dry-run all operations:

```bash
for script in bundle preflight provision deploy service health health-f4 readiness status logs maintenance backup operations restore-rehearsal; do
  bash "ops/fixvox-api/$script.sh" --dry-run
done
bash ops/fixvox-api/tests/assets-smoke.sh
```

Build a local bundle after reviewing the diff:

```bash
mkdir -p artifacts/fixvox-api-bundles
bash ops/fixvox-api/bundle.sh \
  --execute --approved-f1 \
  --repo-root "$(pwd -P)" \
  --output-dir "$(pwd -P)/artifacts/fixvox-api-bundles"
```

The archive allowlist is exactly:

- `cloud/fixvox-api/package.json`;
- `cloud/fixvox-api/src/**`;
- `cloud/fixvox-api/migrations/**`;
- `cloud/fixvox-core/src/**`.

Tests, `.env`, artifacts, Git metadata, checkout state and all other packages are excluded. Tar order, ownership, timestamp and gzip headers are normalized. The release ID is the first 16 hex characters of the archive SHA-256; the sidecar manifest records the full archive hash and every file hash.

## F5R1 Local Rollback-Control Proof

F5R1 reads only these already-approved ignored artifacts; it never calls `bundle.sh` and never reads runtime files from the checkout:

```bash
bash ops/fixvox-api/rollback-control.sh \
  --source-archive artifacts/fixvox-api-bundles/fixvox-api-9afa5dc85b783793.tar.gz \
  --source-manifest artifacts/fixvox-api-bundles/fixvox-api-9afa5dc85b783793.manifest.json \
  --output-dir artifacts/fixvox-api-rollback-control
bash ops/fixvox-api/tests/rollback-control-smoke.sh \
  --source-archive artifacts/fixvox-api-bundles/fixvox-api-9afa5dc85b783793.tar.gz \
  --source-manifest artifacts/fixvox-api-bundles/fixvox-api-9afa5dc85b783793.manifest.json
```

The control archive uses fixed `controlDateEpoch=946684801` (source epoch `946684800`) and its manifest must contain `purpose=rollback-control`, the source archive/manifest hashes and the complete source file manifest. Two independent runs must be identical, while the control release SHA/release ID differs from `9afa…`. The focused smoke extracts source and candidate, compares every runtime path/file SHA, checks the allowlist/privacy exclusions, and boots only the candidate from an isolated working directory. The existing `assets-smoke.sh` is not the F5R1 guard because it rebuilds from the checkout; it is not run for this batch.

## Protected Inputs

Committed files contain names only, never values. Runtime/migration configuration may use these approved environment names:

- `FIXVOX_API_DATABASE_URL`;
- `FIXVOX_DATABASE_URL`;
- `FIXVOX_API_PUBLIC_BASE_URL`;
- `FIXVOX_API_HOST`;
- `FIXVOX_API_PORT`;
- `FIXVOX_API_MOCK_PROVIDERS`;
- `FIXVOX_API_REQUEST_TIMEOUT_MS`;
- `FIXVOX_API_MAX_REQUEST_BYTES`;
- `FIXVOX_BACKUP_AGE_RECIPIENT`.

F2 bootstrap secrets are supplied through an already-open protected file descriptor, never command arguments or output. Allowed input labels are `migrator_password`, `runtime_password`, `migration_database_url`, `runtime_database_url`, and `backup_age_recipient`. Do not paste values into shell history, docs, chat, or logs.

Backups use the public age recipient on the VPS. The private identity remains off-host and outside all repos. `restore-rehearsal.sh` refuses to run on `srv1761438`.

The separate provider plan permits the names `GROQ_API_KEY` and `OPENROUTER_API_KEY` only behind its own gates. P1 now keeps `GROQ_API_KEY` in the protected service env; `OPENROUTER_API_KEY` remains absent. Never print values or add/change provider names under Checkpoint F authorization.

## Service And Verification Contract

The reviewed unit executes:

```text
ExecStart=/home/jpsal/.bun/bin/bun run /home/jpsal/opt/fixvox-api/current/cloud/fixvox-api/src/main.ts
WorkingDirectory=/home/jpsal/opt/fixvox-api/current
EnvironmentFile=/home/jpsal/.config/dictation-tauri/fixvox-api.env
Restart=on-failure
```

Expected checks after their matching gates:

```bash
pg_isready
ss -ltn "sport = :8790"
systemctl --user status fixvox-api.service --no-pager
curl -fsS http://127.0.0.1:8790/health
curl -fsS http://127.0.0.1:8790/ready
/home/jpsal/.local/bin/fixvox-api-status --execute --approved-f4
/home/jpsal/.local/bin/fixvox-api-health --execute --approved-f4
/home/jpsal/.local/bin/fixvox-api-readiness --execute --approved-f4
/home/jpsal/.local/bin/fixvox-api-logs --execute --approved-f4
systemctl --user list-timers --all
```

`/ready` must report `ok: true` and `authorityMode: cloudflare-authority`. There must be exactly one `127.0.0.1:8790` listener and no `0.0.0.0:8790` or `[::]:8790` listener. The logs wrapper emits only the application logger allowlist: request ID, route template, method, status, duration and code. F4 services use `flock -n` locks, `RandomizedDelaySec`, `Persistent=true`, and `UMask=0077`.

## F2-F4 And F5R1 Complete — Gate F Closure Waiting

- PostgreSQL `16.14`, DB/roles dedicated, schema v6, config `0600`, backups `0700` and off-host `age` identity remain green.
- F3 preflight, artifact hash, immutable release `9afa5dc85b783793`, `current` and unit verification passed; the preserved prior release remains available for F5.
- F3R4 local receipt: 27 applicable fixtures compare with `missingWorker/mismatches = 0/0`; `npm run cloud:test` **154/154**; API unit **29/29**; assets and exact archive boot smoke are green with health 200 and cleanup.
- F3R5 receipt (2026-07-20): the approved archive hash matched local, staging and immutable release; the unit is enabled/active/running with zero restarts and exactly one loopback PID/listener. Host-local health/readiness are HTTP 200 with schema v4, DB/schema/jobs and `cloudflare-authority` green. Admin `127.0.0.1:8787` remained active/200; mock-only env allowlist, redacted journal/privacy sentinel and dirty-checkout fingerprint passed.
- F4 receipt (2026-07-21): `operations.sh --execute --approved-f4` installed six owner-only executable wrappers under `/home/jpsal/.local/bin/` plus four user units/timers, ran `systemd-analyze --user verify`, daemon-reloaded and enabled/started both persistent jittered timers. Timer state was visible with `RandomizedDelaySec=15min` maintenance and `30min` backup.
- Manual maintenance and backup service executions returned `Result=success`. The backup pipeline was `pg_dump --format=custom --no-owner --no-acl | zstd -T1 -q | age -r <public recipient>`, without a private identity or decrypt. The valid `.dump.zst.age` and paired manifest are owned by `jpsal`, mode `0600`, under the mode `0700` backup directory; the manifest allowlist is only `encryptedSha256` plus `database.schemaVersion`, `authority`, `counts` and `projectionHashes`.
- Lock collision tests for backup and maintenance failed closed without an extra backup. Age header/hash, manifest allowlist, health/readiness/authority, Admin `/healthz` 200, loopback listener, resources and journal privacy sentinel passed. No audio, transcript, prompt, request body, credential or password URL appeared.
- No provider, import, DNS, Tunnel, public traffic, reboot, restore, decrypt,
  DB cleanup, commit or push occurred. Cloudflare remains authority/hot path;
  F5R2 is superseded.

F4 and local F5R1 are complete. Do not execute F5R2: its `9afa…`/schema 4
contract is obsolete. F5R3, F5R4 and F6 now form one outcome band under
`docs/tracks/vps-gate-f-closure-brief.md`; do not begin it without one exact
explicit authorization. Destructive cleanup of releases/unit or F2 state
remains separately gated.

**F5 blocked receipt (2026-07-21):** The critical rollback guard is red. The VPS has only `9afa5dc85b783793` (current, healthy) and `cdda90ea76d4c361` (the known dependency-closure-defective release). The latter is the only prior release and is not an approved arrancable rollback target; no other approved healthy target is present in the assets/runbook/remote release set. No `current` move, rollback restart, decrypt, `pg_restore`, temporary DB creation or cleanup was attempted. Read-only evidence leaves `current` on `9afa5dc85b783793`, `fixvox-api.service` enabled/active/running with one `127.0.0.1:8790` listener, health/readiness HTTP 200 with `cloudflare-authority`, Admin 8787 active/200, F4 timers/backups preserved, resources above thresholds and the 19-entry dirty checkout unchanged. The private identity is not on the VPS. Cloudflare remains authority/hot path; no public traffic, provider, import, DNS/Tunnel, or checkout mutation occurred.

**F5R1 receipt (2026-07-21):** The approved source archive SHA-256 `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d` and exact source manifest SHA-256 `62969be6d7fbef3c99f019f9f9cb26d54a97fecdf2832e8a8ca8d998e71dd6e8` were verified before extraction. Two independent local control builds produced identical archive/manifest output: candidate archive SHA-256 `b18a1e92ad3ef9707f733ffdeecf3a8e2f42967b1935df725d501521e288f28c`, release ID `b18a1e92ad3ef970`, fixed `controlDateEpoch=946684801`. All 54 runtime paths and SHA-256 file hashes match the approved source; allowlist/privacy exclusions and secret-sentinel scans passed. The candidate-only isolated boot smoke returned `/health` 200 and cleaned the process/ephemeral port without checkout fallback. No `bundle.sh` checkout build, VPS, `cdda…`, install, provider, deploy, restart, decrypt, restore, DB, commit, push or publish occurred.

**Latency shadow receipt (2026-07-22):** With separate explicit authorization, rollback-compatible release `c0deb60ab0f39b3a` was promoted first and validated on schema 4. Release `90ca26a7e3bd6f50` was installed without moving `current`; migrations 0005-0006 were then applied as `fixvox_migrator` in independent fail-closed transactions and `current` was atomically promoted. Independent verification left schema 6, versions 1-6 and exact checksums green; all three preserved releases are immutable; the service is active/enabled with one loopback listener; API health/readiness and Admin are 200; mocks and `cloudflare-authority` remain active. At that checkpoint there were zero enabled STT engines and zero pricing records. `c0deb…` is now the healthy schema 4-6 rollback; `9afa…` is preserved but is not ready on schema 6. No provider, engine/profile, pricing, STT smoke, routing, DNS/Tunnel, public traffic, cutover or authority change occurred.

**Real STT receipt (2026-07-22):** With another explicit gate, candidate `66652d0fa6073c26` added only the Groq audio provider boundary and was installed immutable with `--install-only`; `current`, PID and restart count did not change. Durable config now contains profile `basic` v2, three enabled canonical engines and one JSONB-object pricing record for `whisper-large-v3-turbo` at `40000` microUSD/hour. A provider-free bootstrap passed first. One and only one real Groq call then transcribed a 4814 ms generated TTS WAV: HTTP 200, expected match true, provider latency 355 ms, shadow match and ledger settled from the conservative estimate. The append-only marker is 1 and blocks retries. Synthetic device/install/ledger rows and remote WAV were cleaned; the redacted receipt persists without transcript/audio/key. Service `8790` remained `90ca…`, mock-only, loopback, health/readiness/Admin 200 and `cloudflare-authority`; candidate `66652…` was not promoted during that gate. No routing, DNS/Tunnel, public traffic, cutover or authority change occurred.

**Provider support promotion receipt (2026-07-22):** A later explicit gate authorized only code promotion. Baseline verified `90ca…`, schema 6, marker 1, candidate integrity and a single functional file diff (`providers.ts`; manifest identity/hash metadata changed as expected). `current` moved atomically to `66652d0fa6073c26` and the user service restarted under automatic rollback to `90ca…`. Independent verification left schema 6, marker 1, service active/enabled with zero automatic restarts, one loopback listener, health/readiness/Admin 200, mock providers and `cloudflare-authority`. No provider call, persistent provider key, routing, DNS/Tunnel, public traffic, canary, cutover or authority change occurred. Redacted receipt: `artifacts/proxy-latency/vps-provider-support-promotion-receipt.json`.

Current F5 state: F5R2 is superseded and must not execute. F5R3-F5R4/F6 are
one Gate F Closure outcome band awaiting authorization. References:
`docs/tracks/vps-gate-f-closure-brief.md` and
`docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md`.

Persistent provider/canary work now lives in `docs/tracks/vps-persistent-provider-canary-plan.md`: P1 activation without a call, P2 provider-free harness preparation, P3 one host-local canary and P4 routing/authority are independent gates. The historical marker remains append-only at 1 and must never be reused or cleared.

**P1 blocked preflight (2026-07-22):** P1 was explicitly authorized, but the preflight found `FIXVOX_API_PUBLIC_BASE_URL=http://127.0.0.1:8790`; current `loadConfig()` accepts loopback HTTP only while mocks are enabled. Switching only `FIXVOX_API_MOCK_PROVIDERS=false` would prevent startup. The operation stopped before transmitting the selected Fixvox Groq secret, editing config or restarting. Post-check: current `66652…`, schema 6, historical marker 1, canary marker 0, mock-only, key absent, restarts 0, loopback, health/readiness/Admin 200 and Cloudflare authority; provider requests 0. Do not retry P1 or substitute a fake/public HTTPS URL.

**Local remediation R1 (2026-07-22):** `loadConfig()` now permits HTTP only when both public URL and bind are loopback, including provider-configured mode; HTTPS remains mandatory outside loopback and `0.0.0.0` fails closed. Config tests 4/4 and LSP passed. The broader unit run passed 33/34; its only failure is an unrelated migration test that treats already-known schema version 6 as unknown.

**Exact candidate R2 (2026-07-22):** Candidate `4075da53c365a8b1` was built twice from the approved `66652…` archive, never from the dirty runtime tree. Archive SHA-256 is `4075da53c365a8b1fa93bba16899a8c097d8a1378e7d1753ce9606592f5f914a`; manifest SHA-256 is `afb6da329985328a6ffaee7ce6b1ef4a891c13f5bc5d94a9d458102f79efb7b7`. All 61 runtime paths match and only `config.ts` differs. Determinism, allowlist/privacy, independent hash/path comparison, mock boot 200 and provider-configured fixture boot 200 passed with zero provider calls and no real secret.

**Code-only mock promotion R3 (2026-07-22):** `4075da53c365a8b1` was transferred, installed immutable and promoted atomically with rollback to `66652d0fa6073c26`. Independent verification checked manifest plus all 61 runtime files, schema 6, markers historical/canary 1/0, service active/enabled, restarts 0, one loopback listener, health/readiness/Admin 200 and Cloudflare authority. Config remained mock-only with no provider key; provider calls 0, no routing/DNS/Tunnel/canary, and staging was cleaned.

**Persistent provider activation P1 (2026-07-22):** A new explicit authorization selected the Fixvox Groq credential. After one helper failed before mutation, the single bounded retry used a standalone script validated locally/remotely and sent the secret only through SSH stdin. The protected env was updated atomically to provider-configured mode and the service restarted once. Independent verification left current `4075da53…`, rollback `66652…`, schema 6, markers 1/0, service active/enabled, restarts 0, loopback, health/readiness/Admin 200 and Cloudflare authority. The key is present only in env `0600`, absent from output/journal, with zero rollback backups; product/provider requests 0, no canary/routing/DNS/Tunnel and staging cleaned. Receipt: `artifacts/proxy-latency/vps-persistent-provider-activation-receipt.json`.

**Provider-free canary harness P2 (2026-07-22):** The local-only harness is pinned to `4075da53c365a8b1`, uses a distinct action/operation, validates service/listener/schema/profile/engines/pricing/markers and bounded synthetic WAV, serializes the append-only marker with advisory lock `91827403`, inserts it before one transcription request, forbids retries, redacts receipt content and limits cleanup to synthetic identity/ledger state. Harness 6/6 and focused app/provider/harness 30/30 passed with syntax/LSP clean. No real secret, VPS, transfer, provider call, canary, routing/DNS/Tunnel or authority mutation occurred.

**One host-local canary P3 (2026-07-22):** After fixture/DB checks, a diagnostic provider-free preflight exposed an allowlisted runner env omission (`canary_service_inactive`); marker, request and provider calls remained 0. A clean preflight with user-systemd DBus/XDG env returned 200 and cleaned its synthetic bootstrap. Real mode then ran exactly once: marker inserted before the request, transcription/provider calls 1, HTTP 200, expected match true and ledger settled. Independent verification left current `4075da53…`, rollback `66652…`, schema 6, markers 1/1, provider configured, restarts 0, loopback, health/readiness/Admin 200 and Cloudflare authority; identity/binding/reservation 0 and secret/transcript absent from journal/receipt. Remote harness/WAV/staging were removed. Receipt SHA-256 `08736c19f38570298ba70eee5f2a6c6e2a9442341b6f6dc6bbdf3ae52dc91761`. No routing, DNS/Tunnel or authority change. P4 requires a separate plan/gate.

## Stop Conditions

Stop without repair beyond one bounded local correction if the port is occupied, bind is not exact loopback, memory or disk falls below 1 GiB, schema/checksum/authority diverges, a secret or sensitive body appears, the off-host age identity is unavailable, the dirty VPS checkout would need mutation, or any provider/import/DNS/Tunnel/canary/cutover/public traffic/dependency becomes necessary.
