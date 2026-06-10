# Contract: Microphone Capture

This contract documents the intended TypeScript/Rust boundary for MVP3. Names
may be refined during implementation, but behavior and evidence semantics should
remain stable.

## Capture Gateway

```ts
export type CapturePermissionStatus =
  | "unknown"
  | "prompting"
  | "granted"
  | "denied"
  | "unavailable"
  | "error";

export type CaptureState =
  | "idle"
  | "permission_needed"
  | "requesting_permission"
  | "recording"
  | "stopping"
  | "captured"
  | "failed"
  | "cancelled";

export type CaptureArtifactPolicy = "gitignored-local";

export type CapturedAudioArtifact = {
  artifactId: string;
  captureId: string;
  relativePath?: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  durationMs: number;
  sensitivity: "real-user-audio";
  policy: CaptureArtifactPolicy;
};

export type CaptureMetadata = {
  captureId: string;
  source: "microphone";
  permissionStatus: CapturePermissionStatus;
  artifact?: CapturedAudioArtifact;
  deviceKind: "audioinput";
  deviceLabel?: string;
};

export type CaptureError = {
  phase: "permission" | "recording" | "artifact" | "cancelled";
  code:
    | "permission-denied"
    | "device-not-found"
    | "device-not-readable"
    | "unsupported-recorder"
    | "empty-audio"
    | "artifact-write-failed"
    | "cancelled"
    | "unknown";
  message: string;
};

export type CaptureResult =
  | { ok: true; metadata: CaptureMetadata; artifact: CapturedAudioArtifact }
  | { ok: false; metadata: CaptureMetadata; error: CaptureError };

export interface CaptureGateway {
  getPermissionState(): Promise<CapturePermissionStatus>;
  startCapture(): Promise<CaptureMetadata>;
  stopCapture(): Promise<CaptureResult>;
  cancelCapture(): Promise<CaptureResult>;
}
```

Rules:

- `startCapture` fails or returns setup state if another capture is active.
- `stopCapture` returns exactly one artifact on success.
- Errors must be redacted and user-safe.
- Browser/WebView implementations must stop all media tracks after stop/cancel.

## Optional Tauri Artifact Command

Use only if the implementation needs a host boundary to persist a capture blob.

```ts
export type SaveCaptureArtifactRequest = {
  captureId: string;
  bytesBase64: string;
  mimeType: string;
  extension: string;
  durationMs: number;
};

export type SaveCaptureArtifactResponse =
  | {
      ok: true;
      artifact: CapturedAudioArtifact;
    }
  | {
      ok: false;
      error: CaptureError;
    };
```

Rules:

- The command may only write under the documented capture artifact root.
- The command must reject traversal and unsupported extensions.
- The command must not return absolute private paths to normal UI state unless
  needed for local diagnostics.
- Any added command/capability must be documented in `docs/DEVELOPMENT.md` or
  the feature quickstart.

## Pipeline Event Extensions

New event types should be additive to existing pipeline events:

```ts
export type CapturePipelineEvent =
  | {
      type: "capture_started";
      runId: string;
      captureId: string;
      at: number;
      data: CaptureMetadata;
    }
  | {
      type: "capture_completed";
      runId: string;
      captureId: string;
      at: number;
      data: {
        metadata: CaptureMetadata;
        artifact: CapturedAudioArtifact;
      };
    }
  | {
      type: "capture_failed";
      runId: string;
      captureId: string;
      at: number;
      data: {
        metadata: CaptureMetadata;
        error: CaptureError;
      };
    };
```

Rules:

- Run summary remains derived from the full event ledger.
- Existing simulated/synthetic fixture events must remain valid.
- Captured audio metadata must not include raw bytes.

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

- First MVP3 implementation may close with `available` or `copied`.
- `paste_observed` is forbidden until target observation is implemented.
