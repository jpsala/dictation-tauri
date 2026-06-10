# Contract: Simulated Pipeline

This contract defines the feature boundary for MVP 1. It is intentionally local to the app and tests; it is not a public network API and not a product persistence schema.

## Pipeline Runner

Purpose: Execute one fixture-backed simulated run and return a run summary.

The runner may be implemented as a function or a `PipelineService`, but the service form is preferred once cancellation, active-run ownership, or UI observation is needed.

Input:

```ts
type SimulatedRunRequest = {
  fixtureId: string;
  cancelAtState?: "listening" | "transcribing" | "delivering";
};
```

Output:

```ts
type SimulatedRunSummary = {
  runId: string;
  fixtureId: string;
  states: PipelineState[];
  terminalState: "done" | "error" | "cancelled";
  output?: string;
  delivery?: DeliveryResult;
  error?: RedactedPipelineError;
  durationMs: number;
};
```

Rules:

- Only one run may be active at a time.
- A second run request while one run is active must be rejected or explicitly deferred; it must not mutate the active run.
- Missing fixture returns an `error` terminal state.
- Cancellation request returns `cancelled` and prevents later `done`.
- No provider key, microphone, clipboard, selected text capture, storage, or Tauri command is required.
- The summary must be derivable from the event ledger.

## State Observer

Purpose: Allow tests or a minimal UI surface to observe state order.

Event:

```ts
type PipelineStateEvent = {
  runId: string;
  state: PipelineState;
  fixtureId: string;
  at: number;
};
```

Rules:

- Events must be emitted in transition order.
- Terminal event must be the final event for a run.
- State labels must come from the bounded state set.
- UI surfaces may observe these events but must not own state transitions.

## Event Ledger

Purpose: Provide structured evidence for debugging, UI observation, and future STT/audio work.

Minimum event shape:

```ts
type PipelineEvent =
  | {
      type: "run_started" | "state_changed";
      runId: string;
      fixtureId: string;
      state: PipelineState;
      at: number;
    }
  | {
      type:
        | "transcription_completed"
        | "delivery_completed"
        | "run_completed"
        | "run_failed"
        | "run_cancelled";
      runId: string;
      fixtureId: string;
      at: number;
      data?: Record<string, unknown>;
    };
```

Rules:

- Event payloads must be redacted.
- Terminal events are final.
- Run summaries are derived from this ledger.
- Future Tauri events, logs, and UI state surfaces should consume the same event model or a direct projection of it.

## Mock Ports

Purpose: Keep fixture behavior replaceable before real STT, postprocess, or delivery exists.

Minimum ports:

```ts
type MockTranscriptionAdapter = {
  transcribe(fixture: SimulatedFixture): Promise<MockTranscriptionResult>;
};

type MockDeliveryAdapter = {
  deliver(input: {
    fixture: SimulatedFixture;
    output: string;
  }): Promise<DeliveryResult>;
};
```

Rules:

- MVP 1 adapters may be fixture-backed.
- The pipeline should depend on ports, not on provider implementation details.
- Real MVP 2 `ModelGateway` adapters must preserve the same high-level success/error semantics.

## Fixture Shape

Purpose: Define controlled inputs for repeatable tests.

```ts
type SimulatedFixture = {
  id: string;
  label: string;
  sourceText?: string;
  expectedTranscript?: string;
  expectedOutput?: string;
  failureMode?: {
    phase: "listening" | "transcribing" | "delivering";
    message: string;
  };
  deliveryMode: "delivered" | "copiedFallback" | "uncertain" | "failed" | "skipped";
};
```

Rules:

- Source-controlled fixture text must be synthetic and non-sensitive.
- Successful fixtures must define expected transcript and expected output.
- Failure fixtures must define a failure phase and redacted message.

## Delivery Result

Purpose: Make delivery trust explicit before real desktop delivery exists.

```ts
type DeliveryResult = {
  status: "delivered" | "copiedFallback" | "uncertain" | "failed" | "skipped";
  output?: string;
  reason?: string;
};
```

Rules:

- `delivered` in MVP 1 means simulated delivery only.
- `copiedFallback` means fallback text is available, not that the system has written to the real clipboard.
- `uncertain` must be surfaced distinctly from `delivered`.
- Real paste observation is out of scope.
- Future real delivery must distinguish paste sent from paste observed and include target/evidence metadata before claiming full delivery.
