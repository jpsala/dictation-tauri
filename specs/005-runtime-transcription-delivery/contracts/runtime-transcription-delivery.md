# Contract: Runtime Transcription And Delivery

This contract documents the TypeScript runtime boundary for post-MVP3
transcription and honest delivery evidence. Names may be refined during
implementation, but the evidence and redaction semantics should remain stable.

## Runtime Transcription Gateway

```ts
export type RuntimeTranscriptionStatus =
  | "ok"
  | "setup-error"
  | "provider-error"
  | "empty"
  | "cancelled";

export type RuntimeTranscriptionInput = {
  runId: string;
  clip: CapturedAudioArtifact;
  language?: string;
  provider?: string;
  model?: string;
  mode: "mock" | "dry-run" | "real";
};

export type RuntimeTranscriptionOutput =
  | {
      status: "ok";
      text: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      requestEvidence?: "present" | "redacted";
    }
  | {
      status: "setup-error" | "provider-error" | "empty" | "cancelled";
      error: RedactedModelGatewayError;
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
      retryable: boolean;
    };

export interface RuntimeTranscriptionGateway {
  transcribe(input: RuntimeTranscriptionInput): Promise<RuntimeTranscriptionOutput>;
}
```

Rules:

- `ok` requires non-empty, useful transcript text.
- `empty` is distinct from provider failure.
- Errors must be redacted and user-safe.
- Provider credentials and raw provider payloads must never cross this contract.
- Request ids may be present only if safe/redacted.

## Pipeline Integration

Runtime transcription should map into existing pipeline summaries without losing
the distinction between transcript availability and delivery evidence.

```ts
export type RuntimeTranscriptResult = {
  status: "available" | "empty" | "unusable";
  text?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
  reason?: string;
};

export type RuntimeRecoveryAction = {
  kind:
    | "retry_transcription"
    | "inspect_setup"
    | "copy_manually"
    | "record_again"
    | "view_local_artifact"
    | "none";
  label: string;
  reason: string;
  clipAvailable: boolean;
};
```

Rules:

- A failed delivery must not remove `RuntimeTranscriptResult.status === "available"`.
- Failed setup/provider/empty outcomes must expose at least one recovery action.
- Retry from the same clip is allowed only after the active run reaches a
  terminal state and the clip is still available.

## Delivery Evidence

```ts
export type DeliveryEvidenceStatus =
  | "available"
  | "copied"
  | "paste_sent"
  | "paste_observed"
  | "failed"
  | "uncertain";
```

Rules:

- `available`: transcript exists for review/manual copy.
- `copied`: copy fallback was attempted/reported; no paste observation implied.
- `paste_sent`: a paste/send action was attempted, but not observed.
- `paste_observed`: forbidden until target observation is implemented and tested.
- `failed`: delivery failed while transcript may still remain recoverable.
- `uncertain`: delivery could not be verified.

## Redaction Requirements

- Do not include API keys, authorization headers, `.env` names with values, raw
  provider request/response bodies, full target-window contents, or private file
  contents in contract outputs.
- User-visible reports may include provider label, model label, latency,
  redacted request id, boolean request-evidence presence, and safe error codes.
- Local transcript/report artifacts must remain ignored by git.
