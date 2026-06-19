# Data Model: Runtime Transcription And Delivery

## Captured Clip

Represents an existing microphone audio artifact submitted for runtime
transcription.

Fields:

- `artifactId`: Stable id of the captured artifact.
- `captureId`: Capture session id that produced the artifact.
- `path` / `relativePath`: Local artifact location, preferably repo-relative for
  dev evidence.
- `mimeType`, `extension`, `sizeBytes`, `durationMs`: Format and size evidence.
- `sampleRateHz`, `channelCount`: Optional audio metadata when known.
- `sensitivity`: `real-user-audio` for real microphone data.
- `policy`: `gitignored-local` for repo-local development artifacts.
- `createdAt`: Capture time when known.

Validation:

- The clip must exist and be readable before provider submission.
- Dev artifacts must remain under `artifacts/microphone-capture/audio/` or an
  explicitly documented app-data path.
- Clip metadata must not contain raw audio bytes or provider credentials.

## Transcription Run

Represents one attempt to turn a captured clip into transcript text.

Fields:

- `runId`: Stable runtime/pipeline run id.
- `clip`: Captured Clip reference or safe metadata.
- `status`: `queued`, `transcribing`, `completed`, `setup_failed`,
  `provider_failed`, `empty`, `cancelled`, or `blocked_overlap`.
- `provider`, `model`, `mode`: Provider identity and gateway mode when known.
- `startedAt`, `endedAt`, `latencyMs`: Timing evidence.
- `requestEvidence`: Redacted evidence such as request id presence or redacted
  request label.
- `error`: Redacted setup/provider/runtime error when failed.
- `retryable`: Whether retrying the same clip is safe.

Validation:

- Only one non-terminal run may be active for the runtime pipeline.
- `completed` requires a non-empty Transcript Result.
- `setup_failed` and `provider_failed` must include redacted diagnostics only.
- `blocked_overlap` must preserve the original active run state.

## Transcript Result

Represents text availability independent from delivery.

Fields:

- `status`: `available`, `empty`, or `unusable`.
- `text`: Transcript text when available.
- `language`: Optional detected or requested language.
- `provider`, `model`, `latencyMs`, `requestId`: Safe provider evidence.
- `localArtifactPath`: Optional ignored transcript/report path for local dev.
- `classificationReason`: User-safe reason for empty/unusable outcomes.

Validation:

- Empty string or whitespace-only text is `empty`, not `available`.
- `available` text may be shown for review/manual copy but should not be written
  to tracked docs/logs.
- Local transcript artifacts must be ignored by git.

## Delivery Evidence

Represents what happened after text became available.

Fields:

- `status`: `available`, `copied`, `paste_sent`, `paste_observed`, `failed`, or
  `uncertain`.
- `output`: Text made available or passed to a delivery action.
- `reason`: User-safe explanation.
- `observedAt`: Timestamp only for verified observation.
- `targetEvidence`: Optional redacted target/app evidence for future observed
  delivery.

Validation:

- `paste_observed` is invalid unless a verified observation path exists.
- `copied` means clipboard/manual-copy fallback, not observed paste.
- Delivery failure must not erase a successful transcript.

## Recovery Action

Represents the next safe user action after any terminal state.

Fields:

- `kind`: `retry_transcription`, `inspect_setup`, `copy_manually`,
  `record_again`, `view_local_artifact`, or `none`.
- `label`: User-facing action label.
- `reason`: Short explanation.
- `clipAvailable`: Whether retry can use the same captured clip.
- `safeDetails`: Optional redacted diagnostics.

Validation:

- Missing provider setup offers `inspect_setup` or `retry_transcription` after
  configuration.
- Provider failure offers retry if the clip is still available.
- Empty/unusable transcript offers record again and may offer retry.
- Successful transcription with failed/uncertain delivery offers manual copy.

## State Transitions

```text
captured clip
  -> queued
  -> transcribing
  -> completed + transcript available
  -> delivery available/copied/failed/uncertain

captured clip
  -> queued
  -> setup_failed/provider_failed/empty/cancelled
  -> recovery action

any active runtime run
  -> blocked_overlap for new overlapping requests
```

Terminal run statuses: `completed`, `setup_failed`, `provider_failed`, `empty`,
`cancelled`, `blocked_overlap`.
