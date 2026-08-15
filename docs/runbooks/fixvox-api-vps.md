---
status: active
updated: 2026-08-14
track: docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
---

# Runbook — Fixvox API VPS Loopback

The permanent direct-runtime cutover routes `auth-fixvox.jpsala.dev` through the dedicated Cloudflare Tunnel to the loopback-only VPS service. Live verification on 2026-08-14 observed runtime release `c1154baf25dbe005`, PostgreSQL schema 9 with exact migrations `0001..0009`, and logical `authorityMode=cloudflare-authority`. Release `2a49be9eccf4ce17` is the immediate schema-9 code rollback; `0434f2cf3d0a6607`, `bc1a3e5cadba1903` and `650b4c8f6ed00a2a` remain preserved schema-9 releases. Release `11bf651ce5d983b6` remains preserved but expects schema 8 and is not a direct code rollback while production remains on schema 9.

The operational mirror is `C:/dev/infra/docs/runbooks/fixvox-api-vps.md`. If either runbook disagrees with the other or with the selected track, stop before execution.

## Fixed Contract

| Area | Value |
| --- | --- |
| Host / owner | `srv1761438` / `jpsal` |
| API bind | `127.0.0.1:8790` only; `8787` remains Admin BFF |
| Runtime | `/home/jpsal/.bun/bin/bun` |
| Releases | `/home/jpsal/opt/fixvox-api/releases/<release-id>` + atomic `current` symlink |
| Current / immediate schema-9 rollback | `c1154baf25dbe005` / `2a49be9eccf4ce17`; preserved `0434f2cf3d0a6607`, `bc1a3e5cadba1903`, `650b4c8f6ed00a2a` |
| Preserved schema-8 code release | `11bf651ce5d983b6`; not directly runnable against schema 9 |
| Staging | `/home/jpsal/staging/fixvox-api` |
| Protected config | `/home/jpsal/.config/dictation-tauri/fixvox-api.env`, mode `0600` |
| Protected libpq config | `/home/jpsal/.config/dictation-tauri/fixvox-api.pg_service.conf`, mode `0600` |
| User unit | `/home/jpsal/.config/systemd/user/fixvox-api.service` |
| Wrappers | `/home/jpsal/.local/bin/fixvox-api-*` |
| Backups | `/home/jpsal/backups/fixvox-api`, mode `0700` |
| PostgreSQL | Ubuntu host-managed PostgreSQL 16; DB `fixvox`; schema 9 with exact migrations `0001..0009`; roles `fixvox_migrator` and `fixvox_api` |
| Routing / authority / providers | Dedicated Tunnel → VPS; logical `cloudflare-authority`; providers real; Groq and Google OAuth credentials protected in env `0600` |

Never inspect, reuse, mutate, or depend on PostgreSQL containers or volumes belonging to Coolify or Zulip. Never deploy from or mutate `/home/jpsal/dev/dictation-tauri`.

## F1 Assets

All scripts default to dry-run. Mutating execution fails closed unless it receives `--execute` plus the matching `--approved-fN` gate.

| Asset | Gate | Purpose |
| --- | --- | --- |
| `ops/fixvox-api/bundle.sh` | F1 | Reproducible runtime-only archive and deterministic manifest |
| `ops/fixvox-api/preflight.sh` | F2 | Read-only OS/runtime/resources/port/path/package checks |
| `ops/fixvox-api/provision.sh` | F2 | Dedicated PostgreSQL, roles/grants, protected config and migrations |
| `ops/fixvox-api/deploy.sh` | F3 | Staging validation, hash verification, immutable release and `current` switch |
| `ops/fixvox-api/code-release.sh` | F3 | Code-only immutable install, atomic promotion, one restart, one-shot verification and exact automatic rollback |
| `ops/fixvox-api/tests/code-release-smoke.sh` | F3 | Provider-free success/failure/rollback/privacy contract for `code-release.sh` |
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
- `FIXVOX_BACKUP_AGE_RECIPIENT`;
- `GOOGLE_CLOUD_CLIENT_ID`;
- `GOOGLE_CLOUD_CLIENT_SECRET`.

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

The service still binds only to loopback, but `FIXVOX_API_PUBLIC_BASE_URL` must
be exactly `https://auth-fixvox.jpsala.dev`. A loopback public base breaks
browser handoff and must fail release verification. Production Google OAuth
requires both credential names above; partial configuration fails closed. The
authorization request uses `/callback`, `response_type=code`, scope
`openid email profile` and `prompt=select_account`; token material is exchanged
server-side, verified through Google UserInfo and never persisted.

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

## Direct Cutover And OAuth Repair — 2026-07-24

- Cutover final replaced the Worker Custom Domain with a dedicated Tunnel/CNAME,
  stabilized three public health checks and left Worker invocations and KV delta
  at zero. VPS remains loopback-only behind the Tunnel.
- A clean-install/upgrade validation first exposed a stale device binding. The
  desktop hotfix bootstraps provider-free before readiness, login and STT and
  was published as `fixvox-tauri-v0.1.0-20260724125602`.
- The next login failed closed because the VPS still generated
  `verificationUri` from `http://127.0.0.1:8790`. Production config was backed
  up at mode `0600`, changed atomically to the canonical public base and
  restarted once; health/readiness and browser origin checks passed.
- Google then exposed the incomplete VPS OAuth implementation. Source commit
  `faf1985` adds the complete account-select request, confidential code exchange
  and verified UserInfo identity without token persistence. API unit `38/38`,
  TypeScript and assets smoke passed.
- Deterministic runtime bundle `68eae40e974909c5` has archive SHA-256
  `68eae40e974909c500db3523e33a5f788e034e39d9192904cb9baa119295647d`.
  Candidate boot passed before promotion. Google credentials moved only through
  SSH stdin into the protected env, with backup
  `fixvox-api.env.before-google-oauth-20260724T140601Z`.
- Promotion and one restart left one listener, `NRestarts=0`, public and local
  health/readiness 200, login start 200, complete Google parameters,
  `prompt=select_account` and canonical `/callback`. Staging was removed and no
  STT/provider request was issued. JP then confirmed account selection and login
  worked on the previously affected PC.
- Redacted local receipt:
  `artifacts/oauth-hotfix/20260724-vps-google-oauth/production-receipt.json`.

## Account Profile Inheritance Hotfix — 2026-07-24

- A clean install on another PC completed OAuth but resolved `Basic`; production
  inspection showed one canonical Google account with no account-level profile
  and the old `Pro` assignment isolated on an unlinked device.
- An encrypted F4 backup preceded a fail-closed transaction that assigned the
  canonical account to published `Pro`, changed only its placeholder handle to
  a stable opaque fingerprint, and appended redacted audit.
- Source `62a5519`; deterministic release `e835f7f678b528c8`, archive SHA-256
  `e835f7f678b528c827b9d961254926a016973512ddc99e84e6cc6a329c49f378`.
  Candidate health/readiness passed before atomic promotion.
- API edit/publish credentials were copied without output from the protected
  Admin env into the protected runtime env, both `0600`; a `0600` pre-change
  env backup remains. The account-policy compatibility route passed an
  idempotent provider-free call and updated the linked device projection.
- Final state: service active, `NRestarts=0`, one loopback listener, schema 6,
  public/local health and readiness 200, account profile `pro` with
  `source=account`, visible callback with `no-store`, no provider events and
  clean staging. Immediate rollback is `68eae40e974909c5`.

## Prompt Runtime Parity — 2026-07-24

- Fixvox anterior confirmó que su mejor puntuación y reconocimiento provenían
  de `whisper-large-v3-turbo` con prompt técnico, `temperature=0` y
  `verbose_json`; el boundary VPS reconstruía el multipart sin esos campos.
- El API ahora materializa prompts administrables cuando existen y usa un
  fallback code-owned Fixvox-compatible cuando el profile o PostgreSQL no
  contiene prompt. Postprocess reemplaza el system prompt del caller por un
  baseline server-owned para puntuación española, correcciones habladas,
  fillers y términos técnicos.
- El primer candidate `c33d2d3d56197093` se revirtió a
  `e835f7f678b528c8` al detectar `prompts=0` en producción. No hubo mutación de
  PostgreSQL. El segundo candidate agregó el fallback y pasó 39 tests unitarios,
  17 PostgreSQL, LSP, boot aislado provider-configured y context 200.
- Source commiteado y pusheado en `4db04f8`; el rebuild determinístico desde
  ese commit reproduce la release `89750e99f55f7d01`, SHA-256
  `89750e99f55f7d0144a59bed349205bf0203f2c7f1fa94644cc1a0dda52c5b82`.
  Servicio activo, `NRestarts=0`, listener único loopback, health/readiness
  local y público 200, authority `cloudflare-authority`, staging limpio y cero
  provider calls iniciadas por la operación. Rollback inmediato:
  `e835f7f678b528c8`.
- Receipt redacted local:
  `artifacts/fixvox-api-prompt-parity/20260724T195642Z-prompt-fallback/production-receipt.json`.

## Upgrade Schema 8→9 — Blocked After Safe Rollback 2026-08-13

El tooling local no commiteado en el checkout aislado `59a3dfe…` conserva
backup F4 fresco/verificado, install-only, migración protegida, promoción,
restart único, verificación y rollback lógico `9→8`. Candidate
`650b4c8f6ed00a2a` quedó byte-compatible con producción:

- archive SHA-256
  `650b4c8f6ed00a2a64f6c8fa63143fe0b32607317a4ecec59f448633305f4924`;
- manifest SHA-256
  `e0b4e21388a6ffcb08a207f6aaa7ea66c86a40b5f6da1b0c0039d91662c0a997`;
- `0001..0008` coinciden exactamente con release activa y
  `schema_migrations`; `0009` conserva
  `82dbdf93a23aca25d8a1df6abb32546f82dcf33dea0a20a1523fbcd6d168a5a5`.

La prueba descartable confirmó sólo `0009` pendiente, rollback a marker `8`
preservando tablas/datos y segundo `8→9`. JP aprobó el primer packet; preflight
y upload a staging pasaron con hashes exactos. Antes del backup se detectó que
el helper aprobado exigía nueve archivos también al inspeccionar la release
baseline de ocho. No se ejecutó backup, install, migration, symlink ni restart.

La corrección probada acepta ocho archivos exclusivamente para `inspect` y
mantiene nueve más hashes canónicos exactos para `migrate`/`rollback`. Helper
corregido SHA-256:
`4b459d1a2c57d117fbb3a9ef1cffd2d78af58c786326de2b70d88334902d1bd1`.
El gate revisado autorizó reemplazar el helper y continuar. El upgrade creó
backup fresco verificado
`fixvox-20260814T032217402611748Z.dump.zst.age` SHA-256
`96e0903dd06bf73b32a3b87c8194a23d86fc571b4e5a1088995b34166cabeacd`,
instaló candidate, aplicó `0009`, promovió y reinició. `verify` falló; el
rollback automático volvió lógicamente a schema `8`, restauró `current`
`11bf651ce5d983b6` y dejó servicio/listener/health/readiness verdes.

No reintentar. El receipt `0600` no conserva la dimensión del primer verify
porque sus campos fueron reemplazados por la verificación final del rollback.
Antes de otro gate, preservar esa primera causa y probar explícitamente el
contrato readiness post-restart. No corregir checksums productivos, mutar
releases inmutables, sustituir el migrator protegido ni fabricar otra release
de rollback.

## Receipt/Readiness Hardened — Gate Still Blocked 2026-08-14

El orchestrator local revisado usa receipt schema `2`, preserva
`verification`/`verificationFailures` del primer intento y guarda la superficie
posterior en `rollbackVerification`. Antes de cualquier HTTP aplica un barrier
acotado `30 × 1 s` que espera sólo service active más un único listener
`127.0.0.1:8790`; luego cada health/readiness local/público se ejecuta una vez.
No hay retry de HTTP, migración, promoción ni restart.

La prueba provider-free cubrió seis failpoints, listener demorado, ocho
dimensiones, schema/privacidad exactos, PostgreSQL descartable `8→9→8→9` y boot
del archive real. Tooling local: helper
`4b459d1a2c57d117fbb3a9ef1cffd2d78af58c786326de2b70d88334902d1bd1`,
upgrade `1e9d99357fee822c7ea0db522d6f648b1c5ac12c456604d19f57edfe16e0e25c`,
smoke `00d1a9e71f22da79a7b7b86643eadd5fb0f84ed12e164c047c588814e1dbad28`.
Archive/manifest siguen sin cambios.

El preflight read-only dejó producción verde en current/rollback
`11bf651ce5d983b6`, schema `8`, candidate `650b4c8f6ed00a2a` instalada e
inactiva, backup
`fixvox-20260814T032217402611748Z.dump.zst.age`
`96e0903dd06bf73b32a3b87c8194a23d86fc571b4e5a1088995b34166cabeacd`,
service/listener/health/readiness/authority y safeguards verdes.

Stop antes de gate: `upgrade.sh` siempre llama `deploy.sh --install-only`, pero
`deploy.sh` rechaza cualquier release existente para preservar inmutabilidad.
Reintentar con la candidate preinstalada fallaría en `install`. No reemplazar
tooling remoto, borrar/mutar candidate, fabricar otro release ID ni reintentar
producción. Un corte separado debe probar un handoff byte-exacto para candidate
preinstalada.

## Preinstalled Candidate Reuse — Revised Gate 2026-08-14

El tooling local del checkout aislado valida byte-exactamente una candidate ya
instalada antes de reutilizarla y conserva install-only para candidates nuevas.
La validación exige archive/manifest aprobados, todos los runtime entries y
hashes, manifest instalado byte-identical y árbol exacto sin drift,
missing/extra, symlink ni path no regular; no extrae, reinstala, borra, muta ni
llama deploy. Falla cerrado en `install`/`23`. Receipt schema `2` y readiness
`30 × 1 s` por service/listener seguido de HTTP one-shot no cambiaron.

Proof provider-free verde: reuse válido y seis rechazos exactos, fresh install,
seis failpoints, ocho dimensiones, privacidad, PostgreSQL product-baseline
`8→9→8→9` y boot real health `200` sin provider calls. Hashes locales: helper
`4b459d1a2c57d117fbb3a9ef1cffd2d78af58c786326de2b70d88334902d1bd1`,
upgrade `90aaa41354e673a3cadaaff5b628cae378a08c43bfc5842b3900916e407ef6f5`,
smoke `123bf26b7ca6b3b300f341b920a636d722814dcf92ebcb154ca049339ea3b2c1`.
Staging conserva helper idéntico y upgrade
`79bde1351035c11d89fe027e2e3f23b2d227bb045edc84b93659ee64a6d8d209`;
diff upgrade exacto: nueve hunks, `+200/-28`. Archive/manifest permanecen
`650b4c8f6ed00a2a64f6c8fa63143fe0b32607317a4ecec59f448633305f4924` /
`e0b4e21388a6ffcb08a207f6aaa7ea66c86a40b5f6da1b0c0039d91662c0a997`.

Preflight read-only: current/rollback `11bf651ce5d983b6`, candidate
`650b4c8f6ed00a2a` instalada/inactiva y sus 71 files exactos, schema `8`,
service/listener/health/readiness/authority verdes, backup
`fixvox-20260814T032217402611748Z.dump.zst.age`
`96e0903dd06bf73b32a3b87c8194a23d86fc571b4e5a1088995b34166cabeacd`,
timer/result/permisos/recursos verdes. No reemplazar tooling ni reintentar antes
de aprobación explícita. Después del gate: reemplazar sólo upgrade staged,
verificar hash/mode; repetir preflight; ejecutar una vez backup F4 fresco,
reuse validado, `8→9`, promoción, restart, barrier y HTTP one-shot; verificar
independientemente. Rollback: lógico `9→8`, current a `11bf651ce5d983b6`, un
restart y `rollbackVerification`; nunca restore implícito, retry o checksum
rewrite.

## Upgrade 8→9 Completed — 2026-08-14

El packet revisado terminó exactamente una vez con `upgrade=succeeded`. Estado
operativo verificado:

- `current=650b4c8f6ed00a2a`; rollback de código preservado
  `11bf651ce5d983b6`;
- PostgreSQL schema `9`, markers `1..9`, nombres y checksums exactos; `0009`
  `laboratory_execution_grants`
  `82dbdf93a23aca25d8a1df6abb32546f82dcf33dea0a20a1523fbcd6d168a5a5`;
- receipt staged privado modo `0600`, schema `2`, `outcome=succeeded`,
  verificación primaria verde, `rollbackVerification=null` y rollback no
  intentado;
- backup F4 pre-migración
  `fixvox-20260814T083217968689472Z.dump.zst.age`
  `099992ff344f188585f4afc1e640e9d184e427c41d5f03305be8ba915322ce55`,
  manifest schema `8`, archivos `0600`, directorio `0700`;
- service enabled/active, `NRestarts=0`, listener único
  `127.0.0.1:8790`, health/readiness local+público `200`, database/schema/jobs
  true y `cloudflare-authority`;
- archive/manifest/candidate conservan los `71` runtime files byte-exactos; la
  candidate preinstalada se reutilizó sin deploy/reinstall y la evidencia
  allowlisted desde activación mostró cero rutas provider-capable.

No reejecutar este orchestrator como retry. No restore, checksum rewrite,
reinstall, delete ni rollback fuera de un gate productivo nuevo y explícito.

## Audit Serialization Code Release And Gate A — 2026-08-14

Approved code-only release:

- source commit `d9aa52006cb5ea09fd58439e62b493d2a6ec7f42`;
- release `bc1a3e5cadba1903`;
- archive SHA-256
  `bc1a3e5cadba190307b8f04e4d530e0c0e337e1ed9d5d55d2e67e4a838a94b01`;
- 71 allowlisted runtime files; no schema, migration, backfill, env, DNS or
  tunnel change;
- prior current `650b4c8f6ed00a2a` preserved as the exact schema-9 rollback.

The approved orchestrator installed the immutable release, promoted `current`
atomically and restarted once. Its private receipt is schema `1`, mode `0600`,
`outcome=succeeded`, `phase=verified`, `rollbackAttempted=false`. Independent
checks observed current `bc1a3e5cadba1903`, schema `9`, exact migrations and
marker, service active/enabled, `NRestarts=0`, one listener at
`127.0.0.1:8790`, local/public health and readiness green, and
`cloudflare-authority`.

The separately approved owner→owner audit gate created `sequence=11` with
`jsonb_typeof(safe_metadata)=object` and exact logical content
`{role:"owner"}`. Owner count remains one. Historical `sequence=9/10` remain
unchanged JSONB strings.

The separately approved Gate A consumed one opaque grant and used the atomic
ledger to `12/12` requests and `4992/5000` microusd. Grant issue/consume audits
are JSONB objects. At that checkpoint Gate A remained `active` because the
deployed runtime lacked a server-owned completion transition. That historical
block was not repaired with SQL; it was resolved by the later code release and
API completion described below.

## Laboratory Lifecycle Code Release And Terminal Gates — 2026-08-14

The closure implementation was committed as
`b5e9265fc9e9eb1c71711e0cf32dc67d3db3fbb3`; canonical operations followed
in `981f233`. The final closure pins the EOL policy that reproduces the deployed
archive byte for byte. The first candidate `8fe5e28e…`
failed closed before install or promotion because its Windows checkout changed
immutable migration bytes `0001..0006`. Production remained on
`bc1a3e5cadba1903`, active with `NRestarts=0`.

The corrected byte-compatible archive deployed once:

- release `0434f2cf3d0a6607`;
- archive SHA-256
  `0434f2cf3d0a66075e21fb1732db4cd0b3492d51918b052dbeb51e42783831d5`;
- 71 allowlisted runtime files and exact production checksums `0001..0009`;
- prior current `bc1a3e5cadba1903` as the exact automatic rollback;
- one promotion restart, no rollback attempt.

Independent verification observed current `0434f2cf3d0a6607`, service
active/enabled, `NRestarts=0`, one listener at `127.0.0.1:8790`, local/public
health and readiness `200`, schema `9`, exact marker/checksum and
`cloudflare-authority`. There was no migration, backfill, manual SQL, env, DNS,
tunnel, role, profile or vocabulary mutation.

The separately approved Gate A completion performed one strict API CAS:
`active → completed`, `12/12`, `4992/5000` microusd and three server-minted
canonical refs. Audit `sequence=14` has bounded JSONB-object metadata. No
provider request, retry, postprocess or delivery occurred during completion.

The first approved Gate B setup consumed then aborted one execution before
spawn because the local verifier retained `candidateId` while the server
correctly projects source refs to `{sampleId, rawRef}`. Its terminal ledger is
`0/6`, `0/5000`, with zero provider calls. A new explicit packet authorized the
replacement execution. It completed exactly six sequential Groq
`openai/gpt-oss-120b` postprocess requests, without retry, STT, audio upload,
delivery or vocabulary; ledger `4998/5000`, audit `sequence=20` as JSONB object,
and no active Gate B execution. Provider-free stored-output verification
reported six accepted semantic-safety decisions, zero omissions and zero
additions. This is evidence, not an automatic profile promotion.

## Versioned Metadata Catalog And Gate B v2 — 2026-08-14

Two separately approved code-only releases followed the laboratory closure.
`2a49be9eccf4ce17` installed the bounded `conservative-timing` v2 recipe and
versioned Gate B definition. Live verification then found the catalog still
projected every postprocess recipe as unavailable when only the source Gate A
was unavailable. No grant or provider request occurred. Release
`c1154baf25dbe005`, archive SHA-256
`c1154baf25dbe005d1f4700201c74709999c909d74d813d97d47aec678f37492`,
separated recipe availability from source availability and became current with
`2a49be9eccf4ce17` as exact rollback.

Both promotions were code-only with one restart each and no migration, env,
DNS, tunnel or data mutation. Independent verification left service
active/enabled, `NRestarts=0`, one listener at `127.0.0.1:8790`, local health
and readiness `200`, schema `9` and `cloudflare-authority`.

The separately approved Gate B v2 packet then issued and consumed exactly one
new execution. It completed six sequential Groq `openai/gpt-oss-120b`
postprocess requests: `6/6`, `4998/5000` microusd, zero retries, STT, audio,
delivery, vocabulary or profile mutation. Audit `sequence=23` stores bounded
JSONB-object metadata. No Gate B execution remains active. Evaluation rejected
automatic promotion: the candidate had one `material_omission` fallback, nine
omissions and semantic safety `2/3`, versus baseline `3/3`; WER was unchanged,
while CER and latency were slightly worse.

## Canonical Dictation Postprocess Restoration — 2026-08-14

Source commit `379b941` restores the active Fixvox dictation path without
changing the product profile: desktop now reads `runtimePolicy.profile.key` and
`capabilities.postprocess`, and the server derives private pause guidance from
word timestamps before the policy-owned postprocess request. The guidance is
returned only to the authenticated desktop runtime and is never serialized in
host receipts or UI state.

The first archive `ac72b6591acee0d0` failed closed before install, promotion or
restart because a Windows checkout materialized immutable migration `0009`
with different EOL bytes. Production remained on `c1154baf25dbe005` with
`NRestarts=0`. A clean checkout reproduced all migration checksums exactly.

The corrected code-only release deployed once:

- release `6ac7ed0a2a88f0d0`;
- archive SHA-256
  `6ac7ed0a2a88f0d07f7cf7604d885ea8e81edd1ca854e450c67575f3ba064990`;
- exact schema `9` migrations `0001..0009`, with no migration, backfill, SQL,
  env, DNS or tunnel change;
- prior current `c1154baf25dbe005` as automatic rollback;
- one promotion restart and no rollback attempt.

Independent verification observed service active/enabled, `NRestarts=0`, one
listener at `127.0.0.1:8790`, health/readiness green, database/schema/jobs true
and `cloudflare-authority`. One separately approved synthetic real dictation
then exercised `fixvox-cloud` STT plus policy-owned
`openai/gpt-oss-120b` postprocess exactly once, without retry or fallback; the
final output materialized the spoken sequence as a numbered list. Synthetic
text/audio remain local and are not part of the operational receipt.

## Structured Dictation Output Repair — 2026-08-14

Source commit `89eed5c` adds explicit server-owned list/path guidance and keeps
multiline postprocess layout intact. A clean checkout produced immutable release
`bb1de673e1c36c50`, archive SHA-256
`bb1de673e1c36c50c54e34ac90cac26c2cff09c79117e01eb4b80db240ba50f6`.
The code-only deployment promoted once with one restart and exact rollback
`6ac7ed0a2a88f0d0`. Schema remained `9` with exact migrations `0001..0009`;
there was no migration, backfill, manual SQL, env, DNS or tunnel change.

Independent verification observed service active/enabled, `NRestarts=0`, one
listener at `127.0.0.1:8790`, green local/public health and readiness, and
`cloudflare-authority`. One separately approved replay of the same complex
local WAV issued exactly one managed STT request and one
`openai/gpt-oss-120b` postprocess request, without retry. The raw postprocess
output contained the numbered multiline list and reconstructed filesystem path;
the native sanitizer preserved it unchanged. Private raw and final artifacts
remain local and are not operational receipts.

## Assigned Profile And Plan Projection — 2026-08-14

The account-profile cutover first deployed schema-compatible release
`a8dc509b64506240`. Source commit `b3c97c0` then separated the assigned
profile identity from its product plan in the desktop context contract. A clean
checkout produced immutable release `5d53030dca65cf0a`, archive SHA-256
`5d53030dca65cf0a0001b3e88cb2ebdbb96e111855799b4b8c6c0ba350c71572`.
The first Windows-worktree archive failed closed before install or restart
because its `0009` bytes did not match production; current remained
`a8dc509b64506240`.

The corrected archive reproduced twice, matched exact production checksums
`0001..0009`, promoted once and restarted once with
`a8dc509b64506240` preserved as the immediate schema-9 rollback. Independent
verification observed current `5d53030dca65cf0a`, service active/enabled,
`NRestarts=0`, unique `127.0.0.1:8790` listener, green local/public health and
readiness, and `cloudflare-authority`. There was no migration, backfill, manual
SQL, env, DNS or tunnel change. Authenticated desktop context returned assigned
profile `dictation-complete-v1` / `Dictado completo` and plan `pro` / `Pro` as
separate fields.


## Stop Conditions

Stop without repair beyond one bounded local correction if the port is occupied, bind is not exact loopback, memory or disk falls below 1 GiB, schema/checksum/authority diverges, a secret or sensitive body appears, the off-host age identity is unavailable, the dirty VPS checkout would need mutation, or any provider/import/DNS/Tunnel/canary/cutover/public traffic/dependency becomes necessary.
