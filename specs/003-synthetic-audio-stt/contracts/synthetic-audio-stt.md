# Contract: Synthetic Audio STT

## Scope

This contract defines how MVP 2 fixture audio, STT adapters, pipeline events,
and local reports interact. It preserves the MVP 1 service/ports/event-ledger
architecture while introducing real transcription over controlled audio.

## Artifact Policy

Versioned:

- Synthetic fixture manifest.
- Synthetic expected text.
- Contract and test definitions.
- Small non-sensitive metadata needed to reproduce a run.

Gitignored/local:

- Generated audio files.
- Human or reference audio files.
- Raw provider requests/responses.
- Transcripts produced by real provider calls.
- Benchmark reports and run ledgers that may contain transcript data.
- Any `.env` or local provider configuration.

Temporary:

- Intermediate converted audio files.
- Retry scratch files.
- Partial reports from failed/cancelled runs.

Suggested local root:

```text
artifacts/synthetic-audio-stt/
├── audio/
├── transcripts/
├── provider-payloads/
└── reports/
```

## Fixture Manifest Contract

Each fixture entry must provide:

```ts
type SyntheticAudioFixture = {
  id: string;
  language: string;
  expectedText: string;
  audioArtifactPath: string;
  sourceType: "generated-tts" | "local-human-reference" | "external-reference";
  format: "wav" | "mp3" | "m4a" | "webm";
  durationMs?: number;
  sensitivity: "synthetic" | "local-sensitive" | "unknown";
  versionPolicy: "versioned-metadata" | "gitignored-artifact" | "temporary";
  notes?: string;
};
```

Rules:

- Versioned fixtures must use `sensitivity: "synthetic"`.
- `audioArtifactPath` points to a documented local artifact path and may be
  missing before generation/restoration.
- Expected text must be safe to commit when the fixture is versioned.

## ModelGateway Contract

The direct local adapter must satisfy the same high-level port shape as the MVP
1 mock adapter.

```ts
type ModelGateway = {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
  postProcess?(input: PostProcessInput): Promise<PostProcessResult>;
};

type TranscriptionInput = {
  runId: string;
  fixtureId: string;
  audioPath: string;
  language?: string;
  provider?: string;
  model?: string;
  mode: "mock" | "dry-run" | "real";
};

type TranscriptionResult =
  | {
      status: "ok";
      text: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      costEstimate?: {
        amount: number;
        currency: string;
        source: string;
      };
    }
  | {
      status: "setup-error" | "provider-error" | "cancelled";
      error: {
        code: string;
        message: string;
        redacted: true;
      };
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
    };
```

Rules:

- Adapter implementations must not expose API key values.
- Provider-specific payloads stay inside the adapter or local artifact directory.
- `postProcess` is optional and measured separately.

## Pipeline Event Contract

MVP 2 events extend the MVP 1 event ledger with STT evidence metadata:

- `fixture.validated`
- `audio.artifact.checked`
- `stt.request.started`
- `stt.request.completed`
- `stt.request.failed`
- `stt.comparison.completed`
- `report.written`

Every event must include:

- `runId`
- `timestamp`
- event type
- fixture id when applicable
- redacted details only

## Report Contract

Reports are local evidence files. They must include:

- report id and created timestamp;
- fixture id and audio artifact metadata;
- provider/model and mode;
- latency and timing fields available from the adapter;
- cost estimate and source when available;
- expected text;
- raw transcript or redacted error;
- optional postprocess output;
- normalization policy and comparison result;
- pipeline terminal state and run summary;
- artifact paths.

Reports must not include:

- API keys or tokens;
- full raw provider payloads unless written under gitignored provider payload
  artifacts;
- claims of real clipboard/paste delivery;
- product-history semantics.
