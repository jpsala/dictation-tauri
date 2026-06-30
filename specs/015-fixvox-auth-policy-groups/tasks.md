# Tasks: Fixvox Auth, User Groups, And Policy Capabilities

## Phase 1: Documentation / Decision

- [x] T001 Document product decision: anonymous basic mode plus login for anything beyond basic.
- [x] T002 Create spec/plan/tasks for auth, groups, and policy capabilities.
- [x] T003 Sync topic/track/working memory and run AOS audit.

## Phase 2: Provider-Free Contracts

- [x] T004 Define shared auth/policy group vocabulary: user, group, policy template, capabilities, limits, signed-in state.
- [x] T005 Add provider-free tests for capability templates: `basic-anonymous`, `translate-only`, `dictation-basic`, `pro`, `power/admin`.
- [x] T006 Add required-capability helper tests so runtime fails closed before managed calls.

## Phase 3: Settings Cloud UX

- [x] T007 Extend Settings/Cloud view with signed-out/signed-in states and `Sign in to unlock` copy.
- [x] T008 Keep all auth/user/device identifiers redacted in Settings and tests.
- [x] T009 Add visual/DOM smoke for Settings Cloud signed-out/basic state without real auth.

## Phase 4: Host-Owned Login Start

- [x] T010 Add Tauri command contract to start Fixvox Cloud login in external browser.
- [x] T011 Choose first completion mechanism: device-code polling or custom protocol callback.
- [x] T012 Persist session metadata/tokens host-owned only; expose redacted status to React.
- [x] T013 Add provider-free Rust/TS tests for login state and token redaction.

## Phase 5: Device Link + Policy Refresh

- [x] T014 Link current install/device to signed-in user after auth completion.
- [x] T015 Refresh policy snapshot including user/group/template/capabilities/limits.
- [x] T016 Settings displays group/template and actionable next step.

## Phase 6: Runtime Enforcement

- [x] T017 Enforce `dictation` + `managed_stt` before managed dictation.
- [x] T018 Enforce `postprocess` + `managed_llm` before managed postprocess.
- [x] T019 Enforce `translate` and `assistant_actions` for future translate/assistant lanes.
- [x] T020 Ensure denied managed capability never falls back silently to BYOK/direct provider.

## Phase 7: Gated Real Smoke

- [ ] T021 With explicit JP approval, run a redacted login/link smoke against Fixvox Cloud. Browser Google OAuth handoff completed; provider-free host link contract now calls `/desktop/login/link-device`, persists returned policy/authPolicy, and Settings shows active policy when capabilities arrive. Real smoke 2026-06-30 was attempted with JP approval for T021 only and is blocked: signed-in status was redacted/OK, but Cloud returned `FIXVOX_LOGIN_DEVICE_LINK_REJECTED` / `Not found` for `/desktop/login/link-device`; no authPolicy was persisted and managed capabilities stayed fail-closed. Evidence: `artifacts/desktop-control/fixvox-login-link-smoke/20260630-T021-login-link-cdp/report.json`.
- [ ] T022 With explicit JP approval, verify a signed-in policy group unlocks managed dictation and a denied group fails closed.

## Guardrails

- No real login/account/OAuth/device-link smoke without explicit JP approval.
- No publish, deploy, release upload, or push.
- No printing or committing auth tokens, invite codes, full user IDs, full device IDs, transcripts, selected text, or audio.
- React must not store auth tokens or own security decisions.
- Cloud enforcement is mandatory; desktop gating is UX only.
