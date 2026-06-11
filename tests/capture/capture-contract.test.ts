import { describe, expect, it } from "vitest";
import {
  createMicrophoneCaptureArtifactPolicy,
  microphoneCaptureArtifactDirectories,
  microphoneCaptureArtifactRoot,
  validateCapturedAudioArtifact,
  validateMicrophoneCaptureArtifactPath,
} from "../../src/capture/artifact-policy";
import {
  createFakeCaptureArtifact,
  createFakeCaptureStream,
  FakeCaptureGateway,
} from "../../src/capture/fake-gateway";
import { ActiveCaptureSessionError } from "../../src/capture/gateway";
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
    const artifact = createFakeCaptureArtifact();

    expect(validateCapturedAudioArtifact(artifact)).toMatchObject({
      ok: true,
      normalizedPath: artifact.relativePath,
    });
  });

  it("models a fake capture lifecycle without microphone access", async () => {
    const fakeStream = createFakeCaptureStream();
    const gateway = new FakeCaptureGateway({ stream: fakeStream });

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

  it("stops fake stream tracks after cancellation", async () => {
    const fakeStream = createFakeCaptureStream();
    const gateway = new FakeCaptureGateway({ stream: fakeStream });

    await gateway.startCapture();
    const result = await gateway.cancelCapture();

    expect(result).toMatchObject({
      ok: false,
      error: {
        phase: "cancelled",
        code: "cancelled",
      },
    });
    expect(fakeStream.tracks.every((track) => track.stopped)).toBe(true);
  });

  it("reports safe failures when stop is requested without an active capture", async () => {
    const gateway = new FakeCaptureGateway();

    await expect(gateway.stopCapture()).resolves.toMatchObject({
      ok: false,
      error: {
        phase: "cancelled",
        code: "cancelled",
        message: "No active fake capture.",
      },
    });
  });

  it("keeps capture terminal states explicit", () => {
    expect(isTerminalCaptureState("captured")).toBe(true);
    expect(isTerminalCaptureState("failed")).toBe(true);
    expect(isTerminalCaptureState("cancelled")).toBe(true);
    expect(isTerminalCaptureState("recording")).toBe(false);
  });
});
