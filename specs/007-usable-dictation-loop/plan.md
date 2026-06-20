# Implementation Plan: Usable Dictation Loop

**Branch**: `main` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-usable-dictation-loop/spec.md`

## Summary

Make the app usable by routing captured microphone artifacts through the host-runtime boundary introduced in 006, surfacing readiness/setup state in the UI, and preserving honest transcript/copy recovery. The first safe slice wires React to `HostRuntimeClient` without provider code in the renderer. A later gated slice can replace the current Rust `HOST_RUNTIME_UNAVAILABLE` stub with a real host-side provider implementation.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Vite 8.x, Tauri 2.11.x, Rust 1.89.x.

**Primary Dependencies**: Existing React app, `PipelineService`, `HostRuntimeClient`, `createTauriHostRuntimeClient`, `createUnavailableHostRuntimeClient`, Tauri `invoke`, native capture commands, host-runtime response types. No new package dependency planned for the first UI wiring slice.

**Storage**: Existing ignored development artifacts under `artifacts/microphone-capture/`. No product history or durable persistence in this feature.

**Testing**: Vitest host-runtime/UI mapping tests, provider-free import guard, visual smoke if UI text changes, `npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo check`. Real provider verification remains manual/gated and is not part of default checks.

**Target Platform**: Windows desktop Tauri, with browser/dev unavailable/fake fallback for tests.

**Project Type**: Desktop app with pure TypeScript pipeline domain, React UI, and Tauri/Rust host side effects.

**Constraints**:

- React must stay provider-free.
- No provider calls in CI/default scripts.
- No secrets in React, reports, git, assistant output, or user-visible logs.
- UI claims must not exceed evidence.
- Captured artifact paths must be validated host-side before reads.
- No broad desktop ergonomics: no hotkeys, tray, selected text, settings expansion, history, or paste observation.

## Constitution Check

- Human-Centered Outcomes: PASS. The feature targets the first actually usable dictation loop: capture, transcribe, review, copy/recover.
- Privacy And Data Boundaries: PASS. Credentials and provider calls stay behind the host boundary.
- Durable Operational State: PASS. No product persistence is added; artifacts remain ignored local dev outputs.
- Spec-Led Incremental Delivery: PASS. The work is split into UI wiring, readiness, real host provider, and copy evidence slices.
- Surface-Appropriate Design: PASS. UI remains compact/state-first and follows `PRODUCT.md`/`DESIGN.md`.

## Project Structure

```text
specs/007-usable-dictation-loop/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── usable-dictation-loop.md
└── tasks.md

src/
├── App.tsx                         # host-client wiring and readiness UI
├── host-runtime/
│   ├── client.ts
│   ├── tauri-client.ts
│   └── types.ts
├── pipeline/
└── model-gateway/                  # must not be imported by App as provider-specific code

src-tauri/src/
├── lib.rs
├── native_capture.rs
└── runtime_transcription.rs        # currently safe unavailable stub; real provider later

tests/
├── host-runtime/
└── visual/
```

**Structure Decision**: Keep the first implementation inside existing files and tests. Add helpers only if extracting host-client pipeline mapping from `tests/host-runtime/ui-client.test.ts` makes production code smaller and more testable.

## Phase 0 Research

See [research.md](research.md).

Key findings:

- Native capture already creates WAV artifacts under the allowed host-runtime audio root.
- `HostRuntimeClient` and Tauri invoke client already exist and are tested.
- `src/App.tsx` still uses `createCapturedAudioTranscriptionAdapter()` from `model-gateway/direct-stt` and copy says "STT shell".
- Rust host transcription commands are registered but currently return unavailable/setup-error after path validation.
- Existing fake host UI tests already prove much of the desired mapping; production UI wiring can reuse that approach.

## Phase 1 Design

Contract: [contracts/usable-dictation-loop.md](contracts/usable-dictation-loop.md)

Design decisions:

1. `App.tsx` should create a host runtime client with environment selection:
   - Tauri: `createTauriHostRuntimeClient(invoke)`.
   - Browser/dev/tests: `createUnavailableHostRuntimeClient()` or injected fake in tests.
2. Pipeline transcription adapter should call `hostClient.transcribeCapturedAudio()` and map `HostTranscriptionResponse` to the pipeline adapter result shape.
3. Readiness should be displayed as setup evidence and must not block capture.
4. While Rust remains a stub, UI should honestly say host transcription is unavailable/setup-needed.
5. Real provider support should be a separate gated batch that decides the host implementation route before adding dependencies.

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS.
- Privacy And Data Boundaries: PASS.
- Durable Operational State: PASS.
- Spec-Led Incremental Delivery: PASS.
- Surface-Appropriate Design: PASS.

## Complexity Tracking

No constitution violations.

Known complexity: JP selected the native Rust HTTP/multipart route for the real host-provider path. This will likely require new Rust dependencies and extra redaction/error mapping tests, but keeps provider ownership in the Tauri host and avoids script/sidecar packaging debt.
