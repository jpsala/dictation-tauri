# Specification: Fixvox Auth, User Groups, And Policy Capabilities

## User Need

Fixvox Tauri should stay easy to try, but anything beyond the most basic workflow should be controlled by Fixvox Cloud login and policy. JP needs an admin-manageable way to grant different user groups capabilities, from `translate-only` up to full dictation/assistant power, without hardcoding behavior into the desktop client.

## Product Decision

Use a two-tier access model:

1. **Anonymous/basic device mode**
   - The app can create a local `installId` and show limited/basic functionality without login.
   - This mode is for low-friction onboarding, local setup checks, and possibly very limited translate/demo usage.
   - It must not silently unlock managed dictation, advanced settings, assistant actions, or high-cost cloud lanes.

2. **Signed-in managed mode**
   - Anything more than basic requires user authentication through Fixvox Cloud.
   - Supported auth targets: email magic link first, Google OAuth, and GitHub OAuth as an early/dev-friendly provider.
   - Login links the desktop device to a cloud user and receives a policy snapshot with capabilities and limits.

## Concepts

```text
User
  -> Org / Workspace optional later
    -> Group / Membership
      -> Policy Template
        -> Capabilities + Limits
Device
  -> anonymous installId first
  -> linked to User after login
  -> caches redacted policy snapshot host-owned
```

## Capability Model

Capabilities should be product-level entitlements, not UI flags only. Initial capability vocabulary:

- `translate`
- `dictation`
- `postprocess`
- `selection_transform`
- `assistant_actions`
- `custom_prompts`
- `advanced_settings`
- `debug_tools`
- `managed_stt`
- `managed_llm`

Example policy templates:

| Template | Intent | Example capabilities |
| --- | --- | --- |
| `basic-anonymous` | Install and try with minimal cloud cost | local setup, maybe limited translate only |
| `translate-only` | User can translate, not dictate/transform broadly | `translate`, `managed_llm` with limits |
| `dictation-basic` | Normal managed dictation | `dictation`, `managed_stt`, safe postprocess |
| `pro` | Daily-driver Fixvox | dictation, postprocess, transforms, history/recovery, advanced settings |
| `power` / `admin` | Internal/power user | all product capabilities plus debug tools |

## Required Enforcement

- The cloud must enforce capabilities at every managed endpoint.
- The Tauri client may hide or disable UI, but UI gating is only convenience.
- Runtime must fail closed when a required capability is missing.
- BYOK/dev fallback must remain explicit and never unlock a denied managed capability silently.

Cloud error shape should be explicit and redacted:

```json
{
  "error": "capability_not_allowed",
  "requiredCapability": "assistant_actions",
  "policyId": "translate-only"
}
```

## Desktop Login UX

Preferred Tauri login flow:

1. User clicks `Sign in` in Settings/Cloud.
2. Tauri opens the external browser to Fixvox Cloud auth.
3. User signs in with email magic link, Google, or GitHub.
4. Cloud completes OAuth/session.
5. Tauri receives completion via custom protocol or device-code polling.
6. Rust host stores session/refresh material in host-owned secure storage where available; no tokens in React state, logs, or committed files.
7. Tauri registers/links the device, refreshes policy, and updates Settings.

Custom protocol is preferred for smooth desktop UX, but a device-code flow is acceptable as the first robust implementation if it reduces OAuth complexity.

## Admin UX Direction

Fixvox Cloud should eventually expose an admin surface for:

- users;
- devices;
- groups;
- policy templates;
- invite links/codes for beta/internal grants;
- capability and limits editing;
- device revoke/unlink.

Invite codes remain useful for beta/private grants, but should not be the main long-term access model.

## Privacy / Security Guardrails

- Never print or commit auth tokens, refresh tokens, invite codes, full user IDs, full device IDs, transcripts, selected text, or audio.
- Reports/docs should use redacted IDs, hashes, lengths, and coarse labels.
- Use host-owned persistence for session/device state; React receives only redacted status and capabilities.
- Login/account creation is an external/account side effect and requires explicit user approval during local smokes.

## Open Questions

- Should first implementation use custom protocol callback or device-code polling?
- Which cloud auth provider backs email/Google/GitHub in our infra?
- What exact features are allowed in anonymous/basic mode?
- Whether org/workspace is needed immediately or can be deferred behind single-user groups.
