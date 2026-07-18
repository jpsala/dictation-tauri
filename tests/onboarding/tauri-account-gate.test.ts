// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ensureTauriDictationReadiness,
  getEffectiveTauriAccountReadiness,
} from "../../src/onboarding/tauri-account-gate";

describe("Tauri account readiness gate", () => {
  it("accepts the host-owned ready projection without opening setup", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "get_fixvox_setup_readiness") {
        return { schemaVersion: 1, phase: "ready", ready: true, redacted: true };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(getEffectiveTauriAccountReadiness(invoke)).resolves.toEqual({ ready: true, phase: "ready" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("recognizes an already linked signed-in account when legacy readiness remains welcome", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "get_fixvox_setup_readiness") {
        return { schemaVersion: 1, phase: "welcome", ready: false, redacted: true };
      }
      if (command === "get_fixvox_cloud_status") {
        return {
          deviceRegistered: true,
          authPolicy: { accessMode: "signed_in" },
          capabilities: { canUseManagedTranscription: true },
          redacted: true,
        };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(getEffectiveTauriAccountReadiness(invoke)).resolves.toEqual({ ready: true, phase: "ready" });
  });

  it("opens account setup and performs zero capture work when dictation is not ready", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "get_fixvox_setup_readiness") {
        return { schemaVersion: 1, phase: "welcome", ready: false, redacted: true };
      }
      if (command === "get_fixvox_cloud_status") {
        return {
          deviceRegistered: false,
          authPolicy: { accessMode: "signed_out" },
          capabilities: { canUseManagedTranscription: false },
          redacted: true,
        };
      }
      if (command === "hide_dock" || command === "show_settings_window") {
        return null;
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(ensureTauriDictationReadiness(invoke)).resolves.toBe(false);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "get_fixvox_setup_readiness",
      "get_fixvox_cloud_status",
      "hide_dock",
      "show_settings_window",
    ]);
  });

  it("guards the central capture boundary before creating a desktop session", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const startCapture = source.slice(
      source.indexOf("async function startCapture"),
      source.indexOf("async function stopCapture"),
    );

    expect(startCapture).toContain("ensureTauriDictationReadiness(invoke)");
    expect(startCapture).toContain("Completá la configuración de tu cuenta antes de dictar.");
    expect(startCapture.indexOf("ensureTauriDictationReadiness(invoke)")).toBeLessThan(
      startCapture.indexOf("desktopSession.start()"),
    );
    expect(source).toContain("<TauriAccountGate invoke={invoke} renderReady={() => <DockSurface />} />");
  });
});
