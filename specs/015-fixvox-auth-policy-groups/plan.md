# Implementation Plan: Fixvox Auth, User Groups, And Policy Capabilities

## Summary

Evolve Fixvox Tauri from invite/device activation toward cloud-authenticated users and admin-managed policy groups. Keep anonymous install/device mode for basic onboarding, require login for managed/product capabilities, and make capabilities enforceable server-side and host-side.

## Technical Context

- Current app already has host-owned `installId`, optional `deviceId`, cloud activation, policy snapshots, and managed STT/postprocess.
- Current Settings/Cloud UI can display redacted health, capabilities, and actions.
- Fixvox Cloud is the canonical control-plane for device, activation, policy/preflight, and managed runtime.
- Tauri/Rust must own account/session/device side effects and persistence; React only displays redacted auth/policy state and triggers explicit commands.

## Target Architecture

```text
Anonymous Tauri install
  -> installId + basic local/cloud-limited status
  -> Sign in with Fixvox Cloud
  -> user session linked to device
  -> policy snapshot with group/template/capabilities/limits
  -> managed runtime checks capabilities before calls
  -> cloud endpoints enforce the same capabilities
```

## Checkpoint A — Documented Contracts And Provider-Free Model

- Define auth/session/policy-group contracts in docs and pure TS/Rust types.
- Add provider-free tests for capability templates and required-capability checks.
- Extend existing `policySnapshot` shape to include user/group/template fields without requiring real login yet.

## Checkpoint B — Settings Cloud Login Surface

- Add Settings/Cloud UX for signed-out vs signed-in state.
- Show `Sign in to unlock` for non-basic capabilities.
- Keep all identifiers redacted.
- No real auth side effects in default tests.

## Checkpoint C — Host-Owned Auth Start Flow

- Add Rust/Tauri command to start login by opening external browser to a cloud auth URL.
- Prefer device-code flow first if it avoids custom protocol fragility; keep custom protocol as target for polished UX.
- Persist only host-owned session metadata/tokens; no token exposure to React.
- Real login smoke requires explicit JP approval.

## Checkpoint D — Link Device To User And Refresh Policy

- After login completion, link current `installId`/device to the authenticated user.
- Refresh policy snapshot with user/group/template/capabilities/limits.
- Settings shows group/template and next steps.

## Checkpoint E — Runtime Enforcement

- Add required capability checks before managed operations:
  - translate -> `translate` + `managed_llm` as needed;
  - dictation -> `dictation` + `managed_stt`;
  - postprocess -> `postprocess` + `managed_llm`;
  - assistant actions -> `assistant_actions` + relevant runtime lane.
- Preserve fail-closed behavior and no silent BYOK fallback.

## Checkpoint F — Admin/Cloud Follow-Up

- Define cloud-side admin operations in the Fixvox Cloud repo/spec before implementing production changes here:
  - create/update policy templates;
  - assign users/groups;
  - list/revoke devices;
  - issue beta invite links.

## Checks

Default/provider-free:

```powershell
npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control
npm run build
cd src-tauri && cargo fmt --check && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Gated/manual:

```powershell
# Requires explicit JP approval because it creates/logs into accounts or links devices.
npm run tauri:dev:hidden -- -StopExisting
# CUA/manual Settings -> Cloud -> Sign in smoke with redacted artifact.
```

## Guardrails

- No login/account/OAuth smoke without explicit approval.
- No publishing, deploy, release upload, or push without explicit approval.
- No auth tokens, invite codes, full user IDs, full device IDs, transcripts, selected text, or audio in docs/log output.
- Cloud must enforce capabilities; desktop UI gating is not security.
- Anonymous/basic mode must be intentionally limited and never unlock managed runtime by accident.
