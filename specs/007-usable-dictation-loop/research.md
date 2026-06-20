# Research: Usable Dictation Loop

## Findings From Fan-out

### Current usable gap

- `src/App.tsx` captures through `NativeTauriCaptureGateway` in Tauri and `FakeCaptureGateway` in browser/dev.
- Captured artifacts can be submitted, but the app still builds `PipelineService` with `createCapturedAudioTranscriptionAdapter()` from `model-gateway/direct-stt`.
- `HostRuntimeClient` exists but is not wired into production UI.
- Tauri commands `get_runtime_transcription_readiness` and `transcribe_captured_audio` are registered but `transcribe_captured_audio` returns `HOST_RUNTIME_UNAVAILABLE` after path validation.

### What 005 already solved

- Runtime response/recovery concepts for captured audio transcription.
- Honest delivery evidence and no `paste_observed` without proof.
- Groq STT adapter with injected API key/fetch/audio reader.
- Safe runtime script wrappers and gated real provider mode.

### What 006 already solved

- Host-runtime TypeScript types, artifact policy, readiness, redaction, transcriber, fake/unavailable clients, and Tauri invoke client.
- Provider-free guardrails for React.
- Rust command shape and safe unavailable stub.
- Tests for fake host client mapping and Tauri invoke payload safety.

## Decisions

### Decision 1: Wire UI to host client before real provider implementation

**Decision**: The first 007 batch should replace the UI STT shell path with `HostRuntimeClient` while allowing the Tauri command to remain unavailable.

**Rationale**: This is safe, small, testable, and moves production UI onto the correct boundary without touching secrets/provider HTTP yet.

**Alternatives considered**:

- Implement real Rust provider first: higher product value but mixes provider credentials, filesystem reads, dependencies, and UI wiring.
- Continue with direct-local STT shell: preserves current behavior but does not move toward usable app architecture.

### Decision 2: Keep real provider calls out of default checks

**Decision**: All default test/build/check commands stay provider-free. Real provider verification requires explicit local approval and a non-default command or manual invocation.

**Rationale**: Protects CI, secrets, cost, privacy, and repeatability.

### Decision 3: Treat manual copy as the first delivery path

**Decision**: 007 should make transcript review and copy fallback reliable before adding hotkeys, paste automation, tray, or selected text replacement.

**Rationale**: Copy fallback is enough for first usability and avoids false delivery claims.

### Decision 4: Defer broad desktop ergonomics

**Decision**: Hotkeys, tray, settings expansion, selected text capture/replacement, history, and paste observation stay out of 007.

**Rationale**: The app is not usable until transcription works through the host boundary; ergonomics should not distract from that core loop.

## Resolved Technical Decision: Real Host Provider Route

### Decision 5: Implement the real provider path natively in Rust

**Decision**: Use native Rust HTTP/multipart implementation in `src-tauri/src/runtime_transcription.rs` for the real host-provider path. Keep it behind explicit local gating with provider calls disabled in default checks.

**Rationale**: JP selected the Rust-native route on 2026-06-19. This keeps provider ownership in the Tauri host, avoids renderer secrets, and fits a single desktop binary/product boundary better than shelling out to a local script.

**Implementation implications**:

- Add only the Rust dependencies required for host-side HTTP/multipart/env handling after tests define setup/path/provider/error behavior.
- Preserve the existing TypeScript `HostRuntimeClient` contract and React provider-free guardrails.
- Validate artifact paths before any file read or provider call.
- Redact credentials, auth headers, raw provider payloads, request ids, and secret-looking diagnostics before returning to React or writing reports.
- Keep real provider verification manual/gated and never part of default checks.

**Alternative considered**: Reusing `scripts/runtime-transcription.ts` as a local script/sidecar would reuse tested TS behavior, but adds process management, shell permissions, packaging, and product-boundary debt. It remains a reference implementation, not the selected 007 route.
