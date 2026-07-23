/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { describe, expect, test } from "bun:test";

import {
  legacyCheckpointFingerprint,
  type LegacyBudgetEventFixture,
} from "../src/postgres/budget-ledger-maintenance-repository";
import { PostgresBudgetPricingRepository, parseSttPricingRecord, type BudgetPricingSql } from "../src/postgres/budget-pricing-repository";
import {
  BUDGET_LEDGER_QUERY_BOUNDS,
  PostgresBudgetLedgerRepository,
  budgetPeriodKeys,
  type BudgetLedgerSql,
} from "../src/postgres/budget-ledger-repository";

const failingSql: BudgetLedgerSql = {
  unsafe: async () => { throw new Error("database-private-detail"); },
  begin: async () => { throw new Error("database-private-detail"); },
};

function reservation(mode: "block" | "warn") {
  return {
    requestId: "request-safe-test",
    scope: { type: "device" as const, id: "device-safe-test" },
    mode,
    limits: { dailyMicrousd: 100, monthlyMicrousd: 1_000 },
    estimatedMicrousd: 10,
    occurredAt: "2026-07-21T23:59:59.000-03:00",
    expiresAt: "2026-07-22T04:00:00.000Z",
  };
}

describe("Postgres budget ledger boundary", () => {
  test("derives day and month keys in UTC", () => {
    expect(budgetPeriodKeys("2026-07-21T23:59:59.000-03:00")).toEqual({
      day: "2026-07-22",
      month: "2026-07-01",
    });
  });

  test("fails closed for block and preserves warn behavior on database failure", async () => {
    const repository = new PostgresBudgetLedgerRepository(failingSql);
    const blocked = await repository.reserve(reservation("block"));
    expect(blocked).toEqual({
      allowed: false,
      reason: "ledger_unavailable",
      reservationId: null,
      idempotent: false,
      snapshot: null,
    });
    const warned = await repository.reserve(reservation("warn"));
    expect(warned.allowed).toBe(true);
    expect(warned.reason).toBe("ledger_unavailable");
    expect(JSON.stringify(warned)).not.toContain("private");
  });

  test("declares bounded O(1) query ceilings and contains no historical aggregate", async () => {
    expect(BUDGET_LEDGER_QUERY_BOUNDS).toEqual({ reserve: 6, settle: 6, release: 6, snapshot: 1 });
    const source = await Bun.file(new URL("../src/postgres/budget-ledger-repository.ts", import.meta.url)).text();
    expect(source).not.toMatch(/\bSUM\s*\(/i);
    expect(source).not.toContain("usage_events");
    expect(source).not.toContain("usage_reservations");
    expect(source).not.toContain("budget_ledger_outbox");
    expect(source).not.toContain("budget_ledger_checkpoints");
  });

  test("accepts only typed USD per-hour STT pricing and reads the latest record", async () => {
    expect(parseSttPricingRecord({ schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd: 3_600_000 })).toEqual({
      schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd: 3_600_000,
    });
    expect(parseSttPricingRecord(JSON.stringify({ schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd: 7 }))?.priceMicrousd).toBe(7);
    expect(parseSttPricingRecord({ price: "0.111", unit: "hour" })).toBe(null);
    expect(parseSttPricingRecord({ schemaVersion: 1, currency: "EUR", unit: "per_hour", priceMicrousd: 1 })).toBe(null);
    let parameters: unknown[] | undefined;
    const sql: BudgetPricingSql = {
      async unsafe<T extends Record<string, unknown>>(_query: string, input?: unknown[]): Promise<T[]> {
        parameters = input;
        return [{ pricing: { schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd: 9 } } as unknown as T];
      },
    };
    const repository = new PostgresBudgetPricingRepository(sql);
    expect(await repository.sttPriceMicrousd({ providerId: " groq ", modelId: " whisper " })).toBe(9);
    expect(parameters).toEqual(["groq", "whisper"]);
  });

  test("fingerprints checkpoint fixtures independently of source order", () => {
    const events: LegacyBudgetEventFixture[] = [
      {
        sourceEventId: "legacy-event-a",
        scope: { type: "device", id: "legacy-device" },
        occurredAt: "2026-07-20T23:59:59.000Z",
        costMicrousd: 400,
      },
      {
        sourceEventId: "legacy-event-b",
        scope: { type: "device", id: "legacy-device" },
        occurredAt: "2026-07-21T00:00:00.000Z",
        costMicrousd: 300,
      },
    ];
    expect(legacyCheckpointFingerprint(events)).toBe(legacyCheckpointFingerprint([...events].reverse()));
    expect(legacyCheckpointFingerprint(events)).toHaveLength(64);
  });
});
