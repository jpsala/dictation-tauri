# Contract: Selection Transform And Recovery Ergonomics

This contract is implementation-facing and renderer-safe. It intentionally excludes real OS selection capture and paste observation from the first slice.

## Selection Context

```ts
export type SelectionContextSource = "fixture" | "host_capture" | "none";

export type SelectionContext = {
  selectionId: string;
  selectedText?: string;
  textLength: number;
  source: SelectionContextSource;
  capturedAt?: string;
  targetSnapshot?: DesktopTargetSnapshot;
  confidence: DesktopTargetConfidence;
  redacted: boolean;
};
```

Rules:

- Default tests may only use `fixture` or `none`.
- `host_capture` requires a later gated host adapter.
- Empty/whitespace text is equivalent to no selection.

## Future Host Selection Capture Boundary

Real Windows selection capture, if approved, is host-owned and returns an outcome before creating a `SelectionContext`:

```ts
export type SelectionCaptureStatus =
  | "ok"
  | "unsupported_platform"
  | "no_foreground_target"
  | "unsupported_target"
  | "no_selection"
  | "timeout"
  | "failed";

export type SelectionCaptureOutcome = {
  status: SelectionCaptureStatus;
  selection?: SelectionContext;
  targetSnapshot?: DesktopTargetSnapshot;
  redacted: boolean;
  truncated: boolean;
  reason?: string;
};
```

Rules:

- The first Windows route attempts non-mutating UI Automation selection capture from the foreground/focused text control.
- Capture is invoked only by explicit user action/hotkey flow, never on app startup or in default tests.
- Clipboard roundtrips, synthetic `Ctrl+C`, focus changes, paste keys, and replace-selection are excluded from this boundary.
- Failure statuses are expected and must route to direct dictation or review-only recovery without claiming selection was captured.
- Raw selected text may cross to the renderer only as active in-memory session data; never write it to docs, logs, durable history, or artifacts.

## Transform Request

```ts
export type SelectionTransformMode = "fixture" | "managed" | "direct_byok";

export type SelectionTransformRequest = {
  requestId: string;
  sessionId: string;
  selection: SelectionContext;
  instructionTranscript: string;
  presetId: string;
  mode: SelectionTransformMode;
  allowProviderCall: boolean;
};
```

Rules:

- `mode: "fixture"` requires `allowProviderCall: false`.
- `managed` and `direct_byok` are future gated modes, not default test paths.

## Transform Result

```ts
export type SelectionTransformAction =
  | "replace_selection"
  | "insert"
  | "copy"
  | "review_only";

export type SelectionTransformResult = {
  status: "ok" | "skipped" | "failed";
  output?: string;
  action: SelectionTransformAction;
  presetId?: string;
  evidence: SelectionTransformEvidence;
  recoveryAction?: DesktopRecoveryAction;
};

export type SelectionTransformEvidence = {
  selectionAvailable: boolean;
  source: SelectionContextSource;
  presetId?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  reason?: string;
};
```

Rules:

- `replace_selection` means intended action only until real delivery target assurance exists.
- Missing selection should produce `skipped` or route to direct dictation.
- Unsupported preset should produce `failed` with actionable recovery.

## Latest Result Recovery

```ts
export type LatestResult = {
  runId: string;
  text: string;
  source: "dictation" | "selection_transform";
  createdAt?: string;
  deliveryEvidence?: DeliveryEvidence;
};
```

Safe paste-last behavior:

```ts
const safePasteLastEvidence: DeliveryEvidenceDraft = {
  status: "uncertain",
  strategy: "paste_send",
  message:
    "Paste last was not sent in safe mode; transcript remains available for manual copy.",
};
```

Rules:

- Safe paste-last does not send keys, touch focus, or claim paste was sent.
- Output remains available for manual copy.
- Latest-result helpers only return successful, non-empty outputs and never persist history.
- Failed, cancelled, empty, or whitespace-only runs must not become reusable latest results.
- `paste_observed` remains forbidden without a verified observer.

## Event And Evidence Rules

- Reuse 010 delivery statuses and redaction helpers where possible.
- Any future host selection event must identify `source: "host_capture"` and include redacted target evidence.
- Any future provider transform must include provider/model/request evidence only after redaction.
