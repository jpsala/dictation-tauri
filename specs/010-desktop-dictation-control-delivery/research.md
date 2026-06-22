# Research: Desktop Dictation Control And Delivery

## Inputs

- `005-runtime-transcription-delivery`: runtime outcomes, recovery, empty transcript, delivery evidence honesty.
- `007-usable-dictation-loop`: UI uses `HostRuntimeClient`, real host provider path is gated, manual copy is first delivery.
- `009-fixvox-cloud-runtime-port`: managed Fixvox STT and managed postprocess work with fail-closed preflight and no silent direct fallback.
- Fan-out findings on 2026-06-22: next value is desktop control/delivery; VAD/no-speech/prosody is useful but lower priority for product usability.

## Decision 1: Add A Session Controller Before Real Hotkeys

**Decision**: Implement a provider-free session/controller boundary before adding a real global shortcut.

**Rationale**: The app already has capture, host runtime, and delivery fragments. A controller provides one active lifecycle across start/stop/cancel/retry/delivery and lets fake host events prove semantics before desktop side effects.

**Alternatives considered**:

- Register a real hotkey first: rejected because it would add side effects before the app has a single controller contract.
- Keep logic only in `App.tsx`: rejected because current copy/delivery mutations are UI-local and harder to test across control sources.

## Decision 2: Keep Delivery Evidence Honest And Conservative

**Decision**: Delivery starts as review-only/manual copy/fake copy evidence. Future paste/send may emit `paste_sent` or `uncertain`, never `paste_observed` without a verified observation contract.

**Rationale**: Existing specs repeatedly forbid false paste observation. Clipboard write or keypress send is not equivalent to target insertion.

**Alternatives considered**:

- Claim delivered on clipboard success: rejected because copied text may not reach the target app.
- Implement Win32/UI automation observation now: rejected as a larger, fragile desktop integration that deserves a separate spec or later slice.

## Decision 3: Keep Managed Cloud Primary And Direct BYOK Explicit

**Decision**: 010 should orchestrate the existing host runtime; it must not redesign STT routing. Managed Fixvox cloud remains primary when ready; direct Groq remains explicit BYOK/dev fallback.

**Rationale**: 009 just established cloud transport and preflight. 010 is about control and delivery, not provider routing.

**Alternatives considered**:

- Add new provider routing in the controller: rejected as mixed responsibility.
- Silent fallback to direct provider on managed failure: rejected by 009 fail-closed behavior.

## Decision 4: Defer Tray/Background Settings Until Hotkey Semantics Work

**Decision**: Treat tray/background as P3/follow-up. If introduced, keep it minimal: show/hide window and explicit quit only.

**Rationale**: Tray lifecycle changes quit semantics and app availability. It should follow a working host-control contract rather than lead it.

**Alternatives considered**:

- Full tray/background in first slice: rejected as broad desktop ergonomics.
- Settings/remapping UI now: rejected because one fixed test shortcut is enough to validate the boundary.

## Decision 5: Test Real Desktop Side Effects Only In Gated Local Smokes

**Decision**: Default checks use fake control/delivery adapters. Real hotkey/provider/desktop delivery verification requires explicit local approval and redacted evidence.

**Rationale**: Protects CI, secrets, privacy, focus state, active desktop applications, and cost.

## Risks And Follow-Ups

- Target focus can change during dictation; any target snapshot is best-effort metadata, not delivery proof.
- Real hotkeys can conflict with OS/app shortcuts; start with a fixed local shortcut only after fake tests pass.
- Rust test executables have had shell launch issues (`STATUS_ENTRYPOINT_NOT_FOUND`); `cargo check` remains a required safe check and Rust test execution should be revisited if needed.
- T022 VAD/no-speech/prosody remains valuable for quality/cost but is separate from this usability slice.
