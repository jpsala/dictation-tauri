export type QuotaWindowName = "rolling5h" | "weekly";

export type QuotaWindow = {
  used: number;
  remaining: number;
  limit: number;
};

export function deriveQuotaState(windows: Record<QuotaWindowName, QuotaWindow>): {
  state: "ok" | "almost_used" | "blocked" | "paused";
  blockedWindow: QuotaWindowName | null;
} {
  const blockedWindow = windows.rolling5h.remaining <= 0
    ? "rolling5h"
    : windows.weekly.remaining <= 0 ? "weekly" : null;
  const lowestRemainingRatio = Math.min(
    windows.rolling5h.limit > 0 ? windows.rolling5h.remaining / windows.rolling5h.limit : 0,
    windows.weekly.limit > 0 ? windows.weekly.remaining / windows.weekly.limit : 0,
  );
  return {
    blockedWindow,
    state: blockedWindow
      ? (windows.rolling5h.limit === 0 || windows.weekly.limit === 0 ? "paused" : "blocked")
      : lowestRemainingRatio <= 0.15 ? "almost_used" : "ok",
  };
}

export function quotaWouldExceed(
  limits: { windows: Record<QuotaWindowName, Pick<QuotaWindow, "used" | "limit">> },
  estimate: number,
): QuotaWindowName | null {
  if (limits.windows.rolling5h.used + estimate > limits.windows.rolling5h.limit) return "rolling5h";
  if (limits.windows.weekly.used + estimate > limits.windows.weekly.limit) return "weekly";
  return null;
}
