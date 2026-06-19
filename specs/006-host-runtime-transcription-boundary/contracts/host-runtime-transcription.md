# Contract: Host Runtime Transcription Boundary

This contract defines the boundary between React/TypeScript UI and host-owned runtime transcription. The goal is to make real provider use possible without exposing credentials, raw provider payloads, or unchecked filesystem reads to the renderer.

## Host Runtime Readiness

```ts
export type HostRuntimeReadiness = {
  configured: boolean;
  provider?: string;
  model?: string;
  artifactRoot: "artifacts/microphone-capture";
  supportsRealProviderCall: boolean;
  reason?: RedactedHostRuntimeError;
};
```

Rules:

- `configured: true` means the host found enough local setup to attempt a real call if the caller explicitly asks for it.
- Readiness must not read audio files or call providers.
- Readiness must not include API key values, `.env` values, raw provider diagnostics, or transcript text.

## Host Transcription Request

```ts
export type HostTranscriptionRequest = {
  runId: string;
  audioPath: string;
  provider?: "groq" | string;
  model?: string;
  language?: string;
  mode: "dry-run" | "real";
  allowProviderCall: boolean;
};
```

Rules:

- `mode: "real"` requires `allowProviderCall: true`.
- `audioPath` must resolve under an allowed local artifact root before any read.
- `dry-run` must not read secrets, read audio contents, or call providers.

## Host Transcription Response

```ts
export type HostTranscriptionResponse =
  | {
      status: "ok";
      text: string;
      transcriptPath?: string;
      reportPath?: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      redacted: true;
    }
  | {
      status:
        | "setup-error"
        | "provider-error"
        | "missing-audio"
        | "empty"
        | "cancelled";
      error: RedactedHostRuntimeError;
      transcriptPath?: string;
      reportPath?: string;
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
      retryable: boolean;
      redacted: true;
    };
```

Rules:

- `ok` requires usable non-empty text.
- `empty` is not a provider failure.
- `missing-audio` is a setup/local artifact failure and must be retryable only if a replacement clip can be supplied.
- `requestId` must be safe/redacted if exposed to UI.
- The response may include transcript text in memory for review/manual copy, but local transcript files remain ignored and must not be documented with contents.

## Redacted Error

```ts
export type RedactedHostRuntimeError = {
  code: string;
  message: string;
  redacted: true;
};
```

Rules:

- `message` is user-safe and must not contain API keys, authorization headers, raw `.env` values, full file contents, raw provider payloads, or transcript text.
- Prefer stable `code` values for UI recovery mapping.

## Host Client For React

```ts
export type HostRuntimeClient = {
  getReadiness(): Promise<HostRuntimeReadiness>;
  transcribeCapturedAudio(request: HostTranscriptionRequest): Promise<HostTranscriptionResponse>;
};
```

Rules:

- React uses `HostRuntimeClient`, not provider-specific adapters.
- Browser/dev tests may use a fake client.
- Tauri implementation may use `invoke`, but secrets/env/audio reads must remain host-side.

## Tauri Command Shape

The renderer-facing command names are now fixed for the first host boundary slice:

```rust
#[tauri::command]
pub fn get_runtime_transcription_readiness() -> HostRuntimeReadiness

#[tauri::command]
pub async fn transcribe_captured_audio(request: HostTranscriptionRequest) -> HostTranscriptionResponse
```

Rules:

- A stub implementation may return `configured: false` / `HOST_RUNTIME_UNAVAILABLE` while the real host provider is not wired.
- Commands must validate artifact roots before reads.
- Commands must never return secret values or raw provider payloads.
- Capabilities/permissions must be updated if Tauri requires explicit command allow-listing.
- The React renderer calls these commands only through `HostRuntimeClient`, not provider-specific modules.

## Artifact Policy

Allowed local roots for this feature:

```text
artifacts/microphone-capture/audio/
artifacts/microphone-capture/transcripts/
artifacts/microphone-capture/reports/
artifacts/microphone-capture/provider-payloads/  # reserved; raw payload storage remains disabled by default
```

Rules:

- `provider-payloads/` remains unused unless a later spec explicitly enables redacted/debug payload capture.
- `git ls-files artifacts .env` must print nothing after checks.
- Reports may include status, provider/model, latency, redacted request id, transcript length, and paths under ignored roots.
