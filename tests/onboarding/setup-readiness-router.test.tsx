import { describe, expect, it } from "vitest";
import { resolveSetupReadinessRoute } from "../../src/onboarding/SetupReadinessRouter";
import {
  createTauriSetupReadinessAdapter,
  normalizeSetupReadinessProjection,
} from "../../src/onboarding/tauri-setup-readiness";

describe("setup readiness router", () => {
  it("holds the automatic checking state until the host projection resolves", () => {
    expect(resolveSetupReadinessRoute("checking")).toBe("checking");
  });

  it("renders the dock only for the host-owned ready projection", () => {
    expect(resolveSetupReadinessRoute("ready")).toBe("dock");
    expect(resolveSetupReadinessRoute("shortcut_setup")).toBe("onboarding");
  });

  it("keeps clean install and restart phases on the explicit onboarding route", async () => {
    const cleanInstall = createTauriSetupReadinessAdapter(async () => ({
      schemaVersion: 1,
      phase: "welcome",
      ready: false,
      redacted: true,
    }));
    const resumedInstall = createTauriSetupReadinessAdapter(async () => ({
      schemaVersion: 1,
      phase: "shortcut_setup",
      ready: false,
      redacted: true,
    }));

    await expect(cleanInstall.getSnapshot()).resolves.toEqual({ phase: "welcome" });
    await expect(resumedInstall.getSnapshot()).resolves.toEqual({ phase: "shortcut_setup" });
    expect(resolveSetupReadinessRoute("welcome")).toBe("onboarding");
    expect(resolveSetupReadinessRoute("shortcut_setup")).toBe("onboarding");
  });

  it("keeps every provider-free recovery projection out of the dock", () => {
    for (const phase of [
      "offline",
      "oauth_cancelled",
      "oauth_expired",
      "account_not_authorized",
      "binding_conflict",
      "policy_unavailable",
      "microphone_denied",
      "service_unavailable",
    ] as const) {
      const projection = normalizeSetupReadinessProjection({
        schemaVersion: 1,
        phase,
        ready: false,
        redacted: true,
      });
      expect(resolveSetupReadinessRoute(projection.phase)).toBe("onboarding");
      expect(JSON.stringify(projection)).not.toMatch(/device|token|subject|install|policyId/i);
    }
  });

  it("fails closed without exposing invalid host payload fields", async () => {
    const projection = normalizeSetupReadinessProjection({
      schemaVersion: 2,
      phase: "ready",
      ready: true,
      redacted: true,
      deviceId: "sensitive-device",
      token: "sensitive-token",
    });
    expect(resolveSetupReadinessRoute(projection.phase)).toBe("onboarding");
    expect(JSON.stringify(projection)).not.toMatch(/device|token/i);

    const adapter = createTauriSetupReadinessAdapter(async () => {
      throw new Error("raw host failure");
    });
    await expect(adapter.getSnapshot()).resolves.toEqual({ phase: "service_unavailable" });
  });
});
