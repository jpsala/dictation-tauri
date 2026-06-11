import { ActiveCaptureSessionError, type CaptureGateway } from "./gateway";
import type {
  CapturedAudioArtifact,
  CaptureMetadata,
  CapturePermissionStatus,
  CaptureResult,
} from "./types";

export type FakeCaptureTrack = {
  kind: "audio";
  stopped: boolean;
};

export type FakeCaptureStream = {
  id: string;
  tracks: FakeCaptureTrack[];
};

type FakeCaptureGatewayOptions = {
  permissionStatus?: CapturePermissionStatus;
  stream?: FakeCaptureStream;
};

export class FakeCaptureGateway implements CaptureGateway {
  private activeMetadata?: CaptureMetadata;
  private readonly permissionStatus: CapturePermissionStatus;
  readonly stream: FakeCaptureStream;

  constructor(options: FakeCaptureGatewayOptions = {}) {
    this.permissionStatus = options.permissionStatus ?? "granted";
    this.stream = options.stream ?? createFakeCaptureStream();
  }

  async getPermissionState(): Promise<CapturePermissionStatus> {
    return this.permissionStatus;
  }

  async startCapture(): Promise<CaptureMetadata> {
    if (this.activeMetadata) {
      throw new ActiveCaptureSessionError(this.activeMetadata.captureId);
    }

    if (this.permissionStatus !== "granted") {
      this.activeMetadata = undefined;
      return createFakeMetadata("capture-001", this.permissionStatus);
    }

    this.activeMetadata = createFakeMetadata("capture-001", "granted");
    return this.activeMetadata;
  }

  async stopCapture(): Promise<CaptureResult> {
    const metadata = this.activeMetadata;

    if (!metadata) {
      return createFakeCaptureFailure("capture-001", "No active fake capture.");
    }

    const artifact = createFakeCaptureArtifact(metadata.captureId);
    stopFakeCaptureStream(this.stream);
    this.activeMetadata = undefined;

    return {
      ok: true,
      metadata: {
        ...metadata,
        durationMs: artifact.durationMs,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        artifact,
      },
      artifact,
    };
  }

  async cancelCapture(): Promise<CaptureResult> {
    const captureId = this.activeMetadata?.captureId ?? "capture-001";
    stopFakeCaptureStream(this.stream);
    this.activeMetadata = undefined;
    return createFakeCaptureFailure(captureId, "Fake capture was cancelled.");
  }
}

export function createFakeCaptureStream(): FakeCaptureStream {
  return {
    id: "fake-stream-001",
    tracks: [
      {
        kind: "audio",
        stopped: false,
      },
    ],
  };
}

export function stopFakeCaptureStream(stream: FakeCaptureStream): void {
  for (const track of stream.tracks) {
    track.stopped = true;
  }
}

export function createFakeCaptureArtifact(
  captureId = "capture-001",
): CapturedAudioArtifact {
  return {
    artifactId: "artifact-001",
    captureId,
    relativePath: `artifacts/microphone-capture/audio/${captureId}.webm`,
    mimeType: "audio/webm",
    extension: "webm",
    sizeBytes: 2048,
    durationMs: 1200,
    sensitivity: "real-user-audio",
    policy: "gitignored-local",
  };
}

export function createFakeCaptureFailure(
  captureId: string,
  message: string,
): CaptureResult {
  return {
    ok: false,
    metadata: createFakeMetadata(captureId, "granted"),
    error: {
      phase: "cancelled",
      code: "cancelled",
      message,
    },
  };
}

function createFakeMetadata(
  captureId: string,
  permissionStatus: CapturePermissionStatus,
): CaptureMetadata {
  return {
    captureId,
    source: "microphone",
    permissionStatus,
    artifactPolicy: "gitignored-local",
    deviceKind: "audioinput",
    deviceLabel: permissionStatus === "granted" ? "redacted-test-device" : undefined,
  };
}
