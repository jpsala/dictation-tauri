import { describe, expect, it } from "vitest";
import {
  createTauriSetupReadinessAdapter,
  getFixvoxSetupReadinessCommand,
  normalizeSetupReadinessProjection,
} from "../../src/onboarding/tauri-setup-readiness";

describe("Tauri setup readiness adapter", () => {
  it("keeps only the four redacted host projection fields", () => {
    const projection = normalizeSetupReadinessProjection({
      schemaVersion: 1,
      phase: "shortcut_setup",
      ready: false,
      redacted: true,
      deviceId: "sensitive-device",
      installId: "sensitive-install",
      policy: { raw: true },
      token: "sensitive-token",
    });

    expect(projection).toEqual({
      schemaVersion: 1,
      phase: "shortcut_setup",
      ready: false,
      redacted: true,
    });
    expect(JSON.stringify(projection)).not.toMatch(/device|install|policy|token/i);
  });

  it("fails closed for invalid payloads and invoke failures", async () => {
    expect(
      normalizeSetupReadinessProjection({
        schemaVersion: 2,
        phase: "ready",
        ready: true,
        redacted: true,
      }),
    ).toEqual({ schemaVersion: 1, phase: "service_unavailable", ready: false, redacted: true });

    const adapter = createTauriSetupReadinessAdapter(async () => {
      throw new Error("raw host failure");
    });
    await expect(adapter.getSnapshot()).resolves.toEqual({ phase: "service_unavailable" });
  });

  it("invokes the dedicated host command and returns only a phase snapshot", async () => {
    const commands: string[] = [];
    const adapter = createTauriSetupReadinessAdapter(async (command) => {
      commands.push(command);
      return {
        schemaVersion: 1,
        phase: "welcome",
        ready: false,
        redacted: true,
        backend: "must not reach React",
      };
    });

    await expect(adapter.getSnapshot()).resolves.toEqual({ phase: "welcome" });
    expect(commands).toEqual([getFixvoxSetupReadinessCommand]);
  });
});
