/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, describe, expect, test } from "bun:test";

import { BunSqlMigrationDatabase } from "../src/postgres/bun-sql-migration-database";
import { applyMigrations, loadMigrations, LOCAL_SCHEMA_VERSION } from "../src/postgres/migrations";
import { PostgresLaboratoryExecutionGrantRepository } from "../src/postgres/laboratory-execution-grant-repository";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");

const database = new BunSqlMigrationDatabase(databaseUrl);
const sql = new Bun.SQL(databaseUrl);
afterAll(async () => {
  await sql.close();
  await database.close();
});

describe("PostgreSQL migration integration", () => {
  test("is idempotent against the isolated local database", async () => {
    const result = await applyMigrations(database, await loadMigrations());
    expect(result).toEqual({ applied: [], currentVersion: LOCAL_SCHEMA_VERSION });
  });

  test("creates the required authority and control-plane tables", async () => {
    const rows = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const names = rows.map((row) => row.table_name);
    for (const required of [
      "accounts",
      "audit_records",
      "control_plane_authority",
      "devices",
      "profile_versions",
      "profiles",
      "schema_migrations",
      "usage_events",
      "usage_reservations",
      "budget_counters",
      "budget_reservations",
      "budget_ledger_checkpoints",
      "budget_ledger_outbox",
      "budget_ledger_read_model",
      "oauth_states",
      "desktop_login_sessions",
      "prewarm_daily_counters",
      "engine_catalog_runs",
      "engine_catalog_audits",
      "personal_vocabulary_revisions",
      "personal_vocabulary_rules",
      "laboratory_execution_grants",
      "laboratory_executions",
    ]) {
      expect(names).toContain(required);
    }
  });

  test("starts fail-safe with Cloudflare still authoritative", async () => {
    const rows = await database.query<{ mode: string; revision: string }>(
      "SELECT mode, revision::text AS revision FROM control_plane_authority WHERE singleton = true",
    );
    expect(rows).toEqual([{ mode: "cloudflare-authority", revision: "0" }]);
  });

  test("does not define durable raw audio or transcript payload columns", async () => {
    const rows = await database.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name ~* '(audio|transcript).*(body|content|payload)|(body|content|payload).*(audio|transcript)'
    `);
    expect(rows).toEqual([]);
  });

  test("consumes one grant once and reserves request budget atomically", async () => {
    const repository = new PostgresLaboratoryExecutionGrantRepository(sql);
    const principalKey = `arp_${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
    const deviceId = `laboratory-test-${crypto.randomUUID()}`;
    try {
      const issued = await repository.issue({
        principalKey,
        deviceId,
        request: { schemaVersion: 1, kind: "gate-a", definition: {} as never },
        definitionHash: "a".repeat(64),
        estimateHash: "b".repeat(64),
        maxRequests: 12,
        maxCostMicrousd: 5000,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const consumed = await Promise.all([
        repository.consume({ grantToken: issued.grantToken, principalKey, deviceId, now: new Date() }),
        repository.consume({ grantToken: issued.grantToken, principalKey, deviceId, now: new Date() }),
      ]);
      expect(consumed.filter(({ ok }) => ok)).toHaveLength(1);
      const execution = consumed.find(({ ok }) => ok);
      if (!execution?.ok) throw new Error("execution_missing");
      const reservations = await Promise.all(Array.from({ length: 13 }, () => repository.reserve({
        executionId: execution.execution.executionId,
        deviceId,
        definitionHash: execution.execution.definitionHash,
        expectedKind: "gate-a",
        requests: 1,
        costMicrousd: 100,
      })));
      const completion = {
        schemaVersion: 1 as const,
        kind: "gate-a" as const,
        definitionHash: "a".repeat(64),
        estimateHash: "b".repeat(64),
        completedRequestCount: 12 as const,
        rawEvidence: [
          { sampleId: "jp-quality-bilingual-technical-20260812", candidateId: "transcription-quality-v1-short-auto" as const, sha256: "c".repeat(64), byteLength: 10 },
          { sampleId: "jp-quality-punctuation-list-20260812", candidateId: "transcription-quality-v1-short-auto" as const, sha256: "d".repeat(64), byteLength: 20 },
          { sampleId: "jp-quality-model-comparison-20260812", candidateId: "transcription-quality-v1-short-auto" as const, sha256: "e".repeat(64), byteLength: 30 },
        ] as const,
      };
      const completed = await repository.complete({ executionId: execution.execution.executionId, principalKey, deviceId, request: completion });
      expect(completed.ok).toBe(true);
      const replay = await repository.complete({ executionId: execution.execution.executionId, principalKey, deviceId, request: completion });
      expect(replay.ok && replay.data.idempotentReplay).toBe(true);
      const completionAudits = await sql.unsafe<{ action: string; metadata: Record<string, unknown>; metadata_type: string }>(
        `SELECT action, safe_metadata AS metadata, jsonb_typeof(safe_metadata) AS metadata_type
         FROM audit_records WHERE actor_ref_hash = $1 AND action = 'laboratory.execution.complete'`,
        [principalKey],
      );
      expect(completionAudits).toHaveLength(1);
      expect(Object.keys(completionAudits[0].metadata).sort()).toEqual(["counts", "hashes", "kind", "refCount", "refSetHash", "reservedCost", "schemaVersion"]);
      expect(completionAudits[0].metadata.hashes).toEqual({
        definitionHash: "a".repeat(64),
        estimateHash: "b".repeat(64),
      });
      expect(reservations.filter(Boolean)).toHaveLength(12);
      const audits = await sql.unsafe<{
        action: string;
        metadata: Record<string, unknown>;
        metadata_type: string;
      }>(
        `SELECT action, safe_metadata AS metadata, jsonb_typeof(safe_metadata) AS metadata_type
         FROM audit_records
         WHERE actor_ref_hash = $1 AND action IN ('laboratory.grant.issue', 'laboratory.grant.consume')
         ORDER BY sequence_id`,
        [principalKey],
      );
      expect(audits).toEqual([
        {
          action: "laboratory.grant.issue",
          metadata: {
            schemaVersion: 1,
            kind: "gate-a",
            definitionHash: "a".repeat(64),
            estimateHash: "b".repeat(64),
            maxRequests: 12,
            maxCostMicrousd: 5000,
          },
          metadata_type: "object",
        },
        {
          action: "laboratory.grant.consume",
          metadata: {
            schemaVersion: 1,
            kind: "gate-a",
            definitionHash: "a".repeat(64),
            estimateHash: "b".repeat(64),
          },
          metadata_type: "object",
        },
      ]);
      const gateBGrant = await repository.issue({
        principalKey,
        deviceId,
        request: { schemaVersion: 1, kind: "gate-b", sourceGateARunId: execution.execution.executionId },
        definitionHash: "f".repeat(64),
        estimateHash: "e".repeat(64),
        maxRequests: 6,
        maxCostMicrousd: 5000,
        expiresAt: new Date(Date.now() + 60_000),
        sourceRunId: execution.execution.executionId,
      });
      const gateBExecution = await repository.consume({ grantToken: gateBGrant.grantToken, principalKey, deviceId, now: new Date() });
      if (!gateBExecution.ok) throw new Error("gate_b_execution_missing");
      expect(await repository.reserve({
        executionId: gateBExecution.execution.executionId,
        deviceId,
        definitionHash: "f".repeat(64),
        expectedKind: "gate-a",
        requests: 1,
        costMicrousd: 1,
      })).toBe(false);
    } finally {
      await sql.unsafe("DELETE FROM laboratory_executions WHERE principal_key = $1", [principalKey]);
      await sql.unsafe("DELETE FROM laboratory_execution_grants WHERE principal_key = $1", [principalKey]);
    }
  });
});
