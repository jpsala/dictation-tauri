# Data Model: Real Microphone Capture

## Capture Session

Represents one user-initiated microphone recording attempt.

Fields:

- `captureId`: Stable id for the attempt.
- `runId`: Pipeline run id if submitted to pipeline.
- `state`: `idle`, `permission_needed`, `requesting_permission`, `recording`, `stopping`, `captured`, `failed`, or `cancelled`.
- `startedAt`: Timestamp when capture was requested.
- `stoppedAt`: Timestamp when capture stopped, if reached.
- `durationMs`: Derived duration when available.
- `source`: `microphone`.
- `deviceLabel`: Redacted or user-safe device label when available.
- `error`: Redacted capture error when failed.

Validation:

- One active capture session at a time.
- `captured` requires a captured audio artifact.
- Terminal states are `captured`, `failed`, and `cancelled`.

## Microphone Permission State

Represents whether capture may be attempted.

Fields:

- `status`: `unknown`, `prompting`, `granted`, `denied`, `unavailable`, or `error`.
- `reason`: User-safe setup message.
- `checkedAt`: Timestamp of latest check or prompt result.

Validation:

- `denied`, `unavailable`, and `error` must not include raw OS/browser
  diagnostics beyond redacted category/message.

## Captured Audio Artifact

Local audio output from one capture session.

Fields:

- `artifactId`: Stable id.
- `captureId`: Owning capture session.
- `path`: Local artifact path or artifact URI.
- `relativePath`: Repo-relative dev artifact path when applicable.
- `mimeType`: Recorder-selected MIME type.
- `extension`: File extension chosen from MIME support.
- `sizeBytes`: Blob/file size.
- `durationMs`: Duration from capture metadata.
- `sampleRateHz`: Optional if known.
- `channelCount`: Optional if known.
- `sensitivity`: `real-user-audio`.
- `policy`: `gitignored-local`.

Validation:

- Path must remain under `artifacts/microphone-capture/` for repo-local dev
  artifacts.
- Real microphone artifacts must never be versioned.

## Capture Metadata

Non-secret metadata attached to the pipeline ledger.

Fields:

- `captureId`
- `source`: `microphone`
- `artifactPolicy`
- `durationMs`
- `mimeType`
- `sizeBytes`
- `permissionStatus`
- `deviceKind`: `audioinput`

Validation:

- Must be safe to include in tests, reports, logs, and assistant summaries.
- Must not contain raw audio, transcript text beyond pipeline transcript fields,
  secrets, or full private provider diagnostics.

## Dictation Run

Existing pipeline execution extended to accept microphone capture evidence.

Fields:

- Existing MVP1/MVP2 summary fields.
- `capture`: Optional capture metadata.
- `inputKind`: `simulated`, `synthetic-fixture`, `local-audio-fixture`, or `microphone`.
- `transcript`: Optional transcript.
- `delivery`: Optional delivery evidence.

Validation:

- Summary remains derived from event ledger.
- A run cannot be active while another capture/run is active unless a later spec
  explicitly changes concurrency rules.

## Delivery Evidence

Represents certainty of text handoff.

Fields:

- `status`: `available`, `copied`, `paste_sent`, `paste_observed`, `failed`, or `uncertain`.
- `output`: Text made available or delivered.
- `reason`: Optional user-safe explanation.
- `observedAt`: Timestamp only if observation exists.

Validation:

- `paste_observed` may only be used when an implementation verifies target
  observation.
- First MVP3 implementation may close with `available` or `copied`.

## State Transitions

```text
idle
  -> permission_needed
  -> requesting_permission
  -> recording
  -> stopping
  -> captured
  -> transcribing
  -> available/delivering
  -> completed

Any non-terminal capture or pipeline state
  -> failed
  -> cancelled
```

Terminal capture states: `captured`, `failed`, `cancelled`.

Terminal pipeline states remain `done`, `error`, and `cancelled`.
