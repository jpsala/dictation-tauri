import type { AccountFirstPhase, AccountFirstSnapshot } from "./account-first-flow";

export const getFixvoxSetupReadinessCommand = "get_fixvox_setup_readiness";

export type TauriSetupReadinessInvoke = (command: string) => Promise<unknown>;

type SetupReadinessProjection = {
  schemaVersion: 1;
  phase: AccountFirstPhase;
  ready: boolean;
  redacted: true;
};

const validPhases = new Set<AccountFirstPhase>([
  "welcome",
  "oauth_handoff",
  "account_linking",
  "microphone_setup",
  "shortcut_setup",
  "ready",
  "offline",
  "oauth_cancelled",
  "oauth_expired",
  "account_not_authorized",
  "binding_conflict",
  "policy_unavailable",
  "microphone_denied",
  "service_unavailable",
]);

const safeFallback: SetupReadinessProjection = {
  schemaVersion: 1,
  phase: "service_unavailable",
  ready: false,
  redacted: true,
};

/** Validates the narrow, host-owned setup projection before React renders it. */
export function normalizeSetupReadinessProjection(value: unknown): SetupReadinessProjection {
  if (!value || typeof value !== "object") {
    return safeFallback;
  }

  const candidate = value as Record<string, unknown>;
  const phase = candidate.phase;
  if (
    candidate.schemaVersion !== 1 ||
    typeof phase !== "string" ||
    !validPhases.has(phase as AccountFirstPhase) ||
    typeof candidate.ready !== "boolean" ||
    candidate.ready !== (phase === "ready") ||
    candidate.redacted !== true
  ) {
    return safeFallback;
  }

  return {
    schemaVersion: 1,
    phase: phase as AccountFirstPhase,
    ready: candidate.ready,
    redacted: true,
  };
}

/**
 * Boundary adapter for the future account-first router. It intentionally
 * exposes only the redacted phase snapshot and has no setup side effects.
 */
export function createTauriSetupReadinessAdapter(invoke: TauriSetupReadinessInvoke): {
  getSnapshot(): Promise<AccountFirstSnapshot>;
} {
  return {
    async getSnapshot() {
      try {
        const value = await invoke(getFixvoxSetupReadinessCommand);
        return { phase: normalizeSetupReadinessProjection(value).phase };
      } catch {
        return { phase: safeFallback.phase };
      }
    },
  };
}
