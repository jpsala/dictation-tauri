/// <reference path="../bun-runtime.d.ts" />

export type QuotaReservationDecision = {
  allowed: boolean;
  reservationId: string | null;
  used: number;
  reserved: number;
  limit: number | null;
  idempotent: boolean;
};

type ReservationRow = {
  id: string;
  estimated_amount: string;
  state: string;
};

export class PostgresUsageQuotaRepository {
  constructor(private readonly sql: Bun.SQL) {}

  async reserve(input: {
    idempotencyKey: string;
    accountId?: string | null;
    deviceId: string;
    usageKind: string;
    amount: number;
    limit: number | null;
    windowStart: Date;
    expiresAt: Date;
    unlimited?: boolean;
  }): Promise<QuotaReservationDecision> {
    if (input.unlimited) {
      return { allowed: true, reservationId: null, used: 0, reserved: 0, limit: null, idempotent: false };
    }
    if (input.limit === null) throw new Error("quota_limit_required");
    const limit = input.limit;

    return await this.sql.begin(async (transaction) => {
      const existing = await transaction.unsafe<ReservationRow>(`
        SELECT id::text, estimated_amount::text, state
        FROM usage_reservations
        WHERE idempotency_key = $1
        FOR UPDATE
      `, [input.idempotencyKey]);
      if (existing[0]) {
        return {
          allowed: existing[0].state === "reserved" || existing[0].state === "consumed",
          reservationId: existing[0].id,
          used: 0,
          reserved: Number(existing[0].estimated_amount),
          limit,
          idempotent: true,
        };
      }

      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [input.deviceId, input.usageKind],
      );
      const totals = await transaction.unsafe<{ used: string; reserved: string }>(`
        SELECT
          COALESCE((
            SELECT SUM(safe_units) FROM usage_events
            WHERE device_id = $1::uuid AND usage_kind = $2 AND occurred_at >= $3::timestamptz
          ), 0)::text AS used,
          COALESCE((
            SELECT SUM(estimated_amount) FROM usage_reservations
            WHERE device_id = $1::uuid AND usage_kind = $2
              AND state = 'reserved' AND expires_at > now() AND created_at >= $3::timestamptz
          ), 0)::text AS reserved
      `, [input.deviceId, input.usageKind, input.windowStart.toISOString()]);
      const used = Number(totals[0].used);
      const reserved = Number(totals[0].reserved);
      if (used + reserved + input.amount > limit) {
        return {
          allowed: false,
          reservationId: null,
          used,
          reserved,
          limit,
          idempotent: false,
        };
      }

      const rows = await transaction.unsafe<{ id: string }>(`
        INSERT INTO usage_reservations (
          idempotency_key, account_id, device_id, usage_kind,
          estimated_amount, state, expires_at
        ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'reserved', $6::timestamptz)
        RETURNING id::text
      `, [
        input.idempotencyKey,
        input.accountId ?? null,
        input.deviceId,
        input.usageKind,
        input.amount,
        input.expiresAt.toISOString(),
      ]);
      return {
        allowed: true,
        reservationId: rows[0].id,
        used,
        reserved: reserved + input.amount,
        limit,
        idempotent: false,
      };
    });
  }

  async consume(input: {
    reservationId: string;
    safeUnits: number;
    providerId?: string | null;
    modelId?: string | null;
    outcome: string;
  }): Promise<void> {
    await this.sql.begin(async (transaction) => {
      const rows = await transaction.unsafe<{ account_id: string | null; device_id: string | null; usage_kind: string }>(`
        UPDATE usage_reservations
        SET state = 'consumed', updated_at = now()
        WHERE id = $1::uuid AND state = 'reserved'
        RETURNING account_id::text, device_id::text, usage_kind
      `, [input.reservationId]);
      if (!rows[0]) throw new Error("quota_reservation_not_active");
      await transaction.unsafe(`
        INSERT INTO usage_events (
          reservation_id, account_id, device_id, usage_kind, safe_units,
          provider_id, model_id, outcome
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
      `, [
        input.reservationId,
        rows[0].account_id,
        rows[0].device_id,
        rows[0].usage_kind,
        input.safeUnits,
        input.providerId ?? null,
        input.modelId ?? null,
        input.outcome,
      ]);
    });
  }

  async release(reservationId: string): Promise<boolean> {
    const rows = await this.sql.unsafe<{ id: string }>(`
      UPDATE usage_reservations
      SET state = 'released', updated_at = now()
      WHERE id = $1::uuid AND state = 'reserved'
      RETURNING id::text
    `, [reservationId]);
    return rows.length === 1;
  }
}
