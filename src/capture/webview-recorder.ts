import { ActiveCaptureSessionError, type CaptureGateway } from "./gateway";
import type {
  CapturedAudioArtifact,
  CaptureError,
  CaptureMetadata,
  CapturePermissionStatus,
  CaptureResult,
} from "./types";

type RecorderState = "inactive" | "recording" | "paused";

type RecorderLike = {
  state: RecorderState;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: { error?: unknown }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
};

type RecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): RecorderLike;
  isTypeSupported?: (mimeType: string) => boolean;
};

type WebViewRecorderDependencies = {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  MediaRecorder?: RecorderConstructor;
  now?: () => number;
  createCaptureId?: () => string;
};

type ActiveRecording = {
  captureId: string;
  startedAt: number;
  stream: MediaStream;
  recorder: RecorderLike;
  metadata: CaptureMetadata;
  chunks: Blob[];
  mimeType: string;
  extension: string;
  terminalError?: CaptureError;
};

const preferredMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

export class WebViewRecorderGateway implements CaptureGateway {
  private active?: ActiveRecording;
  private readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  private readonly Recorder?: RecorderConstructor;
  private readonly now: () => number;
  private readonly createCaptureId: () => string;

  constructor(dependencies: WebViewRecorderDependencies = {}) {
    this.mediaDevices = dependencies.mediaDevices ?? globalThis.navigator?.mediaDevices;
    this.Recorder = (dependencies.MediaRecorder ??
      globalThis.MediaRecorder) as RecorderConstructor | undefined;
    this.now = dependencies.now ?? Date.now;
    this.createCaptureId =
      dependencies.createCaptureId ?? (() => `capture-${this.now()}`);
  }

  async getPermissionState(): Promise<CapturePermissionStatus> {
    if (!this.mediaDevices?.getUserMedia || !this.Recorder) {
      return "unavailable";
    }

    return "unknown";
  }

  async startCapture(): Promise<CaptureMetadata> {
    if (this.active) {
      throw new ActiveCaptureSessionError(this.active.captureId);
    }

    if (!this.mediaDevices?.getUserMedia || !this.Recorder) {
      return createMetadata(this.createCaptureId(), "unavailable");
    }

    const mime = chooseRecorderMimeType(this.Recorder);
    if (!mime) {
      return createMetadata(this.createCaptureId(), "error");
    }

    const captureId = this.createCaptureId();
    let stream: MediaStream;

    try {
      stream = await this.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      return createMetadata(captureId, mapPermissionStatus(error));
    }

    let recorder: RecorderLike;
    try {
      recorder = new this.Recorder(stream, { mimeType: mime.mimeType });
    } catch {
      stopMediaStream(stream);
      return createMetadata(captureId, "error");
    }

    const metadata = createMetadata(captureId, "granted");
    const active: ActiveRecording = {
      captureId,
      startedAt: this.now(),
      stream,
      recorder,
      metadata,
      chunks: [],
      mimeType: mime.mimeType,
      extension: mime.extension,
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        active.chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      active.terminalError = createRecorderError(event.error);
      stopMediaStream(stream);
    };

    try {
      recorder.start();
    } catch {
      stopMediaStream(stream);
      return createMetadata(captureId, "error");
    }

    this.active = active;

    return metadata;
  }

  async stopCapture(): Promise<CaptureResult> {
    const active = this.active;

    if (!active) {
      return createFailure(
        createMetadata(this.createCaptureId(), "unknown"),
        "recording",
        "unknown",
        "No active microphone capture.",
      );
    }

    if (active.terminalError) {
      stopMediaStream(active.stream);
      this.active = undefined;
      return createFailure(
        active.metadata,
        active.terminalError.phase,
        active.terminalError.code,
        active.terminalError.message,
      );
    }

    const stopped = new Promise<void>((resolve) => {
      active.recorder.onstop = resolve;
    });

    active.recorder.stop();
    await stopped;
    stopMediaStream(active.stream);
    this.active = undefined;

    const sizeBytes = active.chunks.reduce((total, chunk) => total + chunk.size, 0);
    const durationMs = Math.max(0, this.now() - active.startedAt);

    if (sizeBytes <= 0) {
      return createFailure(
        active.metadata,
        "recording",
        "empty-audio",
        "Microphone capture produced no audio data.",
      );
    }

    const artifact: CapturedAudioArtifact = {
      artifactId: `artifact-${active.captureId}`,
      captureId: active.captureId,
      relativePath: `artifacts/microphone-capture/audio/${active.captureId}.${active.extension}`,
      mimeType: active.mimeType,
      extension: active.extension,
      sizeBytes,
      durationMs,
      sensitivity: "real-user-audio",
      policy: "gitignored-local",
    };

    return {
      ok: true,
      metadata: {
        ...active.metadata,
        durationMs,
        mimeType: active.mimeType,
        sizeBytes,
        artifact,
      },
      artifact,
    };
  }

  async cancelCapture(): Promise<CaptureResult> {
    const active = this.active;
    const metadata = active?.metadata ?? createMetadata(this.createCaptureId(), "unknown");

    if (active) {
      stopMediaStream(active.stream);
      this.active = undefined;
    }

    return createFailure(
      metadata,
      "cancelled",
      "cancelled",
      "Microphone capture was cancelled.",
    );
  }
}

export function chooseRecorderMimeType(
  Recorder: Pick<RecorderConstructor, "isTypeSupported">,
): { mimeType: string; extension: string } | undefined {
  for (const mimeType of preferredMimeTypes) {
    if (Recorder.isTypeSupported?.(mimeType) ?? mimeType === "audio/webm") {
      return {
        mimeType,
        extension: extensionForMimeType(mimeType),
      };
    }
  }

  return undefined;
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mp4")) {
    return "m4a";
  }
  return "webm";
}

function createMetadata(
  captureId: string,
  permissionStatus: CapturePermissionStatus,
): CaptureMetadata {
  return {
    captureId,
    source: "microphone",
    permissionStatus,
    artifactPolicy: "gitignored-local",
    deviceKind: "audioinput",
  };
}

function createFailure(
  metadata: CaptureMetadata,
  phase: CaptureError["phase"],
  code: CaptureError["code"],
  message: string,
): CaptureResult {
  return {
    ok: false,
    metadata,
    error: {
      phase,
      code,
      message,
    },
  };
}

function createRecorderError(error: unknown): CaptureError {
  const name = error instanceof DOMException ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      phase: "permission",
      code: "permission-denied",
      message: "Microphone permission was denied.",
    };
  }

  if (name === "NotFoundError") {
    return {
      phase: "recording",
      code: "device-not-found",
      message: "No microphone input device was found.",
    };
  }

  if (name === "NotReadableError") {
    return {
      phase: "recording",
      code: "device-not-readable",
      message: "Microphone input could not be read.",
    };
  }

  return {
    phase: "recording",
    code: "unknown",
    message: "Microphone recorder failed.",
  };
}

function mapPermissionStatus(error: unknown): CapturePermissionStatus {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "denied";
  }
  if (name === "NotFoundError") {
    return "unavailable";
  }
  return "error";
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
