// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ensureTauriDictationReadiness,
  getEffectiveTauriAccountReadiness,
  projectTauriAccountGateReady,
  shouldOpenTauriAccountSetup,
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

  it("keeps an expired host-owned session out of the dock", async () => {
    const invoke = vi.fn(async () => ({
      schemaVersion: 1,
      phase: "oauth_expired",
      ready: false,
      redacted: true,
    }));

    await expect(getEffectiveTauriAccountReadiness(invoke)).resolves.toEqual({
      ready: false,
      phase: "oauth_expired",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not open onboarding for transient startup and connectivity phases", () => {
    for (const phase of ["checking", "offline", "policy_unavailable", "service_unavailable"] as const) {
      expect(shouldOpenTauriAccountSetup(phase), phase).toBe(false);
    }

    for (const phase of ["welcome", "oauth_expired", "account_not_authorized", "binding_conflict"] as const) {
      expect(shouldOpenTauriAccountSetup(phase), phase).toBe(true);
    }
  });

  it("keeps an already-ready dock mounted across transient readiness failures", () => {
    for (const phase of ["checking", "offline", "policy_unavailable", "service_unavailable"] as const) {
      expect(projectTauriAccountGateReady(true, { ready: false, phase }), phase).toBe(true);
      expect(projectTauriAccountGateReady(false, { ready: false, phase }), phase).toBe(false);
    }

    expect(projectTauriAccountGateReady(true, { ready: false, phase: "oauth_expired" })).toBe(false);
    expect(projectTauriAccountGateReady(false, { ready: true, phase: "ready" })).toBe(true);
  });

  it("opens account setup and performs zero capture work when dictation is not ready", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "get_fixvox_setup_readiness") {
        return { schemaVersion: 1, phase: "welcome", ready: false, redacted: true };
      }
      if (command === "hide_dock" || command === "show_account_setup_window") {
        return null;
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(ensureTauriDictationReadiness(invoke)).resolves.toBe(false);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "get_fixvox_setup_readiness",
      "hide_dock",
      "show_account_setup_window",
    ]);
  });

  it("keeps transient readiness failures from opening account setup during dictation", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "get_fixvox_setup_readiness") {
        throw new Error("temporary startup failure");
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(ensureTauriDictationReadiness(invoke)).resolves.toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
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
    expect(source).toContain("<SetupReadinessRouter invoke={invoke} onReady={completeOnboarding} />");
  });
});
