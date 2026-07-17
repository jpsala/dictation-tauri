import type { EffectiveProfile, RegisteredDevice } from "../postgres/control-plane-repository.ts";
import type { QuotaReservationDecision } from "../postgres/usage-quota-repository.ts";

export type PreflightRepository = {
  resolveDevice(deviceId: string): Promise<RegisteredDevice | null>;
  resolveEffectiveProfile(input: { deviceId: string; fallbackProfileId: string }): Promise<EffectiveProfile | null>;
  reserve(input: {
    idempotencyKey: string;
    accountId?: string | null;
    deviceId: string;
    usageKind: string;
    amount: number;
    limit: number | null;
    windowStart: Date;
    expiresAt: Date;
    unlimited?: boolean;
  }): Promise<QuotaReservationDecision>;
};

export type PreflightInput = { deviceId: string; usageKind?: string; estimate?: number; idempotencyKey: string; now?: Date };

/** Transactional, provider-free authorization. The provider call consumes/releases this reservation later. */
export async function evaluatePostgresPreflight(repository: PreflightRepository, input: PreflightInput) {
  const device = await repository.resolveDevice(input.deviceId);
  if (!device) return { ok: false, allowed: false, reason: "device_not_registered", limits: {}, profile: null, engines: {} };
  const profile = await repository.resolveEffectiveProfile({ deviceId: input.deviceId, fallbackProfileId: "basic" });
  if (!profile) return { ok: false, allowed: false, reason: "profile_unavailable", limits: {}, profile: null, engines: {} };

  const quota = asRecord(profile.definition.quota);
  const unlimited = quota.mode === "unlimited" || quota.profile === "pro-unlimited";
  const limit = typeof quota.limit === "number" && quota.limit >= 0 ? quota.limit : null;
  const now = input.now ?? new Date();
  const decision = await repository.reserve({
    idempotencyKey: input.idempotencyKey,
    accountId: device.accountId,
    deviceId: device.id,
    usageKind: input.usageKind ?? "managed",
    amount: Math.max(0, input.estimate ?? 1),
    limit,
    unlimited,
    windowStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    expiresAt: new Date(now.getTime() + 60_000),
  });
  return {
    ok: true,
    allowed: decision.allowed,
    reason: decision.allowed ? null : "quota_exceeded",
    limits: { limit: decision.limit, used: decision.used, reserved: decision.reserved },
    profile: { id: profile.profileId, label: profile.label, version: profile.version, source: profile.source },
    engines: profile.definition.engines ?? {},
    reservationId: decision.reservationId,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
