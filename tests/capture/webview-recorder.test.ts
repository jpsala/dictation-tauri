import { describe, expect, it } from "vitest";
import { ActiveCaptureSessionError } from "../../src/capture/gateway";
import {
  chooseRecorderMimeType,
  extensionForMimeType,
  WebViewRecorderGateway,
} from "../../src/capture/webview-recorder";

describe("WebView microphone recorder gateway", () => {
  it("reports unavailable when WebView capture APIs are missing", async () => {
    const gateway = new WebViewRecorderGateway({});

    await expect(gateway.getPermissionState()).resolves.toBe("unavailable");
  });

  it("maps permission denial to a safe setup state", async () => {
    const gateway = new WebViewRecorderGateway({
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException("raw browser detail", "NotAllowedError");
        },
      },
      MediaRecorder: FakeMediaRecorder,
      createCaptureId: () => "capture-denied",
    });

    await expect(gateway.startCapture()).resolves.toMatchObject({
      captureId: "capture-denied",
      permissionStatus: "denied",
      artifactPolicy: "gitignored-local",
    });
  });

  it("records mocked chunks and returns safe artifact metadata on stop", async () => {
    const track = new FakeMediaStreamTrack();
    const stream = createMediaStream([track]);
    const gateway = new WebViewRecorderGateway({
      mediaDevices: {
        getUserMedia: async () => stream,
      },
      MediaRecorder: FakeMediaRecorder,
      createCaptureId: () => "capture-webview-001",
      now: createClock([1000, 2400]),
    });

    const started = await gateway.startCapture();
    const recorder = FakeMediaRecorder.latest;
    recorder.emitData(new Blob(["fake audio"], { type: "audio/webm" }));
    recorder.emitData(new Blob([" more"], { type: "audio/webm" }));
    const result = await gateway.stopCapture();

    expect(started).toMatchObject({
      captureId: "capture-webview-001",
      source: "microphone",
      permissionStatus: "granted",
      deviceKind: "audioinput",
    });
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        captureId: "capture-webview-001",
        durationMs: 1400,
        sizeBytes: 15,
        mimeType: "audio/webm;codecs=opus",
      },
      artifact: {
        relativePath:
          "artifacts/microphone-capture/audio/capture-webview-001.webm",
        extension: "webm",
        sensitivity: "real-user-audio",
        policy: "gitignored-local",
      },
    });
    expect(track.stopped).toBe(true);
  });

  it("guards overlapping recorder sessions", async () => {
    const gateway = new WebViewRecorderGateway({
      mediaDevices: {
        getUserMedia: async () => createMediaStream([new FakeMediaStreamTrack()]),
      },
      MediaRecorder: FakeMediaRecorder,
      createCaptureId: () => "capture-overlap",
    });

    await gateway.startCapture();

    await expect(gateway.startCapture()).rejects.toBeInstanceOf(
      ActiveCaptureSessionError,
    );
  });

  it("cancels an active recorder and stops tracks", async () => {
    const track = new FakeMediaStreamTrack();
    const gateway = new WebViewRecorderGateway({
      mediaDevices: {
        getUserMedia: async () => createMediaStream([track]),
      },
      MediaRecorder: FakeMediaRecorder,
      createCaptureId: () => "capture-cancelled",
    });

    await gateway.startCapture();
    const result = await gateway.cancelCapture();

    expect(result).toMatchObject({
      ok: false,
      error: {
        phase: "cancelled",
        code: "cancelled",
      },
    });
    expect(track.stopped).toBe(true);
  });

  it("maps empty recordings to a redacted runtime error", async () => {
    const gateway = new WebViewRecorderGateway({
      mediaDevices: {
        getUserMedia: async () => createMediaStream([new FakeMediaStreamTrack()]),
      },
      MediaRecorder: FakeMediaRecorder,
      createCaptureId: () => "capture-empty",
    });

    await gateway.startCapture();
    const result = await gateway.stopCapture();

    expect(result).toMatchObject({
      ok: false,
      error: {
        phase: "recording",
        code: "empty-audio",
        message: "Microphone capture produced no audio data.",
      },
    });
  });
});

describe("WebView recorder MIME policy", () => {
  it("selects the first supported recorder MIME type", () => {
    expect(
      chooseRecorderMimeType({
        isTypeSupported: (mimeType) => mimeType === "audio/ogg;codecs=opus",
      }),
    ).toEqual({
      mimeType: "audio/ogg;codecs=opus",
      extension: "ogg",
    });
  });

  it("maps recorder MIME types to safe extensions", () => {
    expect(extensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMimeType("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionForMimeType("audio/mp4")).toBe("m4a");
  });
});

class FakeMediaRecorder {
  static latest: FakeMediaRecorder;
  static isTypeSupported(mimeType: string): boolean {
    return mimeType === "audio/webm;codecs=opus" || mimeType === "audio/webm";
  }

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: { error?: unknown }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    FakeMediaRecorder.latest = this;
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }

  emitData(data: Blob): void {
    this.ondataavailable?.({ data });
  }
}

class FakeMediaStreamTrack {
  stopped = false;

  stop(): void {
    this.stopped = true;
  }
}

function createMediaStream(tracks: FakeMediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
  } as MediaStream;
}

function createClock(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
