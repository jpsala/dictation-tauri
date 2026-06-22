# Data Model: Desktop Dictation Control And Delivery

## DesktopDictationSession

One end-to-end user-facing dictation attempt.

Fields:

- `sessionId`: stable id for the attempt.
- `controlSource`: `app_button` | `fake_host_event` | `global_hotkey` | `tray` | `unknown`.
- `state`: `idle` | `arming` | `listening` | `stopping` | `transcribing` | `postprocessing` | `reviewing` | `delivering` | `done` | `error` | `cancelled`.
- `capture`: optional captured artifact metadata from existing capture adapters.
- `runtime`: optional host transcription/postprocess evidence.
- `delivery`: optional `DeliveryEvidence`.
- `recoveryAction`: optional next step.
- `startedAt`, `endedAt`: timestamps or monotonic test clock values.
- `error`: optional redacted terminal error.

Rules:

- Only one session may be active.
- A session reaches exactly one terminal state: `done`, `error`, or `cancelled`.
- Provider calls happen only after a clip exists and an explicit run path allows them.
- Partial text must not be delivered after cancellation.

## DesktopControlEvent

A normalized control signal consumed by the session controller.

Fields:

- `id`: event id for dedupe/testing.
- `source`: `app_button` | `fake_host_event` | `global_hotkey` | `tray` | `unknown`.
- `action`: `start` | `stop` | `toggle` | `cancel` | `retry`.
- `receivedAt`: timestamp/test clock.
- `targetSnapshot`: optional `DesktopTargetSnapshot` captured before action.

Rules:

- Fake events and app buttons must share the same controller path.
- Rapid duplicate toggle events must not create overlapping sessions.

## DeliveryRequest

A request to make final text usable outside the app.

Fields:

- `sessionId`
- `text`: final transcript/postprocessed output.
- `strategy`: `review_only` | `copy` | `paste_send`.
- `allowDesktopSideEffects`: boolean.
- `targetSnapshot`: optional `DesktopTargetSnapshot`.

Rules:

- `review_only` and fake adapters are the default safe path.
- Real desktop side effects require explicit gating and a host/renderer adapter that can be tested with fakes.

## DeliveryEvidence

The proof level for delivery.

Fields:

- `status`: `available` | `copied` | `paste_sent` | `failed` | `uncertain` | `paste_observed`.
- `output`: optional text available for review/copy.
- `strategy`: `review_only` | `copy` | `paste_send` | `unknown`.
- `message`: user-facing summary.
- `reason`: optional redacted failure/uncertainty reason.
- `targetBefore`: optional `DesktopTargetSnapshot`.
- `targetAfter`: optional `DesktopTargetSnapshot`.

Rules:

- `paste_observed` is forbidden until a future observer proves target insertion.
- `copied` means only clipboard/write success, not target insertion.
- `paste_sent` means a send action was issued but not observed.
- `available` means text is visible/recoverable in the app.

## DesktopTargetSnapshot

Best-effort metadata about the focused desktop target.

Fields:

- `capturedAt`
- `appLabel`: redacted or generic label.
- `windowLabel`: optional redacted/generic label.
- `confidence`: `none` | `low` | `medium` | `high`.

Rules:

- Target snapshots are not paste observation.
- Snapshots must not include sensitive titles/content unless explicitly redacted.
- Initial implementation may omit target snapshots entirely.

## DesktopControlReadiness

Redacted readiness for desktop-control capabilities.

Fields:

- `controlAvailable`: boolean.
- `hotkeyRegistered`: boolean.
- `deliveryAvailable`: boolean.
- `backgroundModeAvailable`: boolean.
- `reason`: optional redacted reason.

Rules:

- Readiness failure must not block in-window manual controls.
- Real hotkey/tray readiness must be host-owned once implemented.
