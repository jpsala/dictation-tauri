# Data Model: Selection Transform And Recovery Ergonomics

## SelectionContext

Represents optional selected text and target evidence. Fixture-backed in the first slice; real OS capture is future/gated.

Fields:

- `selectionId: string` - local correlation id.
- `selectedText?: string` - selected text when fixture/host capture provides it. Synthetic fixtures only in default tests.
- `textLength: number` - length of selected text after normalization.
- `source: "fixture" | "host_capture" | "none"` - provenance.
- `capturedAt?: string` - ISO timestamp.
- `targetSnapshot?: DesktopTargetSnapshot` - existing delivery target shape, redacted.
- `confidence: "none" | "low" | "medium" | "high"` - confidence that the selection belongs to the intended target.
- `redacted: boolean` - whether displayed/logged target data has been redacted.

Validation:

- Empty or whitespace-only `selectedText` behaves as no selection.
- Secret-looking target labels/reasons must be redacted before UI/log evidence.
- `host_capture` source is invalid in default provider-free tests until a future gated task exists.

## SelectionTransformPreset

A safe transform mode exposed before settings exist.

Fields:

- `id: "rewrite" | "shorten" | "bulletize" | string`
- `label: string`
- `description: string`
- `providerMode: "fixture" | "managed" | "direct_byok"`

Validation:

- First implementation supports fixture mode only.
- Unsupported presets return recovery, not silent direct dictation.

## SelectionTransformRequest

Combines selected text with spoken instruction/transcript.

Fields:

- `requestId: string`
- `sessionId: string`
- `selection: SelectionContext`
- `instructionTranscript: string`
- `presetId: string`
- `mode: "fixture" | "managed" | "direct_byok"`
- `allowProviderCall: boolean`

Validation:

- `allowProviderCall` must be `false` for fixture mode.
- Missing selected text must route to direct dictation or recovery.
- Provider modes require future explicit host/runtime gates.

## SelectionTransformResult

Output and evidence from a transform.

Fields:

- `status: "ok" | "skipped" | "failed"`
- `output?: string`
- `action: "replace_selection" | "insert" | "copy" | "review_only"`
- `presetId?: string`
- `evidence: SelectionTransformEvidence`
- `recoveryAction?: DesktopRecoveryAction`

Validation:

- `replace_selection` is evidence-only until delivery has a real verified target path.
- Empty output is failed or skipped with recovery.

## SelectionTransformEvidence

Auditable but redacted transform proof.

Fields:

- `selectionAvailable: boolean`
- `source: SelectionContext["source"]`
- `presetId?: string`
- `provider?: string`
- `model?: string`
- `latencyMs?: number`
- `reason?: string`

Validation:

- Do not include raw provider payloads or secrets.
- Synthetic fixture text may appear in tests, but docs should avoid real transcripts.

## LatestResult

Ephemeral in-process latest output for copy/paste-last recovery.

Fields:

- `runId: string`
- `text: string`
- `source: "dictation" | "selection_transform"`
- `createdAt?: string`
- `deliveryEvidence?: DeliveryEvidence`

Validation:

- Lives in memory only; no durable history in this spec.
- Cleared by process reload. May be replaced by later successful outputs.
- Copy/paste-last actions must record honest evidence and never claim `paste_observed`.
