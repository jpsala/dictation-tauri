import { invoke } from "@tauri-apps/api/core";
import type { CaptureGateway } from "./gateway";
import type {
  CaptureMetadata,
  CapturePermissionStatus,
  CaptureResult,
} from "./types";

export type NativeCaptureLevel = {
  active: boolean;
  vuLevel: number;
  vuBands: number[];
  sampleCount: number;
};

export class NativeTauriCaptureGateway implements CaptureGateway {
  async getPermissionState(): Promise<CapturePermissionStatus> {
    return "unknown";
  }

  async startCapture(): Promise<CaptureMetadata> {
    const metadata = await invoke<CaptureMetadata>("start_native_microphone_capture");
    void invoke("prewarm_fixvox_managed_transcription").catch(() => undefined);
    return metadata;
  }

  async getCaptureLevel(): Promise<NativeCaptureLevel> {
    return invoke<NativeCaptureLevel>("get_native_microphone_capture_level");
  }

  async stopCapture(): Promise<CaptureResult> {
    return invoke<CaptureResult>("stop_native_microphone_capture");
  }

  async cancelCapture(): Promise<CaptureResult> {
    return invoke<CaptureResult>("cancel_native_microphone_capture");
  }
}
