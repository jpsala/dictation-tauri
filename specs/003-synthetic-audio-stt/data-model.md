# Data Model: Synthetic Audio STT

## Entity: SyntheticAudioFixture

Represents one controlled dictation sample.

Fields:

- `id`: Stable unique identifier.
- `language`: Primary language or language mix expected in the sample.
- `expectedText`: Synthetic expected transcript, versioned when non-sensitive.
- `audioArtifactPath`: Intended local path for the generated or restored audio.
- `sourceType`: `generated-tts`, `local-human-reference`, or `external-reference`.
- `format`: Audio container/codec such as `wav` or `mp3`.
- `durationMs`: Optional duration once known.
- `sensitivity`: `synthetic`, `local-sensitive`, or `unknown`.
- `versionPolicy`: `versioned-metadata`, `gitignored-artifact`, or `temporary`.
- `notes`: Optional development note that must not contain secrets.

Validation rules:

- `id`, `language`, `expectedText`, `audioArtifactPath`, `sourceType`,
  `format`, `sensitivity`, and `versionPolicy` are required.
- Versioned fixtures must be synthetic and non-sensitive.
- Local-sensitive or unknown artifacts must never be required for routine CI-safe
  checks.

## Entity: AudioArtifact

Represents an audio file used by a fixture run.

Fields:

- `path`: Local filesystem path.
- `exists`: Whether the artifact is present for the current run.
- `format`: Detected or declared format.
- `bytes`: Optional file size.
- `durationMs`: Optional measured duration.
- `generatedBy`: Optional generator/provider/tool metadata.
- `gitPolicy`: `ignored`, `versioned`, or `temporary`.

Validation rules:

- Generated/local artifacts default to `ignored`.
- Missing artifacts produce setup results, not product runtime failures.
- Artifact paths must stay inside documented fixture/artifact directories.

## Entity: ModelGatewayRequest

Represents the adapter input for STT.

Fields:

- `runId`: Pipeline run identifier.
- `fixtureId`: Fixture identifier.
- `audio`: Audio artifact metadata and readable path/reference.
- `language`: Optional provider hint.
- `provider`: Optional local provider selection.
- `model`: Optional local model selection.
- `mode`: `dry-run`, `mock`, or `real`.

Validation rules:

- `real` mode requires local provider configuration.
- Requests must not include API key values in event payloads or reports.
- The pipeline should not depend on provider-specific request shapes.

## Entity: SttResult

Represents a transcription result or redacted failure.

Fields:

- `status`: `ok`, `setup-error`, `provider-error`, `cancelled`, or `skipped`.
- `text`: Transcript text when status is `ok`.
- `error`: Redacted diagnostic when status is not `ok`.
- `provider`: Provider name when known.
- `model`: Model name when known.
- `latencyMs`: Total elapsed transcription time.
- `requestId`: Provider/backend request identifier when available.
- `costEstimate`: Optional amount and currency/source.
- `audio`: Audio metadata used by the request.

Validation rules:

- Successful results must include text, provider/model when real, and latency.
- Failed results must not include secrets or raw provider payloads.
- A result cannot be both successful and error terminal.

## Entity: BenchmarkReport

Represents local evidence from one or more fixture runs.

Fields:

- `reportId`: Unique local report identifier.
- `createdAt`: Timestamp.
- `runs`: One or more fixture run summaries.
- `artifactRoot`: Local artifact directory.
- `normalizationPolicy`: Text comparison policy used.
- `gitPolicy`: Must be `ignored` unless explicitly promoted by a future spec.

Validation rules:

- Reports must include expected text, transcript or redacted error, provider,
  model, latency, and artifact paths for each run.
- Reports must not become product persistence or source of truth.

## State Transitions

STT fixture runs reuse the MVP 1 pipeline terminal rules:

```text
idle -> listening -> transcribing -> delivering -> done
idle -> listening -> transcribing -> error
idle -> listening -> transcribing -> cancelled
```

For MVP 2, `listening` means fixture/audio preparation rather than microphone
capture. `delivering` means evidence/report materialization, not real clipboard
or paste insertion.
