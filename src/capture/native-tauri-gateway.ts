import { invoke } from "@tauri-apps/api/core";
import type { CaptureGateway } from "./gateway";
import type {
  CaptureMetadata,
  CapturePermissionStatus,
  CaptureResult,
} from "./types";

export class NativeTauriCaptureGateway implements CaptureGateway {
  async getPermissionState(): Promise<CapturePermissionStatus> {
    return "unknown";
  }

  async startCapture(): Promise<CaptureMetadata> {
    return invoke<CaptureMetadata>("start_native_microphone_capture");
  }

  async stopCapture(): Promise<CaptureResult> {
    return invoke<CaptureResult>("stop_native_microphone_capture");
  }

  async cancelCapture(): Promise<CaptureResult> {
    return invoke<CaptureResult>("cancel_native_microphone_capture");
  }
}
