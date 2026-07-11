import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host-owned output mute restore guards", () => {
  it("keeps output mute session host-owned and restores it on stop/cancel/start failure paths", () => {
    const nativeCapture = readFileSync("src-tauri/src/native_capture.rs", "utf8");
    const outputMute = readFileSync("src-tauri/src/output_mute.rs", "utf8");

    expect(nativeCapture).toContain("begin_output_mute_for_capture(&app)");
    expect(nativeCapture).toContain("output_mute: OutputMuteSession");
    expect(nativeCapture.match(/output_mute\.restore\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(nativeCapture).toContain("output_mute: Some(output_mute)");
    expect(outputMute).toContain("muted_by_app");
    expect(outputMute).toContain("output_mute_restored");
    expect(outputMute).toContain("windows_coreaudio_backend_pending");
    expect(outputMute).toContain("redacted: true");
  });
});
