# Implementation Plan: Fixvox Audio Runtime Parity

**Branch**: `[018-fixvox-audio-runtime-parity]` | **Date**: 2026-07-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-fixvox-audio-runtime-parity/spec.md`

## Summary

Bring the local dictation runtime closer to Fixvox for the audio/runtime layer JP now wants: local VAD/no-speech, silence auto-stop, long-audio optimization, mute-output during recording, optional sound cues, and redacted stage telemetry. Stop phrase detection remains out of scope.

## Technical Context

**Language/Version**: TypeScript strict, React/Vite, Rust 2021/Tauri v2, PowerShell smoke scripts  
**Primary Dependencies**: Existing Tauri host commands, CPAL/Hound capture path, managed Fixvox Cloud runtime, existing Settings/Presets/Hotkeys surfaces, FFmpeg 7.1.1 Essentials GPLv3 packaged as a Windows x64 Tauri sidecar  
**Storage**: Host-owned app data preference files; local artifacts under `artifacts/` for evidence; no raw audio/transcript in docs  
**Testing**: Vitest provider-free tests, Rust `cargo check`, targeted cargo tests where stable, Playwright/CDP or PowerShell smoke for host-owned side effects  
**Target Platform**: Windows desktop first  
**Project Type**: Desktop app + local host runtime + managed cloud proxy  
**Performance Goals**: No-speech rejected locally before provider; auto-stop within 500 ms of configured silence duration; long-audio optimization reduces artifact size by at least 40% or records fallback  
**Constraints**: No raw transcript/audio in docs or telemetry; production mutations/deploys gated; foreground target and output mute smokes require explicit side-effect scope; FFmpeg redistribution keeps pinned provenance, hashes, GPLv3 license and notices  
**Scale/Scope**: JP/dev power-user local workflow first; code paths must remain provider-free testable

## Constitution Check

- Small batch discipline: split into independently testable batches (VAD/no-speech, auto-stop, optimization, mute/cues, telemetry integration).
- Privacy guardrail: telemetry and artifacts must be redacted; no raw audio/transcript in docs/responses.
- Side-effect guardrail: mute-output, real microphone, foreground target, provider calls, and production deploys remain gated.
- Fixvox-source guardrail: read `C:/dev/fixvox` behavior before claiming parity.

## Project Structure

### Documentation (this feature)

```text
specs/018-fixvox-audio-runtime-parity/
├── spec.md
├── plan.md
├── tasks.md
├── checklists/requirements.md
└── quickstart.md
```

### Source Code (repository root)

```text
src/capture/                         # capture service contracts and audio prep adapters
src/desktop-control/                 # dictation key/session flow integration
src/pipeline/                        # pipeline summary/events and delivery evidence integration
src/settings/                        # preferences for mute, auto-stop, cues if surfaced in Settings
src/voice-dock/                      # dock state/cues/auto-stop affordances
src-tauri/src/                       # host-owned capture, audio prep, mute/cue hooks
src-tauri/binaries/                  # target-named FFmpeg Windows x64 sidecars
src-tauri/third-party/ffmpeg/        # pinned provenance, GPLv3 license and notices
scripts/                             # gated smoke scripts
tests/capture/                       # provider-free audio prep tests
tests/desktop-control/               # session/controller tests
tests/settings/                      # settings preference tests
tests/voice-dock/                    # UI/state tests
```

**Structure Decision**: Use existing capture, desktop-control, settings, pipeline and Rust host boundaries. Package FFmpeg as a short-lived Tauri sidecar beside the installed executable; do not add a long-running service or shell plugin.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| ----------- | ------------ | ------------------------------------- |
| Host-owned output mute/sound cues | They touch OS audio state and must be restored safely | Renderer-only toggles cannot guarantee system-level mute/restore |
| Audio optimization path | Long recordings need upload/runtime parity with Fixvox | Always uploading WAV keeps avoidable latency/bandwidth for long dictations |
