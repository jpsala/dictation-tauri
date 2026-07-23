/// <reference path="../bun-runtime.d.ts" />

import type {
  BudgetLedgerPort,
  BudgetPeriodSnapshot,
  BudgetReleaseResult,
  BudgetReservationInput,
  BudgetReserveDecision,
  BudgetScope,
  BudgetSettlementResult,
  BudgetSnapshot,
} from "../../../fixvox-core/src/ports/budget-ledger.ts";

type SqlRow = Record<string, unknown>;

export interface BudgetLedgerSql {
  unsafe<T extends SqlRow = SqlRow>(query: string, parameters?: unknown[]): Promise<T[]>;
  begin<T>(operation: (transaction: BudgetLedgerSql) => Promise<T>): Promise<T>;
}

type ReservationRow = {
  id: string;
  request_id: string;
  scope_type: "device";
  scope_id: string;
  day_key: string;
  month_key: string;
  estimated_microusd: string;
  settled_microusd: string | null;
  state: "reserved" | "settled" | "released" | "expired";
};

type CounterRow = {
  period_type: "day" | "month";
  period_key: string;
  spent_microusd: string;
  reserved_microusd: string;
  revision: string;
};

type PeriodKeys = { day: string; month: string };

export const BUDGET_LEDGER_QUERY_BOUNDS = {
  reserve: 6,
  settle: 6,
  release: 6,
  snapshot: 1,
} as const;

function requireNonEmpty(value: string): void {
  if (!value.trim()) throw new Error("budget_invalid_input");
}

function requireMicrousd(value: number | null): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error("budget_invalid_input");
  }
}

function toSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("budget_counter_out_of_range");
  return parsed;
}

export function budgetPeriodKeys(occurredAt: string): PeriodKeys {
  const instant = new Date(occurredAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("budget_invalid_timestamp");
  const day = instant.toISOString().slice(0, 10);
  return { day, month: `${day.slice(0, 7)}-01` };
}

function validateReservationInput(input: BudgetReservationInput): PeriodKeys {
  requireNonEmpty(input.requestId);
  requireNonEmpty(input.scope.id);
  requireMicrousd(input.estimatedMicrousd);
  requireMicrousd(input.limits.dailyMicrousd);
  requireMicrousd(input.limits.monthlyMicrousd);
  const keys = budgetPeriodKeys(input.occurredAt);
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error("budget_invalid_timestamp");
  return keys;
}

function emptyPeriod(periodKey: string): BudgetPeriodSnapshot {
  return { periodKey, spentMicrousd: 0, reservedMicrousd: 0, revision: 0 };
}

function snapshotFromRows(rows: CounterRow[], keys: PeriodKeys): BudgetSnapshot {
  const byPeriod = new Map(rows.map((row) => [row.period_type, row]));
  const build = (period: "day" | "month", periodKey: string): BudgetPeriodSnapshot => {
    const row = byPeriod.get(period);
    return row ? {
      periodKey: row.period_key,
      spentMicrousd: toSafeInteger(row.spent_microusd),
      reservedMicrousd: toSafeInteger(row.reserved_microusd),
      revision: toSafeInteger(row.revision),
    } : emptyPeriod(periodKey);
  };
  return { daily: build("day", keys.day), monthly: build("month", keys.month) };
}

async function lockRequest(transaction: BudgetLedgerSql, requestId: string): Promise<void> {
  await transaction.unsafe(
    "SELECT pg_advisory_xact_lock(hashtext('budget-request'), hashtext($1))",
    [requestId],
  );
}

async function findReservation(transaction: BudgetLedgerSql, requestId: string): Promise<ReservationRow | null> {
  const rows = await transaction.unsafe<ReservationRow>(`
    SELECT
      id::text, request_id, scope_type, scope_id,
      day_key::text, month_key::text,
      estimated_microusd::text, settled_microusd::text, state
    FROM budget_reservations
    WHERE request_id = $1
    FOR UPDATE
  `, [requestId]);
  return rows[0] ?? null;
}

async function ensureAndLockCounters(
  transaction: BudgetLedgerSql,
  scope: BudgetScope,
  keys: PeriodKeys,
): Promise<CounterRow[]> {
  await transaction.unsafe(`
    INSERT INTO budget_counters (scope_type, scope_id, period_type, period_key)
    VALUES
      ($1, $2, 'day', $3::date),
      ($1, $2, 'month', $4::date)
    ON CONFLICT (scope_type, scope_id, period_type, period_key) DO NOTHING
  `, [scope.type, scope.id, keys.day, keys.month]);
  return await transaction.unsafe<CounterRow>(`
    SELECT period_type, period_key::text, spent_microusd::text, reserved_microusd::text, revision::text
    FROM budget_counters
    WHERE scope_type = $1 AND scope_id = $2
      AND ((period_type = 'day' AND period_key = $3::date)
        OR (period_type = 'month' AND period_key = $4::date))
    ORDER BY CASE period_type WHEN 'day' THEN 0 ELSE 1 END
    FOR UPDATE
  `, [scope.type, scope.id, keys.day, keys.month]);
}

async function readCounters(
  transaction: BudgetLedgerSql,
  scope: BudgetScope,
  keys: PeriodKeys,
): Promise<CounterRow[]> {
  return await transaction.unsafe<CounterRow>(`
    SELECT period_type, period_key::text, spent_microusd::text, reserved_microusd::text, revision::text
    FROM budget_counters
    WHERE scope_type = $1 AND scope_id = $2
      AND ((period_type = 'day' AND period_key = $3::date)
        OR (period_type = 'month' AND period_key = $4::date))
    ORDER BY CASE period_type WHEN 'day' THEN 0 ELSE 1 END
  `, [scope.type, scope.id, keys.day, keys.month]);
}

function assertReservationIdentity(row: ReservationRow, input: BudgetReservationInput, keys: PeriodKeys): void {
  if (row.scope_type !== input.scope.type
    || row.scope_id !== input.scope.id
    || row.day_key !== keys.day
    || row.month_key !== keys.month
    || toSafeInteger(row.estimated_microusd) !== input.estimatedMicrousd) {
    throw new Error("budget_reservation_identity_conflict");
  }
}

function limitReason(input: BudgetReservationInput, snapshot: BudgetSnapshot): "daily_limit" | "monthly_limit" | null {
  const daily = snapshot.daily.spentMicrousd + snapshot.daily.reservedMicrousd + input.estimatedMicrousd;
  if (input.limits.dailyMicrousd !== null && daily > input.limits.dailyMicrousd) return "daily_limit";
  const monthly = snapshot.monthly.spentMicrousd + snapshot.monthly.reservedMicrousd + input.estimatedMicrousd;
  if (input.limits.monthlyMicrousd !== null && monthly > input.limits.monthlyMicrousd) return "monthly_limit";
  return null;
}

export class PostgresBudgetLedgerRepository implements BudgetLedgerPort {
  constructor(private readonly sql: BudgetLedgerSql) {}

  async reserve(input: BudgetReservationInput): Promise<BudgetReserveDecision> {
    const keys = validateReservationInput(input);
    try {
      return await this.sql.begin(async (transaction) => {
        await lockRequest(transaction, input.requestId);
        const existing = await findReservation(transaction, input.requestId);
        if (existing) {
          assertReservationIdentity(existing, input, keys);
          const snapshot = snapshotFromRows(await readCounters(transaction, input.scope, keys), keys);
          const active = existing.state === "reserved" || existing.state === "settled";
          return {
            allowed: active,
            reason: active ? null : "reservation_inactive",
            reservationId: existing.id,
            idempotent: true,
            snapshot,
          };
        }

        const locked = await ensureAndLockCounters(transaction, input.scope, keys);
        if (locked.length !== 2) throw new Error("budget_counter_lock_failed");
        const before = snapshotFromRows(locked, keys);
        const reason = limitReason(input, before);
        if (reason && input.mode === "block") {
          return { allowed: false, reason, reservationId: null, idempotent: false, snapshot: before };
        }

        const reservations = await transaction.unsafe<{ id: string }>(`
          INSERT INTO budget_reservations (
            request_id, scope_type, scope_id, day_key, month_key,
            estimated_microusd, state, expires_at
          ) VALUES ($1, $2, $3, $4::date, $5::date, $6, 'reserved', $7::timestamptz)
          RETURNING id::text
        `, [
          input.requestId,
          input.scope.type,
          input.scope.id,
          keys.day,
          keys.month,
          input.estimatedMicrousd,
          input.expiresAt,
        ]);
        const counters = await transaction.unsafe<CounterRow>(`
          UPDATE budget_counters
          SET reserved_microusd = reserved_microusd + $5,
              revision = revision + 1,
              updated_at = now()
          WHERE scope_type = $1 AND scope_id = $2
            AND ((period_type = 'day' AND period_key = $3::date)
              OR (period_type = 'month' AND period_key = $4::date))
          RETURNING period_type, period_key::text, spent_microusd::text, reserved_microusd::text, revision::text
        `, [input.scope.type, input.scope.id, keys.day, keys.month, input.estimatedMicrousd]);
        if (!reservations[0] || counters.length !== 2) throw new Error("budget_reservation_write_failed");
        return {
          allowed: true,
          reason,
          reservationId: reservations[0].id,
          idempotent: false,
          snapshot: snapshotFromRows(counters, keys),
        };
      });
    } catch {
      return {
        allowed: input.mode !== "block",
        reason: "ledger_unavailable",
        reservationId: null,
        idempotent: false,
        snapshot: null,
      };
    }
  }

  async settle(input: { requestId: string; actualMicrousd: number }): Promise<BudgetSettlementResult> {
    requireNonEmpty(input.requestId);
    requireMicrousd(input.actualMicrousd);
    return this.sql.begin(async (transaction) => {
      await lockRequest(transaction, input.requestId);
      const reservation = await findReservation(transaction, input.requestId);
      if (!reservation) throw new Error("budget_reservation_not_found");
      const scope: BudgetScope = { type: reservation.scope_type, id: reservation.scope_id };
      const keys = { day: reservation.day_key, month: reservation.month_key };
      if (reservation.state === "settled") {
        if (toSafeInteger(reservation.settled_microusd ?? "-1") !== input.actualMicrousd) {
          throw new Error("budget_settlement_conflict");
        }
        return {
          state: "settled",
          idempotent: true,
          snapshot: snapshotFromRows(await readCounters(transaction, scope, keys), keys),
        };
      }
      if (reservation.state !== "reserved") throw new Error("budget_reservation_not_active");

      const locked = await ensureAndLockCounters(transaction, scope, keys);
      if (locked.length !== 2) throw new Error("budget_counter_lock_failed");
      const estimated = toSafeInteger(reservation.estimated_microusd);
      const counters = await transaction.unsafe<CounterRow>(`
        UPDATE budget_counters
        SET reserved_microusd = reserved_microusd - $5,
            spent_microusd = spent_microusd + $6,
            revision = revision + 1,
            updated_at = now()
        WHERE scope_type = $1 AND scope_id = $2
          AND reserved_microusd >= $5
          AND ((period_type = 'day' AND period_key = $3::date)
            OR (period_type = 'month' AND period_key = $4::date))
        RETURNING period_type, period_key::text, spent_microusd::text, reserved_microusd::text, revision::text
      `, [scope.type, scope.id, keys.day, keys.month, estimated, input.actualMicrousd]);
      if (counters.length !== 2) throw new Error("budget_counter_transition_failed");
      await transaction.unsafe(`
        UPDATE budget_reservations
        SET state = 'settled', settled_microusd = $2, updated_at = now()
        WHERE request_id = $1 AND state = 'reserved'
      `, [input.requestId, input.actualMicrousd]);
      return { state: "settled", idempotent: false, snapshot: snapshotFromRows(counters, keys) };
    });
  }

  async release(input: { requestId: string; reason: "released" | "expired" }): Promise<BudgetReleaseResult> {
    requireNonEmpty(input.requestId);
    return this.sql.begin(async (transaction) => {
      await lockRequest(transaction, input.requestId);
      const reservation = await findReservation(transaction, input.requestId);
      if (!reservation) throw new Error("budget_reservation_not_found");
      const scope: BudgetScope = { type: reservation.scope_type, id: reservation.scope_id };
      const keys = { day: reservation.day_key, month: reservation.month_key };
      if (reservation.state === input.reason) {
        return {
          state: input.reason,
          idempotent: true,
          snapshot: snapshotFromRows(await readCounters(transaction, scope, keys), keys),
        };
      }
      if (reservation.state !== "reserved") throw new Error("budget_reservation_not_active");

      const locked = await ensureAndLockCounters(transaction, scope, keys);
      if (locked.length !== 2) throw new Error("budget_counter_lock_failed");
      const estimated = toSafeInteger(reservation.estimated_microusd);
      const counters = await transaction.unsafe<CounterRow>(`
        UPDATE budget_counters
        SET reserved_microusd = reserved_microusd - $5,
            revision = revision + 1,
            updated_at = now()
        WHERE scope_type = $1 AND scope_id = $2
          AND reserved_microusd >= $5
          AND ((period_type = 'day' AND period_key = $3::date)
            OR (period_type = 'month' AND period_key = $4::date))
        RETURNING period_type, period_key::text, spent_microusd::text, reserved_microusd::text, revision::text
      `, [scope.type, scope.id, keys.day, keys.month, estimated]);
      if (counters.length !== 2) throw new Error("budget_counter_transition_failed");
      await transaction.unsafe(`
        UPDATE budget_reservations
        SET state = $2, updated_at = now()
        WHERE request_id = $1 AND state = 'reserved'
      `, [input.requestId, input.reason]);
      return { state: input.reason, idempotent: false, snapshot: snapshotFromRows(counters, keys) };
    });
  }

  async snapshot(input: { scope: BudgetScope; occurredAt: string }): Promise<BudgetSnapshot> {
    requireNonEmpty(input.scope.id);
    const keys = budgetPeriodKeys(input.occurredAt);
    return snapshotFromRows(await readCounters(this.sql, input.scope, keys), keys);
  }
}
