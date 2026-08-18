// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccountNoticeSurface } from "../../src/onboarding/account-notice-surface";
import {
  dockGateFeedbackForPhase,
  ensureTauriDictationReadiness,
  getEffectiveTauriAccountReadiness,
  openTauriAccountNotice,
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
    expect(startCapture.indexOf('state: "requesting_permission"')).toBeLessThan(
      startCapture.indexOf("ensureTauriDictationReadiness(invoke)"),
    );
    expect(startCapture.indexOf("ensureTauriDictationReadiness(invoke)")).toBeLessThan(
      startCapture.indexOf("desktopSession.start()"),
    );
    expect(source).toContain("<TauriAccountGate invoke={invoke} renderReady={() => <DockSurface />} />");
    expect(source).toContain("<SetupReadinessRouter invoke={invoke} onReady={completeOnboarding} />");
  });
});

describe("dock gate feedback copy", () => {
  it("offers account connection for a not-signed-in service", () => {
    expect(dockGateFeedbackForPhase("service_unavailable")).toEqual({
      label: "Conectá tu cuenta",
      detail: "Iniciá sesión para empezar a dictar.",
      action: "open-notice",
    });
  });

  it("offers an immediate retry for connectivity and policy outages", () => {
    for (const phase of ["offline", "policy_unavailable"] as const) {
      expect(dockGateFeedbackForPhase(phase).action).toBe("refresh");
    }
  });

  it("keeps transient and setup phases non-interactive", () => {
    for (const phase of [null, "checking", "welcome", "oauth_handoff"] as const) {
      expect(dockGateFeedbackForPhase(phase).action).toBeUndefined();
    }
  });

  it("never exposes device id, policy, provider, or tokens", () => {
    for (const phase of ["service_unavailable", "offline", "policy_unavailable", null] as const) {
      const feedback = dockGateFeedbackForPhase(phase);
      expect(`${feedback.label} ${feedback.detail}`.toLowerCase()).not.toMatch(
        /device|policy|provider|token|google/,
      );
    }
  });
});

describe("account notice window", () => {
  it("opens the compact notice without hiding the dock", async () => {
    const invoke = vi.fn(async () => null);

    await openTauriAccountNotice(invoke);

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "show_account_notice_window",
    ]);
  });

  it("renders the static notice copy without exposing account details", () => {
    const markup = renderToStaticMarkup(createElement(AccountNoticeSurface));

    expect(markup).toContain("Conectá tu cuenta");
    expect(markup).toContain("Iniciá sesión para empezar a dictar.");
    expect(markup).toContain("Cerrar");
    expect(markup.toLowerCase()).not.toMatch(/device|policy|provider|token|google/);
  });
});
