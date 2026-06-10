# Data Model: Simulated Pipeline

MVP 1 introduces transient pipeline data only. It does not create product persistence, transcript history, provider settings, or audio storage.

## Entity: Pipeline Run

Purpose: Represents one simulated dictation attempt from fixture input to terminal state.

Fields:

- `id`: unique identifier for one run.
- `fixtureId`: identifier of the controlled fixture used for the run.
- `state`: current pipeline state.
- `states`: ordered list of observed states.
- `startedAt`: timestamp or monotonic marker for run start.
- `endedAt`: timestamp or monotonic marker for terminal state when available.
- `transcript`: mock transcription text when available.
- `output`: final text when available.
- `delivery`: delivery result when attempted.
- `error`: redacted error detail when failed.
- `events`: ordered evidence ledger for the run, or a reference to that ledger.

Validation:

- A run has exactly one terminal state: `done`, `error`, or `cancelled`.
- A run cannot transition after terminal state.
- A run cannot start if another run is active unless a later spec defines concurrency.
- A run summary must not include secrets or real sensitive dictation data.
- The run summary is derived from the event ledger and current run fields, not maintained as a separate source of truth.

State transitions:

```text
idle -> listening -> transcribing -> delivering -> done
idle -> listening -> transcribing -> error
idle -> listening -> transcribing -> delivering -> error
idle -> listening -> cancelled
idle -> listening -> transcribing -> cancelled
idle -> listening -> transcribing -> delivering -> cancelled
```

## Entity: Pipeline State

Purpose: Bounded state label used for UI, tests, and run summaries.

Values:

- `idle`
- `listening`
- `transcribing`
- `delivering`
- `done`
- `error`
- `cancelled`

Validation:

- Unknown state labels are invalid.
- State order must match one of the allowed transition paths.
- `done`, `error`, and `cancelled` are terminal.

Product labels:

- `done` may be displayed as completed/completado.
- `error` may be displayed as failed/fallido.
- A future `processing` state must be added only when postprocess/materialization becomes a real separate phase.

## Entity: Pipeline Event

Purpose: Primary evidence stream for state observation, logs, UI updates, and summary derivation.

Minimum fields:

- `runId`: unique run identifier.
- `fixtureId`: controlled fixture identifier.
- `type`: event type.
- `state`: pipeline state for state-change events.
- `at`: timestamp or monotonic marker.
- `data`: redacted structured metadata when needed.

Minimum event types:

- `run_started`
- `state_changed`
- `transcription_completed`
- `delivery_completed`
- `run_cancelled`
- `run_failed`
- `run_completed`

Validation:

- Events are append-only for one run.
- Terminal events are final for one run.
- Event payloads must not contain secrets.
- User/private text must remain controlled fixture text in MVP 1.

## Entity: Pipeline Service

Purpose: Owns run lifecycle independent from React UI or Tauri side effects.

Responsibilities:

- Accept a run request.
- Reject or defer a second run while another run is active.
- Create run ids.
- Own cancellation.
- Emit ordered events.
- Return the derived run summary.

Validation:

- UI cannot mutate run state directly.
- Tests can instantiate the service with deterministic clocks, ids, fixtures, and adapters.
- Future hotkey, tray, Tauri command, or UI entrypoints call the same service contract.

## Entity: Fixture Input

Purpose: Controlled input for deterministic simulated runs.

Fields:

- `id`: stable fixture identifier.
- `label`: human-readable fixture name.
- `sourceText`: optional simulated spoken or selected context text.
- `expectedTranscript`: expected mock transcript when the fixture succeeds.
- `expectedOutput`: expected final output when the fixture succeeds.
- `failureMode`: optional controlled failure definition.
- `deliveryMode`: simulated delivery outcome.

Validation:

- Successful fixtures must define expected transcript and expected output.
- Failure fixtures must define a failed phase and redacted message.
- Fixture values committed to source must be synthetic and non-sensitive.

## Entity: Mock Transcription Result

Purpose: Simulated transcription output for MVP 1.

Fields:

- `text`: transcript text when successful.
- `error`: redacted error when unsuccessful.
- `latencyMs`: simulated latency or measured elapsed time for test evidence.

Validation:

- A result has either text or error, not both.
- Empty text is treated as an error or explicit edge case.

Port boundary:

- MVP 1 transcription is fixture-backed through a mock adapter.
- MVP 2 direct STT adapters must satisfy the same result shape plus provider/model/timing metadata.

## Entity: Delivery Result

Purpose: Simulated outcome of making generated text available.

Values:

- `delivered`
- `copiedFallback`
- `uncertain`
- `failed`
- `skipped`

Fields:

- `status`: one of the delivery values.
- `output`: text made available when relevant.
- `reason`: redacted detail for uncertain, failed, or skipped delivery.

Validation:

- `done` runs may include delivered, copied fallback, or uncertain delivery.
- Failed delivery may move the run to `error` when no fallback text is available.
- The system must not claim observed paste unless a later feature implements real observation.

Evidence model:

- `delivered` means simulated delivery in MVP 1.
- Future real delivery must distinguish text available, copy fallback, paste sent, paste observed when possible, target initial/final, confidence, and uncertainty reason.

## Entity: Run Summary

Purpose: Developer-facing evidence for tests, debugging, and later MVP 2 planning.

Fields:

- `runId`
- `fixtureId`
- `events`
- `states`
- `terminalState`
- `output`
- `delivery`
- `error`
- `durationMs`

Validation:

- Summary must be available after every terminal run.
- Summary must redact errors and exclude secrets.
- Summary must not persist as product history in MVP 1.
- Summary must be reproducible from the event ledger.
