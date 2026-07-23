/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { compareBudgetLedgerShadow } from "../../fixvox-core/src/execution/budget-shadow";
import { BunSqlMigrationDatabase } from "../src/postgres/bun-sql-migration-database";
import {
  PostgresBudgetLedgerMaintenanceRepository,
  type LegacyBudgetEventFixture,
} from "../src/postgres/budget-ledger-maintenance-repository";
import { PostgresBudgetPricingRepository } from "../src/postgres/budget-pricing-repository";
import {
  BUDGET_LEDGER_QUERY_BOUNDS,
  PostgresBudgetLedgerRepository,
  budgetPeriodKeys,
  type BudgetLedgerSql,
} from "../src/postgres/budget-ledger-repository";
import { applyMigrations, loadMigrations } from "../src/postgres/migrations";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");

const migrationDatabase = new BunSqlMigrationDatabase(databaseUrl);
const databaseRows = await migrationDatabase.query<{ database_name: string }>(
  "SELECT current_database() AS database_name",
);
if (databaseRows[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");
await applyMigrations(migrationDatabase, await loadMigrations());
await migrationDatabase.close();

const sql = new Bun.SQL(databaseUrl);

async function resetBudgetData(): Promise<void> {
  await sql.unsafe(`
    TRUNCATE TABLE
      budget_ledger_read_model,
      budget_ledger_outbox,
      budget_ledger_imported_events,
      budget_ledger_checkpoints,
      budget_reservations,
      budget_counters
  `);
}

beforeEach(resetBudgetData);
afterAll(async () => {
  await resetBudgetData();
  await sql.close();
});

function reservation(input: {
  requestId: string;
  scopeId?: string;
  amount?: number;
  daily?: number | null;
  monthly?: number | null;
  mode?: "block" | "warn";
  occurredAt?: string;
  expiresAt?: string;
}) {
  return {
    requestId: input.requestId,
    scope: { type: "device" as const, id: input.scopeId ?? "ledger-device" },
    mode: input.mode ?? "block",
    limits: {
      dailyMicrousd: input.daily === undefined ? 1_000 : input.daily,
      monthlyMicrousd: input.monthly === undefined ? 10_000 : input.monthly,
    },
    estimatedMicrousd: input.amount ?? 100,
    occurredAt: input.occurredAt ?? "2026-07-21T12:00:00.000Z",
    expiresAt: input.expiresAt ?? "2027-01-01T00:00:00.000Z",
  };
}

function legacyDecision(input: {
  events: readonly LegacyBudgetEventFixture[];
  occurredAt: string;
  estimatedMicrousd: number;
  dailyMicrousd: number | null;
  monthlyMicrousd: number | null;
}): { allowed: boolean; reason: "daily_limit" | "monthly_limit" | null } {
  const keys = budgetPeriodKeys(input.occurredAt);
  let dailySpent = 0;
  let monthlySpent = 0;
  for (const event of input.events) {
    const eventKeys = budgetPeriodKeys(event.occurredAt);
    if (eventKeys.month === keys.month) monthlySpent += event.costMicrousd;
    if (eventKeys.day === keys.day) dailySpent += event.costMicrousd;
  }
  if (input.dailyMicrousd !== null && dailySpent + input.estimatedMicrousd > input.dailyMicrousd) {
    return { allowed: false, reason: "daily_limit" };
  }
  if (input.monthlyMicrousd !== null && monthlySpent + input.estimatedMicrousd > input.monthlyMicrousd) {
    return { allowed: false, reason: "monthly_limit" };
  }
  return { allowed: true, reason: null };
}

class CountingSql implements BudgetLedgerSql {
  constructor(
    private readonly inner: BudgetLedgerSql,
    readonly counter = { queries: 0 },
  ) {}

  async unsafe<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    this.counter.queries += 1;
    return await this.inner.unsafe<T>(query, parameters);
  }

  async begin<T>(operation: (transaction: BudgetLedgerSql) => Promise<T>): Promise<T> {
    return this.inner.begin(async (transaction) => operation(new CountingSql(transaction, this.counter)));
  }
}

describe("PostgreSQL O(1) budget ledger", () => {
  test("admits only reservations that fit daily and monthly counters under concurrency", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    const decisions = await Promise.all(Array.from({ length: 20 }, (_, index) => repository.reserve(reservation({
      requestId: `concurrent-${index}`,
      amount: 100,
      daily: 1_000,
      monthly: 1_000,
    }))));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(10);
    expect(decisions.filter((decision) => decision.reason === "daily_limit")).toHaveLength(10);

    const snapshot = await repository.snapshot({
      scope: { type: "device", id: "ledger-device" },
      occurredAt: "2026-07-21T12:00:00.000Z",
    });
    expect(snapshot.daily.reservedMicrousd).toBe(1_000);
    expect(snapshot.monthly.reservedMicrousd).toBe(1_000);
  });

  test("keeps serial and concurrent retries idempotent with bounded query counts", async () => {
    const counted = new CountingSql(sql);
    const repository = new PostgresBudgetLedgerRepository(counted);
    const input = reservation({ requestId: "same-request", amount: 250 });
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => repository.reserve(input)));
    expect(new Set(concurrent.map((decision) => decision.reservationId)).size).toBe(1);
    expect(concurrent.filter((decision) => !decision.idempotent)).toHaveLength(1);
    const rows = await sql.unsafe<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM budget_reservations WHERE request_id = 'same-request'",
    );
    expect(rows[0].count).toBe("1");

    await resetBudgetData();
    counted.counter.queries = 0;
    const first = await repository.reserve(reservation({ requestId: "query-count" }));
    expect(first.allowed).toBe(true);
    expect(counted.counter.queries).toBe(BUDGET_LEDGER_QUERY_BOUNDS.reserve);
    counted.counter.queries = 0;
    const retry = await repository.reserve(reservation({ requestId: "query-count" }));
    expect(retry.idempotent).toBe(true);
    expect(counted.counter.queries <= BUDGET_LEDGER_QUERY_BOUNDS.reserve).toBe(true);
  });

  test("fails closed when a request ID is retried with different immutable identity", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    const original = await repository.reserve(reservation({ requestId: "identity-request", amount: 100 }));
    expect(original.allowed).toBe(true);
    const conflicted = await repository.reserve(reservation({ requestId: "identity-request", amount: 101 }));
    expect(conflicted.allowed).toBe(false);
    expect(conflicted.reason).toBe("ledger_unavailable");
    const rows = await sql.unsafe<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM budget_reservations WHERE request_id = 'identity-request'",
    );
    expect(rows[0].count).toBe("1");
    const snapshot = await repository.snapshot({
      scope: { type: "device", id: "ledger-device" },
      occurredAt: "2026-07-21T12:00:00.000Z",
    });
    expect(snapshot.daily.reservedMicrousd).toBe(100);
    expect(snapshot.monthly.reservedMicrousd).toBe(100);
  });

  test("settles, releases and expires both counters exactly once", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);

    await repository.reserve(reservation({ requestId: "settle", amount: 300 }));
    const settled = await repository.settle({ requestId: "settle", actualMicrousd: 240 });
    expect(settled.idempotent).toBe(false);
    expect(settled.snapshot.daily).toEqual({
      periodKey: "2026-07-21",
      spentMicrousd: 240,
      reservedMicrousd: 0,
      revision: 2,
    });
    expect((await repository.settle({ requestId: "settle", actualMicrousd: 240 })).idempotent).toBe(true);

    await repository.reserve(reservation({ requestId: "release", amount: 200 }));
    expect((await repository.release({ requestId: "release", reason: "released" })).idempotent).toBe(false);
    expect((await repository.release({ requestId: "release", reason: "released" })).idempotent).toBe(true);

    await repository.reserve(reservation({ requestId: "expire", amount: 100 }));
    expect((await repository.release({ requestId: "expire", reason: "expired" })).state).toBe("expired");
    expect((await repository.release({ requestId: "expire", reason: "expired" })).idempotent).toBe(true);

    const snapshot = await repository.snapshot({
      scope: { type: "device", id: "ledger-device" },
      occurredAt: "2026-07-21T12:00:00.000Z",
    });
    expect(snapshot.daily.spentMicrousd).toBe(240);
    expect(snapshot.daily.reservedMicrousd).toBe(0);
    expect(snapshot.monthly.spentMicrousd).toBe(240);
    expect(snapshot.monthly.reservedMicrousd).toBe(0);
  });

  test("isolates UTC day and month rollover counters", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    await repository.reserve(reservation({
      requestId: "december",
      scopeId: "rollover-device",
      amount: 100,
      daily: 100,
      monthly: 100,
      occurredAt: "2026-12-31T23:59:59.999Z",
    }));
    const january = await repository.reserve(reservation({
      requestId: "january",
      scopeId: "rollover-device",
      amount: 100,
      daily: 100,
      monthly: 100,
      occurredAt: "2027-01-01T00:00:00.000Z",
    }));
    expect(january.allowed).toBe(true);

    const december = await repository.snapshot({
      scope: { type: "device", id: "rollover-device" },
      occurredAt: "2026-12-31T23:59:59.999Z",
    });
    const nextMonth = await repository.snapshot({
      scope: { type: "device", id: "rollover-device" },
      occurredAt: "2027-01-01T00:00:00.000Z",
    });
    expect(december.daily.reservedMicrousd).toBe(100);
    expect(december.monthly.reservedMicrousd).toBe(100);
    expect(nextMonth.daily.reservedMicrousd).toBe(100);
    expect(nextMonth.monthly.reservedMicrousd).toBe(100);
  });

  test("blocks exclusively on the monthly counter when the daily limit is absent", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    const first = await repository.reserve(reservation({
      requestId: "monthly-first",
      scopeId: "monthly-device",
      amount: 100,
      daily: null,
      monthly: 100,
    }));
    expect(first.allowed).toBe(true);
    const second = await repository.reserve(reservation({
      requestId: "monthly-second",
      scopeId: "monthly-device",
      amount: 1,
      daily: null,
      monthly: 100,
    }));
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("monthly_limit");
  });

  test("enforces immutable reservation identity in PostgreSQL", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    await repository.reserve(reservation({ requestId: "immutable-request", amount: 100 }));
    const mutationError = async (query: string): Promise<string> => {
      try {
        await sql.unsafe(query);
        return "missing_error";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    expect(await mutationError(
      "UPDATE budget_reservations SET request_id = 'changed-request' WHERE request_id = 'immutable-request'",
    )).toContain("budget_reservation_identity_is_immutable");
    expect(await mutationError(
      "UPDATE budget_reservations SET scope_id = 'changed-device' WHERE request_id = 'immutable-request'",
    )).toContain("budget_reservation_identity_is_immutable");
    expect(await mutationError(
      "UPDATE budget_reservations SET estimated_microusd = 101 WHERE request_id = 'immutable-request'",
    )).toContain("budget_reservation_identity_is_immutable");
    const rows = await sql.unsafe<{ request_id: string; scope_id: string; estimated_microusd: string }>(`
      SELECT request_id, scope_id, estimated_microusd::text
      FROM budget_reservations
      WHERE request_id = 'immutable-request'
    `);
    expect(rows).toEqual([{
      request_id: "immutable-request",
      scope_id: "ledger-device",
      estimated_microusd: "100",
    }]);
  });

  test("preserves warn and unlimited behavior while block remains fail-closed", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    const blocked = await repository.reserve(reservation({
      requestId: "blocked",
      scopeId: "mode-device",
      amount: 1,
      daily: 0,
      monthly: null,
    }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("daily_limit");

    const warned = await repository.reserve(reservation({
      requestId: "warned",
      scopeId: "mode-device",
      amount: 1,
      daily: 0,
      monthly: null,
      mode: "warn",
    }));
    expect(warned.allowed).toBe(true);
    expect(warned.reason).toBe("daily_limit");

    const unlimited = await repository.reserve(reservation({
      requestId: "unlimited",
      scopeId: "mode-device",
      amount: 1,
      daily: null,
      monthly: null,
    }));
    expect(unlimited.allowed).toBe(true);
  });

  test("backfills legacy day/month fixtures idempotently and preserves shadow decisions", async () => {
    const ledger = new PostgresBudgetLedgerRepository(sql);
    const maintenance = new PostgresBudgetLedgerMaintenanceRepository(sql);
    const scopeId = "legacy-private-device";
    const checkpointKey = "legacy-private-checkpoint";
    const events: LegacyBudgetEventFixture[] = [
      {
        sourceEventId: "legacy-private-event-previous-day",
        scope: { type: "device", id: scopeId },
        occurredAt: "2026-07-20T23:59:59.000Z",
        costMicrousd: 400,
      },
      {
        sourceEventId: "legacy-private-event-current-day",
        scope: { type: "device", id: scopeId },
        occurredAt: "2026-07-21T00:00:00.000Z",
        costMicrousd: 300,
      },
    ];

    const applied = await maintenance.backfillLegacyCheckpoint({ checkpointKey, events });
    expect(applied).toEqual({
      status: "applied",
      sourceEventCount: 2,
      importedEventCount: 2,
      counterUpdateCount: 3,
    });
    const retried = await maintenance.backfillLegacyCheckpoint({
      checkpointKey,
      events: [...events].reverse(),
    });
    expect(retried).toEqual({ ...applied, status: "already_applied" });
    const receipt = JSON.stringify([applied, retried]);
    expect(receipt).not.toContain(scopeId);
    expect(receipt).not.toContain(checkpointKey);
    expect(receipt).not.toContain(events[0].sourceEventId);
    expect(receipt).not.toContain("400");

    const snapshot = await ledger.snapshot({
      scope: { type: "device", id: scopeId },
      occurredAt: "2026-07-21T12:00:00.000Z",
    });
    expect(snapshot.daily.spentMicrousd).toBe(300);
    expect(snapshot.monthly.spentMicrousd).toBe(700);

    const cases = [
      { requestId: "shadow-allow", amount: 40, daily: 350, monthly: 750, reason: null },
      { requestId: "shadow-daily", amount: 60, daily: 350, monthly: 1_000, reason: "daily_limit" },
      { requestId: "shadow-monthly", amount: 60, daily: 1_000, monthly: 750, reason: "monthly_limit" },
    ] as const;
    for (const fixture of cases) {
      const legacy = legacyDecision({
        events,
        occurredAt: "2026-07-21T12:00:00.000Z",
        estimatedMicrousd: fixture.amount,
        dailyMicrousd: fixture.daily,
        monthlyMicrousd: fixture.monthly,
      });
      expect(legacy.reason).toBe(fixture.reason);
      const compared = await compareBudgetLedgerShadow({
        legacy,
        evaluateLedger: () => ledger.reserve(reservation({
          requestId: fixture.requestId,
          scopeId,
          amount: fixture.amount,
          daily: fixture.daily,
          monthly: fixture.monthly,
        })),
      });
      expect(compared.authoritative).toEqual(legacy);
      expect(compared.evidence.status).toBe("match");
      if (legacy.allowed) await ledger.release({ requestId: fixture.requestId, reason: "released" });
    }
  });

  test("expires reservations and projects outbox events idempotently outside reserve", async () => {
    const ledger = new PostgresBudgetLedgerRepository(sql);
    const maintenance = new PostgresBudgetLedgerMaintenanceRepository(sql);
    const requestId = "expiry-private-request";
    const amount = 125;
    const reserved = await ledger.reserve(reservation({
      requestId,
      scopeId: "expiry-private-device",
      amount,
      expiresAt: "2026-07-21T12:01:00.000Z",
    }));
    expect(reserved.allowed).toBe(true);

    const firstExpiry = await maintenance.expireDueReservations({
      now: "2026-07-21T13:00:00.000Z",
      limit: 10,
    });
    expect(firstExpiry).toEqual({ candidateCount: 1, expiredCount: 1 });
    const retryExpiry = await maintenance.expireDueReservations({
      now: "2026-07-21T13:00:00.000Z",
      limit: 10,
    });
    expect(retryExpiry).toEqual({ candidateCount: 0, expiredCount: 0 });

    const snapshot = await ledger.snapshot({
      scope: { type: "device", id: "expiry-private-device" },
      occurredAt: "2026-07-21T12:00:00.000Z",
    });
    expect(snapshot.daily.reservedMicrousd).toBe(0);
    expect(snapshot.monthly.reservedMicrousd).toBe(0);
    const reservations = await sql.unsafe<{ state: string }>(
      "SELECT state FROM budget_reservations WHERE request_id = $1",
      [requestId],
    );
    expect(reservations[0]?.state).toBe("expired");

    const published = await maintenance.publishPendingOutbox({ limit: 10 });
    expect(published).toEqual({ pendingCount: 1, publishedCount: 1 });
    expect(await maintenance.publishPendingOutbox({ limit: 10 })).toEqual({
      pendingCount: 0,
      publishedCount: 0,
    });
    const readModel = await sql.unsafe<{ event_type: string; safe_payload: unknown }>(`
      SELECT event_type, safe_payload
      FROM budget_ledger_read_model
    `);
    expect(readModel).toEqual([{
      event_type: "reservation_expired",
      safe_payload: { schemaVersion: 1, kind: "reservation_expired" },
    }]);
    const receipt = JSON.stringify([firstExpiry, retryExpiry, published, readModel]);
    expect(receipt).not.toContain(requestId);
    expect(receipt).not.toContain(String(amount));
  });

  test("reads only the latest typed STT pricing lifecycle record", async () => {
    const provider = "fixture-budget-provider";
    const model = "fixture-budget-model";
    try {
      await sql.unsafe(`
        INSERT INTO pricing_records (provider_id, model_id, pricing, effective_at)
        VALUES
          ($1, $2, $3::jsonb, '2026-01-01T00:00:00Z'),
          ($1, $2, $4::jsonb, '2026-02-01T00:00:00Z')
      `, [
        provider,
        model,
        JSON.stringify({ schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd: 1 }),
        JSON.stringify({ schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd: 2 }),
      ]);
      const repository = new PostgresBudgetPricingRepository(sql);
      expect(await repository.sttPriceMicrousd({ providerId: provider, modelId: model })).toBe(2);
    } finally {
      await sql.unsafe("DELETE FROM pricing_records WHERE provider_id = $1 AND model_id = $2", [provider, model]);
    }
  });

  test("keeps warmed reserve p95 within the local latency target", async () => {
    const repository = new PostgresBudgetLedgerRepository(sql);
    const latencies: number[] = [];
    for (let index = 0; index < 35; index += 1) {
      const startedAt = performance.now();
      const decision = await repository.reserve(reservation({
        requestId: `latency-${index}`,
        scopeId: "latency-device",
        amount: 1,
        daily: 1_000,
        monthly: 1_000,
      }));
      const elapsed = performance.now() - startedAt;
      expect(decision.allowed).toBe(true);
      await repository.release({ requestId: `latency-${index}`, reason: "released" });
      if (index >= 5) latencies.push(elapsed);
    }
    latencies.sort((left, right) => left - right);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
    console.info(`[fixvox-api] budget_ledger_reserve_p95_ms=${p95.toFixed(3)} queries=${BUDGET_LEDGER_QUERY_BOUNDS.reserve}`);
    expect(p95 <= 15).toBe(true);
  });
});
