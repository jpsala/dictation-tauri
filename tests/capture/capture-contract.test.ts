import { describe, expect, it } from "vitest";
import {
  createMicrophoneCaptureArtifactPolicy,
  microphoneCaptureArtifactDirectories,
  microphoneCaptureArtifactRoot,
  validateCapturedAudioArtifact,
  validateMicrophoneCaptureArtifactPath,
} from "../../src/capture/artifact-policy";
import { ActiveCaptureSessionError } from "../../src/capture/gateway";
import type { CaptureGateway } from "../../src/capture/gateway";
import type {
  CapturedAudioArtifact,
  CaptureMetadata,
  CaptureResult,
} from "../../src/capture/types";
import { isTerminalCaptureState } from "../../src/capture/types";

describe("microphone capture contracts", () => {
  it("defines the gitignored artifact policy without touching real audio", () => {
    expect(createMicrophoneCaptureArtifactPolicy()).toEqual({
      artifactRoot: microphoneCaptureArtifactRoot,
      allowedDirectories: Object.values(microphoneCaptureArtifactDirectories),
      gitPolicy: "ignored",
      capturePolicy: "gitignored-local",
    });
  });

  it("accepts only workspace-relative microphone artifact paths", () => {
    expect(
      validateMicrophoneCaptureArtifactPath(
        "artifacts/microphone-capture/audio/capture-001.webm",
      ),
    ).toMatchObject({
      ok: true,
      normalizedPath: "artifacts/microphone-capture/audio/capture-001.webm",
    });

    expect(
      validateMicrophoneCaptureArtifactPath(
        "artifacts/microphone-capture/audio/../reports/leak.json",
      ),
    ).toMatchObject({
      ok: false,
      reason: "Microphone capture artifact paths must not contain traversal.",
    });

    expect(
      validateMicrophoneCaptureArtifactPath("C:/private/capture-001.webm"),
    ).toMatchObject({
      ok: false,
      reason: "Microphone capture artifact paths must be workspace-relative.",
    });

    expect(
      validateMicrophoneCaptureArtifactPath(
        "artifacts/synthetic-audio-stt/audio/capture-001.webm",
      ),
    ).toMatchObject({
      ok: false,
      reason:
        "Microphone capture artifact paths must stay under artifacts/microphone-capture/.",
    });
  });

  it("validates captured audio metadata without reading files", () => {
    const artifact = createFakeArtifact();

    expect(validateCapturedAudioArtifact(artifact)).toMatchObject({
      ok: true,
      normalizedPath: artifact.relativePath,
    });
  });

  it("models a fake capture lifecycle without microphone access", async () => {
    const fakeStream = createFakeStream();
    const gateway = new FakeCaptureGateway(fakeStream);

    expect(await gateway.getPermissionState()).toBe("granted");
    const started = await gateway.startCapture();
    const result = await gateway.stopCapture();

    expect(started).toMatchObject({
      captureId: "capture-001",
      source: "microphone",
      permissionStatus: "granted",
      artifactPolicy: "gitignored-local",
      deviceKind: "audioinput",
    });
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        captureId: "capture-001",
        durationMs: 1200,
        mimeType: "audio/webm",
        sizeBytes: 2048,
      },
      artifact: {
        relativePath: "artifacts/microphone-capture/audio/capture-001.webm",
        sensitivity: "real-user-audio",
        policy: "gitignored-local",
      },
    });
    expect(fakeStream.tracks.every((track) => track.stopped)).toBe(true);
  });

  it("guards overlapping fake capture sessions", async () => {
    const gateway = new FakeCaptureGateway();

    await gateway.startCapture();

    await expect(gateway.startCapture()).rejects.toBeInstanceOf(
      ActiveCaptureSessionError,
    );
  });

  it("keeps capture terminal states explicit", () => {
    expect(isTerminalCaptureState("captured")).toBe(true);
    expect(isTerminalCaptureState("failed")).toBe(true);
    expect(isTerminalCaptureState("cancelled")).toBe(true);
    expect(isTerminalCaptureState("recording")).toBe(false);
  });
});

type FakeStreamTrack = {
  kind: "audio";
  stopped: boolean;
};

type FakeMediaStream = {
  id: string;
  tracks: FakeStreamTrack[];
};

class FakeCaptureGateway implements CaptureGateway {
  private activeMetadata?: CaptureMetadata;

  constructor(private readonly stream = createFakeStream()) {}

  async getPermissionState() {
    return "granted" as const;
  }

  async startCapture(): Promise<CaptureMetadata> {
    if (this.activeMetadata) {
      throw new ActiveCaptureSessionError(this.activeMetadata.captureId);
    }

    this.activeMetadata = {
      captureId: "capture-001",
      source: "microphone",
      permissionStatus: "granted",
      artifactPolicy: "gitignored-local",
      deviceKind: "audioinput",
      deviceLabel: "redacted-test-device",
    };

    return this.activeMetadata;
  }

  async stopCapture(): Promise<CaptureResult> {
    const metadata = this.activeMetadata;

    if (!metadata) {
      return createFakeFailure("capture-001", "No active fake capture.");
    }

    const artifact = createFakeArtifact();
    stopFakeStream(this.stream);
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
    stopFakeStream(this.stream);
    this.activeMetadata = undefined;
    return createFakeFailure(captureId, "Fake capture was cancelled.");
  }
}

function createFakeStream(): FakeMediaStream {
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

function stopFakeStream(stream: FakeMediaStream): void {
  for (const track of stream.tracks) {
    track.stopped = true;
  }
}

function createFakeArtifact(): CapturedAudioArtifact {
  return {
    artifactId: "artifact-001",
    captureId: "capture-001",
    relativePath: "artifacts/microphone-capture/audio/capture-001.webm",
    mimeType: "audio/webm",
    extension: "webm",
    sizeBytes: 2048,
    durationMs: 1200,
    sensitivity: "real-user-audio",
    policy: "gitignored-local",
  };
}

function createFakeFailure(
  captureId: string,
  message: string,
): CaptureResult {
  return {
    ok: false,
    metadata: {
      captureId,
      source: "microphone",
      permissionStatus: "granted",
      artifactPolicy: "gitignored-local",
      deviceKind: "audioinput",
    },
    error: {
      phase: "cancelled",
      code: "cancelled",
      message,
    },
  };
}
