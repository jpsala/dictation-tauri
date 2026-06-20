# Data Model: Usable Dictation Loop

## Host Client Runtime

Renderer-safe transcription boundary selected by environment.

Fields/shape:

- `kind`: `tauri` | `browser-unavailable` | `fake-test`
- `client`: `HostRuntimeClient`
- `label`: user-visible short label
- `readiness`: latest `HostRuntimeReadiness` when available

Rules:

- Tauri runtime uses fixed invoke commands from 006.
- Browser/dev fallback must not call providers.
- Fake test runtime must be injectable and deterministic.

## Usable Dictation Run

One user-facing attempt to turn a captured audio artifact into text and copy/recovery evidence.

Fields/shape:

- `runId`: stable pipeline/host run id
- `capture`: captured artifact evidence from MVP3
- `hostReadiness`: readiness snapshot if checked
- `transcription`: host response mapped to pipeline summary
- `deliveryEvidence`: available/copied/failed/uncertain/observed only when proven
- `recoveryAction`: retry, inspect setup, copy manually, record again, or none

Rules:

- No overlapping active run should corrupt current run state.
- Transcript availability is distinct from delivery success.
- A captured clip should remain retryable when path evidence exists.

## Readiness Surface

UI projection of `HostRuntimeReadiness`.

Fields/shape:

- `configured`: boolean
- `provider`: optional safe label
- `model`: optional safe label
- `reason`: optional redacted setup error
- `artifactRoot`: expected local artifact root
- `supportsRealProviderCall`: boolean

Rules:

- Readiness does not read audio or call providers.
- Secret values and raw `.env` values must never be exposed.
- Readiness failure should not block recording/capture.

## Transcript Review

Visible transcript review state for manual copy.

Fields/shape:

- `text`: transcript text in memory
- `provider`: safe provider label
- `model`: safe model label
- `latencyMs`: optional timing
- `requestId`: optional redacted request evidence
- `transcriptPath`: optional ignored local path
- `reportPath`: optional ignored local path

Rules:

- Text may be shown for current review/manual copy.
- Local transcript files remain ignored and should not be committed.
- Provider payloads remain disabled unless a later spec enables them.

## Copy Fallback Evidence

Honest delivery evidence for first usable delivery.

Fields/shape:

- `status`: `available` | `copied` | `failed` | `uncertain` | `observed`
- `output`: transcript text when available for copy/recovery
- `reason`: safe user-facing explanation

Rules:

- `observed` is prohibited until a verified paste-observation path exists.
- Clipboard failure must keep transcript text visible when possible.
