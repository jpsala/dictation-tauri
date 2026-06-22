# Tasks: Fixvox Cloud Runtime Port

**Input**: `docs/topics/fixvox-cloud-runtime-port.md`, Fixvox cloud contracts, existing host-runtime boundary.

**Rule**: TDD-first. Default checks must not call Fixvox/Groq. Real cloud smoke requires explicit JP approval.

## Phase 1: Study Lock And Contract Tests

- [x] T001 Add contract fixtures for Fixvox register/preflight/STT responses without network.
- [x] T002 Add tests for backend URL resolution and stale `fixvox-api.jpsala.dev` avoidance.
- [x] T003 Add tests proving managed STT uses `X-Device-Id` and no vendor bearer token.
- [x] T004 Add tests proving direct Groq remains explicit BYOK/dev fallback only.
- [x] T005 Add tests mapping `X-Fixvox-*` headers into typed host metadata.

## Phase 2: Host Cloud Config And Device Registration

- [x] T006 Add Rust host config for Fixvox cloud base URL, install id and device id.
- [x] T007 Implement device register client behind test seam.
- [x] T008 Persist minimal device/register snapshot outside React.
- [x] T009 Extend readiness response with managed cloud/device states.

## Phase 3: Managed STT Transport

- [x] T010 Implement proxied multipart STT request to `/v1/audio/transcriptions`.
- [x] T011 Parse transcript body and Fixvox proxy headers.
- [x] T012 Write redacted transcript/report artifacts under allowed roots.
- [x] T013 Keep provider-free `Check host boundary` behavior unchanged.

## Phase 4: Preflight And Fail-Closed Behavior

- [x] T014 Implement `/v2/execution/preflight` client for transcription estimates.
- [x] T015 Deny managed execution locally on policy/quota/auth/backend failures.
- [x] T016 Prove managed mode does not silently fall back to direct Groq.

## Phase 5: UI Gate And Manual Smoke

- [x] T017 Update readiness UI copy for managed cloud vs direct BYOK.
- [x] T018 Add focused UI tests for cloud-ready/device-needed/backend-unavailable states.
- [x] T019 Run default safe checks.
- [x] T020 With JP approval, run one real managed cloud transcription smoke and record redacted evidence.
  - Evidence: `bun scripts/fixvox-managed-smoke.ts --allow-provider-call` returned `ok: true` via `fixvox-cloud` (`whisper-large-v3`), request id/metadata present, transcript length 14, raw provider payload not stored; redacted local report at `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-21T20-47-42-890Z.json` (ignored).

## Phase 6: Follow-up Candidates

- [x] T021 Port Fixvox postprocess prompt through managed `/v1/chat/completions`.
  - Evidence: `bun scripts/fixvox-managed-smoke.ts --allow-provider-call --postprocess` returned STT `ok` plus postprocess `ok` via managed `/v1/chat/completions` (`openai/gpt-oss-120b`), request ids/metadata present for both calls, raw provider payload not stored; redacted local report at `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-21T21-08-53-854Z.json` (ignored).
- [ ] T022 Evaluate porting Fixvox VAD/no-speech/prosody heuristics to Rust/Tauri.
- [x] T023 Decide delivery/hotkey next spec after cloud STT is stable.
  - Decision: created `specs/010-desktop-dictation-control-delivery/` to scope session control, honest delivery evidence, fake desktop control events, and gated minimal hotkey work after managed cloud STT/postprocess.
