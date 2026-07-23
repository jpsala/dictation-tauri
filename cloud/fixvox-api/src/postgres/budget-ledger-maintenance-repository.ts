/// <reference path="../bun-runtime.d.ts" />

import type { BudgetScope } from "../../../fixvox-core/src/ports/budget-ledger.ts";
import { budgetPeriodKeys, type BudgetLedgerSql } from "./budget-ledger-repository.ts";

export type LegacyBudgetEventFixture = {
  sourceEventId: string;
  scope: BudgetScope;
  occurredAt: string;
  costMicrousd: number;
};

export type BudgetBackfillReceipt = {
  status: "applied" | "already_applied";
  sourceEventCount: number;
  importedEventCount: number;
  counterUpdateCount: number;
};

export type BudgetExpiryReceipt = {
  candidateCount: number;
  expiredCount: number;
};

export type BudgetProjectionReceipt = {
  pendingCount: number;
  publishedCount: number;
};

type CheckpointRow = {
  source_fingerprint: string;
  source_event_count: number;
  imported_event_count: number;
  counter_update_count: number;
};

type ImportedEventRow = { source_fingerprint: string };

type ExpiringReservationRow = {
  request_id: string;
  scope_type: "device";
  scope_id: string;
  day_key: string;
  month_key: string;
  estimated_microusd: string;
};

type CounterRow = { period_type: "day" | "month" };

type OutboxEventType = "legacy_checkpoint_applied" | "reservation_expired";

type OutboxRow = {
  id: string;
  event_type: OutboxEventType;
  safe_payload: { schemaVersion: number; kind: OutboxEventType };
};

type CounterIncrement = {
  scope: BudgetScope;
  periodType: "day" | "month";
  periodKey: string;
  spentMicrousd: number;
};

function requireNonEmpty(value: string): void {
  if (!value.trim()) throw new Error("budget_maintenance_invalid_input");
}

function requireMicrousd(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("budget_maintenance_invalid_input");
}

function toSafeInteger(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("budget_maintenance_value_out_of_range");
  return parsed;
}

function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function canonicalEvent(event: LegacyBudgetEventFixture): string {
  const keys = budgetPeriodKeys(event.occurredAt);
  return JSON.stringify([
    event.sourceEventId,
    event.scope.type,
    event.scope.id,
    keys.day,
    keys.month,
    event.costMicrousd,
  ]);
}

function validateEvents(events: readonly LegacyBudgetEventFixture[]): LegacyBudgetEventFixture[] {
  const sorted = [...events].sort((left, right) => left.sourceEventId.localeCompare(right.sourceEventId));
  const seen = new Set<string>();
  for (const event of sorted) {
    requireNonEmpty(event.sourceEventId);
    requireNonEmpty(event.scope.id);
    requireMicrousd(event.costMicrousd);
    budgetPeriodKeys(event.occurredAt);
    if (seen.has(event.sourceEventId)) throw new Error("budget_maintenance_duplicate_source_event");
    seen.add(event.sourceEventId);
  }
  return sorted;
}

export function legacyCheckpointFingerprint(events: readonly LegacyBudgetEventFixture[]): string {
  return sha256(validateEvents(events).map(canonicalEvent).join("\n"));
}

function checkpointReceipt(status: BudgetBackfillReceipt["status"], row: CheckpointRow): BudgetBackfillReceipt {
  return {
    status,
    sourceEventCount: toSafeInteger(row.source_event_count),
    importedEventCount: toSafeInteger(row.imported_event_count),
    counterUpdateCount: toSafeInteger(row.counter_update_count),
  };
}

function incrementKey(increment: Omit<CounterIncrement, "spentMicrousd">): string {
  return JSON.stringify([increment.scope.type, increment.scope.id, increment.periodType, increment.periodKey]);
}

function addIncrement(
  increments: Map<string, CounterIncrement>,
  increment: CounterIncrement,
): void {
  const key = incrementKey(increment);
  const current = increments.get(key);
  const spentMicrousd = (current?.spentMicrousd ?? 0) + increment.spentMicrousd;
  requireMicrousd(spentMicrousd);
  increments.set(key, { ...increment, spentMicrousd });
}

function safePayload(kind: OutboxEventType): { schemaVersion: number; kind: OutboxEventType } {
  return { schemaVersion: 1, kind };
}

async function lockRequest(transaction: BudgetLedgerSql, requestId: string): Promise<void> {
  await transaction.unsafe(
    "SELECT pg_advisory_xact_lock(hashtext('budget-request'), hashtext($1))",
    [requestId],
  );
}

export class PostgresBudgetLedgerMaintenanceRepository {
  constructor(private readonly sql: BudgetLedgerSql) {}

  async backfillLegacyCheckpoint(input: {
    checkpointKey: string;
    events: readonly LegacyBudgetEventFixture[];
  }): Promise<BudgetBackfillReceipt> {
    requireNonEmpty(input.checkpointKey);
    const events = validateEvents(input.events);
    const fingerprint = legacyCheckpointFingerprint(events);

    return this.sql.begin(async (transaction) => {
      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtext('budget-checkpoint'), hashtext($1))",
        [input.checkpointKey],
      );
      const existing = await transaction.unsafe<CheckpointRow>(`
        SELECT source_fingerprint, source_event_count, imported_event_count, counter_update_count
        FROM budget_ledger_checkpoints
        WHERE checkpoint_key = $1
        FOR UPDATE
      `, [input.checkpointKey]);
      if (existing[0]) {
        if (existing[0].source_fingerprint !== fingerprint) throw new Error("budget_checkpoint_conflict");
        return checkpointReceipt("already_applied", existing[0]);
      }

      await transaction.unsafe(`
        INSERT INTO budget_ledger_checkpoints (
          checkpoint_key, source_fingerprint, source_event_count,
          imported_event_count, counter_update_count
        ) VALUES ($1, $2, $3, 0, 0)
      `, [input.checkpointKey, fingerprint, events.length]);

      const increments = new Map<string, CounterIncrement>();
      let importedEventCount = 0;
      for (const event of events) {
        const keys = budgetPeriodKeys(event.occurredAt);
        const eventFingerprint = sha256(canonicalEvent(event));
        const inserted = await transaction.unsafe<{ source_event_id: string }>(`
          INSERT INTO budget_ledger_imported_events (
            source_event_id, source_fingerprint, checkpoint_key,
            scope_type, scope_id, occurred_at, day_key, month_key, cost_microusd
          ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::date, $8::date, $9)
          ON CONFLICT (source_event_id) DO NOTHING
          RETURNING source_event_id
        `, [
          event.sourceEventId,
          eventFingerprint,
          input.checkpointKey,
          event.scope.type,
          event.scope.id,
          event.occurredAt,
          keys.day,
          keys.month,
          event.costMicrousd,
        ]);
        if (inserted[0]) {
          importedEventCount += 1;
          addIncrement(increments, {
            scope: event.scope,
            periodType: "day",
            periodKey: keys.day,
            spentMicrousd: event.costMicrousd,
          });
          addIncrement(increments, {
            scope: event.scope,
            periodType: "month",
            periodKey: keys.month,
            spentMicrousd: event.costMicrousd,
          });
          continue;
        }
        const duplicate = await transaction.unsafe<ImportedEventRow>(`
          SELECT source_fingerprint
          FROM budget_ledger_imported_events
          WHERE source_event_id = $1
        `, [event.sourceEventId]);
        if (duplicate[0]?.source_fingerprint !== eventFingerprint) {
          throw new Error("budget_source_event_conflict");
        }
      }

      const orderedIncrements = [...increments.values()].sort((left, right) => {
        const scopeOrder = left.scope.id.localeCompare(right.scope.id);
        if (scopeOrder !== 0) return scopeOrder;
        if (left.periodType !== right.periodType) return left.periodType === "day" ? -1 : 1;
        return left.periodKey.localeCompare(right.periodKey);
      });
      for (const increment of orderedIncrements) {
        await transaction.unsafe(`
          INSERT INTO budget_counters (
            scope_type, scope_id, period_type, period_key,
            spent_microusd, reserved_microusd, revision
          ) VALUES ($1, $2, $3, $4::date, $5, 0, 1)
          ON CONFLICT (scope_type, scope_id, period_type, period_key)
          DO UPDATE SET
            spent_microusd = budget_counters.spent_microusd + EXCLUDED.spent_microusd,
            revision = budget_counters.revision + 1,
            updated_at = now()
        `, [
          increment.scope.type,
          increment.scope.id,
          increment.periodType,
          increment.periodKey,
          increment.spentMicrousd,
        ]);
      }

      const updated = await transaction.unsafe<CheckpointRow>(`
        UPDATE budget_ledger_checkpoints
        SET imported_event_count = $2, counter_update_count = $3
        WHERE checkpoint_key = $1
        RETURNING source_fingerprint, source_event_count, imported_event_count, counter_update_count
      `, [input.checkpointKey, importedEventCount, orderedIncrements.length]);
      await transaction.unsafe(`
        INSERT INTO budget_ledger_outbox (dedupe_key, event_type, safe_payload)
        VALUES ($1, 'legacy_checkpoint_applied', $2::jsonb)
        ON CONFLICT (dedupe_key) DO NOTHING
      `, [`checkpoint:${input.checkpointKey}`, safePayload("legacy_checkpoint_applied")]);
      if (!updated[0]) throw new Error("budget_checkpoint_write_failed");
      return checkpointReceipt("applied", updated[0]);
    });
  }

  async expireDueReservations(input: { now: string; limit: number }): Promise<BudgetExpiryReceipt> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new Error("budget_maintenance_invalid_limit");
    }
    const now = new Date(input.now);
    if (!Number.isFinite(now.getTime())) throw new Error("budget_maintenance_invalid_timestamp");
    const candidates = await this.sql.unsafe<{ request_id: string }>(`
      SELECT request_id
      FROM budget_reservations
      WHERE state = 'reserved' AND expires_at <= $1::timestamptz
      ORDER BY expires_at, request_id
      LIMIT $2
    `, [input.now, input.limit]);

    let expiredCount = 0;
    for (const candidate of candidates) {
      const expired = await this.sql.begin(async (transaction) => {
        await lockRequest(transaction, candidate.request_id);
        const rows = await transaction.unsafe<ExpiringReservationRow>(`
          SELECT request_id, scope_type, scope_id, day_key::text, month_key::text, estimated_microusd::text
          FROM budget_reservations
          WHERE request_id = $1 AND state = 'reserved' AND expires_at <= $2::timestamptz
          FOR UPDATE
        `, [candidate.request_id, input.now]);
        const reservation = rows[0];
        if (!reservation) return false;

        await transaction.unsafe(`
          INSERT INTO budget_counters (scope_type, scope_id, period_type, period_key)
          VALUES
            ($1, $2, 'day', $3::date),
            ($1, $2, 'month', $4::date)
          ON CONFLICT (scope_type, scope_id, period_type, period_key) DO NOTHING
        `, [reservation.scope_type, reservation.scope_id, reservation.day_key, reservation.month_key]);
        const locked = await transaction.unsafe<CounterRow>(`
          SELECT period_type
          FROM budget_counters
          WHERE scope_type = $1 AND scope_id = $2
            AND ((period_type = 'day' AND period_key = $3::date)
              OR (period_type = 'month' AND period_key = $4::date))
          ORDER BY CASE period_type WHEN 'day' THEN 0 ELSE 1 END
          FOR UPDATE
        `, [reservation.scope_type, reservation.scope_id, reservation.day_key, reservation.month_key]);
        if (locked.length !== 2) throw new Error("budget_counter_lock_failed");
        const estimatedMicrousd = toSafeInteger(reservation.estimated_microusd);
        const counters = await transaction.unsafe<CounterRow>(`
          UPDATE budget_counters
          SET reserved_microusd = reserved_microusd - $5,
              revision = revision + 1,
              updated_at = now()
          WHERE scope_type = $1 AND scope_id = $2
            AND reserved_microusd >= $5
            AND ((period_type = 'day' AND period_key = $3::date)
              OR (period_type = 'month' AND period_key = $4::date))
          RETURNING period_type
        `, [
          reservation.scope_type,
          reservation.scope_id,
          reservation.day_key,
          reservation.month_key,
          estimatedMicrousd,
        ]);
        if (counters.length !== 2) throw new Error("budget_counter_transition_failed");
        const updated = await transaction.unsafe<{ request_id: string }>(`
          UPDATE budget_reservations
          SET state = 'expired', updated_at = now()
          WHERE request_id = $1 AND state = 'reserved'
          RETURNING request_id
        `, [reservation.request_id]);
        if (!updated[0]) throw new Error("budget_reservation_transition_failed");
        await transaction.unsafe(`
          INSERT INTO budget_ledger_outbox (dedupe_key, event_type, safe_payload)
          VALUES ($1, 'reservation_expired', $2::jsonb)
          ON CONFLICT (dedupe_key) DO NOTHING
        `, [
          `reservation-expired:${reservation.request_id}`,
          safePayload("reservation_expired"),
        ]);
        return true;
      });
      if (expired) expiredCount += 1;
    }

    return { candidateCount: candidates.length, expiredCount };
  }

  async publishPendingOutbox(input: { limit: number }): Promise<BudgetProjectionReceipt> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new Error("budget_maintenance_invalid_limit");
    }
    return this.sql.begin(async (transaction) => {
      const pending = await transaction.unsafe<OutboxRow>(`
        SELECT id::text, event_type, safe_payload
        FROM budget_ledger_outbox
        WHERE published_at IS NULL
        ORDER BY created_at, id
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `, [input.limit]);
      for (const event of pending) {
        await transaction.unsafe(`
          INSERT INTO budget_ledger_read_model (event_id, event_type, safe_payload)
          VALUES ($1::uuid, $2, $3::jsonb)
          ON CONFLICT (event_id) DO NOTHING
        `, [event.id, event.event_type, event.safe_payload]);
        await transaction.unsafe(`
          UPDATE budget_ledger_outbox
          SET published_at = COALESCE(published_at, now()),
              attempts = attempts + 1,
              last_attempt_at = now()
          WHERE id = $1::uuid AND published_at IS NULL
        `, [event.id]);
      }
      return { pendingCount: pending.length, publishedCount: pending.length };
    });
  }
}
