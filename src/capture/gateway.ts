import type {
  CaptureMetadata,
  CapturePermissionStatus,
  CaptureResult,
} from "./types";

export interface CaptureGateway {
  getPermissionState(): Promise<CapturePermissionStatus>;
  startCapture(): Promise<CaptureMetadata>;
  stopCapture(): Promise<CaptureResult>;
  cancelCapture(): Promise<CaptureResult>;
}

export class ActiveCaptureSessionError extends Error {
  constructor(readonly activeCaptureId: string) {
    super(`Capture session already active: ${activeCaptureId}`);
    this.name = "ActiveCaptureSessionError";
  }
}
