import { describe, expect, test } from "bun:test";
import { evaluatePostgresPreflight } from "../src/execution/preflight.ts";

const profile = { profileId: "pro", label: "Pro", version: 1, source: "fallback" as const, definition: { quota: { limit: 2 }, engines: { transcription: "fixture" } } };

describe("PostgreSQL preflight service", () => {
  test("fails closed for unknown devices and reserves quota only for valid effective profiles", async () => {
    const missing = await evaluatePostgresPreflight({
      async resolveDevice() { return null; }, async resolveEffectiveProfile() { return profile; }, async reserve() { throw new Error("unexpected"); },
    }, { deviceId: "missing", idempotencyKey: "request-a" });
    expect(missing).toEqual({ ok: false, allowed: false, reason: "device_not_registered", limits: {}, profile: null, engines: {} });

    const result = await evaluatePostgresPreflight({
      async resolveDevice() { return { id: "device-uuid", deviceId: "fixture", accountId: null }; },
      async resolveEffectiveProfile() { return profile; },
      async reserve(input) {
        expect(input.deviceId).toBe("device-uuid");
        expect(input.limit).toBe(2);
        return { allowed: true, reservationId: "reservation", used: 0, reserved: 1, limit: 2, idempotent: false };
      },
    }, { deviceId: "fixture", idempotencyKey: "request-b", estimate: 1, now: new Date("2026-01-01T00:00:00.000Z") });
    expect(result).toEqual({ ok: true, allowed: true, reason: null, limits: { limit: 2, used: 0, reserved: 1 }, profile: { id: "pro", label: "Pro", version: 1, source: "fallback" }, engines: { transcription: "fixture" }, reservationId: "reservation" });
  });
});
