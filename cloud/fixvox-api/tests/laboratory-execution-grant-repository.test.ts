import { describe, expect, test } from "bun:test";
import { PostgresLaboratoryExecutionGrantRepository, type LaboratoryGrantSql } from "../src/postgres/laboratory-execution-grant-repository.ts";
class FakeSql implements LaboratoryGrantSql {
  rows: Record<string, unknown>[] = [];

  async unsafe<T extends Record<string, unknown>>(query: string, parameters: unknown[] = []): Promise<T[]> {
    if (query.startsWith("INSERT INTO laboratory_execution_grants")) {
      this.rows.push({ state: "open" });
      return [{ id: "grant-id" }] as unknown as T[];
    }
    if (query.startsWith("INSERT INTO laboratory_executions")) return [{ id: "execution-id" }] as unknown as T[];
    if (query.startsWith("INSERT INTO audit_records")) return [] as T[];
    if (query.startsWith("UPDATE laboratory_execution_grants")) {
      if (this.rows[0]?.state !== "open") return [] as T[];
      this.rows[0].state = "consumed";
      return [{
        id: "grant-id",
        principal_key: parameters[1],
        device_id: parameters[2],
        kind: "gate-a",
        definition_hash: "a".repeat(64),
        estimate_hash: "b".repeat(64),
        max_requests: 12,
        max_cost_microusd: 5000,
        expires_at: new Date(Date.now() + 10_000),
        state: "consumed",
      }] as unknown as T[];
    }
    return [] as T[];
  }

  async begin<T>(operation: (transaction: LaboratoryGrantSql) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

describe("laboratory grants", () => {
  test("one concurrent consume winner", async () => {
    const repository = new PostgresLaboratoryExecutionGrantRepository(new FakeSql());
    const principalKey = `arp_${"a".repeat(64)}`;
    const issued = await repository.issue({
      principalKey,
      deviceId: "device-1",
      request: { schemaVersion: 1, kind: "gate-a", definition: {} as never },
      definitionHash: "a".repeat(64),
      estimateHash: "b".repeat(64),
      maxRequests: 12,
      maxCostMicrousd: 5000,
      expiresAt: new Date(Date.now() + 10_000),
    });
    const results = await Promise.all([
      repository.consume({ grantToken: issued.grantToken, principalKey, deviceId: "device-1", now: new Date() }),
      repository.consume({ grantToken: issued.grantToken, principalKey, deviceId: "device-1", now: new Date() }),
    ]);
    expect(results.filter(({ ok }) => ok)).toHaveLength(1);
  });
});

const executionId = "00000000-0000-4000-8000-000000000001";
const principalKey = `arp_${"a".repeat(64)}`;
const definitionHash = "b".repeat(64);
const estimateHash = "c".repeat(64);
const evidence = [
  { sampleId: "jp-quality-bilingual-technical-20260812", candidateId: "transcription-quality-v1-short-auto" as const, sha256: "d".repeat(64), byteLength: 10 },
  { sampleId: "jp-quality-punctuation-list-20260812", candidateId: "transcription-quality-v1-short-auto" as const, sha256: "e".repeat(64), byteLength: 20 },
  { sampleId: "jp-quality-model-comparison-20260812", candidateId: "transcription-quality-v1-short-auto" as const, sha256: "f".repeat(64), byteLength: 30 },
] as const;

class LifecycleSql implements LaboratoryGrantSql {
  row: Record<string, unknown> = {
    principal_key: principalKey,
    device_id: "device-1",
    kind: "gate-a",
    definition_hash: definitionHash,
    estimate_hash: estimateHash,
    max_requests: 12,
    max_cost_microusd: 5000,
    requests_used: 12,
    cost_microusd: 4992,
    status: "active",
    completed_request_count: null,
    canonical_raw_refs: [],
  };
  audits: Record<string, unknown>[] = [];

  async unsafe<T extends Record<string, unknown>>(query: string, parameters: unknown[] = []): Promise<T[]> {
    if (query.includes("SELECT definition_hash, max_requests")) {
      if (parameters[1] !== principalKey || parameters[2] !== "device-1") return [] as T[];
      return [this.row] as T[];
    }
    if (query.includes("SELECT principal_key, device_id, kind, definition_hash")) return [this.row] as T[];
    if (query.includes("SELECT principal_key, device_id, kind, status")) return [this.row] as T[];
    if (query.startsWith("UPDATE laboratory_executions") && query.includes("SET status = 'completed'")) {
      this.row.status = "completed";
      this.row.completed_request_count = parameters[1];
      this.row.canonical_raw_refs = parameters[2];
      this.row.completed_at = parameters[3];
      return [{ completed_at: parameters[3] }] as unknown as T[];
    }
    if (query.startsWith("UPDATE laboratory_executions") && query.includes("SET status = 'aborted'")) {
      this.row.status = "aborted";
      this.row.canonical_raw_refs = parameters[1];
      this.row.completed_at = parameters[2];
      return [{ completed_at: parameters[2] }] as unknown as T[];
    }
    if (query.startsWith("UPDATE laboratory_executions") && query.includes("requests_used")) {
      if (parameters[5] !== this.row.kind) return [] as T[];
      return [{ id: executionId }] as unknown as T[];
    }
    if (query.startsWith("INSERT INTO audit_records")) {
      this.audits.push(parameters[2] as Record<string, unknown>);
      return [] as T[];
    }
    return [] as T[];
  }

  async begin<T>(operation: (transaction: LaboratoryGrantSql) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

function completionRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    kind: "gate-a" as const,
    definitionHash,
    estimateHash,
    completedRequestCount: 12 as const,
    rawEvidence: evidence,
    ...overrides,
  };
}

describe("laboratory execution terminal lifecycle", () => {
  test("completes Gate A deterministically, replays without an audit, and conflicts on different replay", async () => {
    const sql = new LifecycleSql();
    const repository = new PostgresLaboratoryExecutionGrantRepository(sql);
    const input = { executionId, principalKey, deviceId: "device-1", request: completionRequest() };
    const first = await repository.complete(input);
    expect(first.ok).toBe(true);
    if (first.data.completedRequestCount !== 12) throw new Error("expected_gate_a_completion");
    expect(first.data.canonicalRawRefs).toHaveLength(3);
    expect(first.data.canonicalRawRefs.every(({ rawRef }) => /^lraw_[a-f0-9]{64}$/.test(rawRef))).toBe(true);
    expect(sql.audits).toHaveLength(1);
    expect(Object.keys(sql.audits[0]).sort()).toEqual(["counts", "hashes", "kind", "refCount", "refSetHash", "reservedCost", "schemaVersion"]);
    const replay = await repository.complete(input);
    expect(replay.ok && replay.data.idempotentReplay).toBe(true);
    expect(sql.audits).toHaveLength(1);
    await expect(repository.complete({ ...input, request: completionRequest({ estimateHash: "9".repeat(64) }) })).rejects.toThrow("laboratory_execution_conflict");
  });

  test("keeps terminal abort idempotent and rejects a different replay", async () => {
    const sql = new LifecycleSql();
    const repository = new PostgresLaboratoryExecutionGrantRepository(sql);
    const input = { executionId, principalKey, deviceId: "device-1", request: { schemaVersion: 1 as const, reason: "runner-failed" as const } };
    const first = await repository.abort(input);
    expect(first.data.idempotentReplay).toBe(false);
    expect((await repository.abort(input)).data.idempotentReplay).toBe(true);
    await expect(repository.abort({ ...input, request: { schemaVersion: 1, reason: "cancelled" } })).rejects.toThrow("laboratory_execution_conflict");
  });

  test("requires identity for completion and enforces expected reserve kind", async () => {
    const sql = new LifecycleSql();
    const repository = new PostgresLaboratoryExecutionGrantRepository(sql);
    await expect(repository.complete({ executionId, principalKey, deviceId: "other-device", request: completionRequest() })).rejects.toThrow("laboratory_execution_grant_mismatch");
    expect(await repository.reserve({ executionId, deviceId: "device-1", definitionHash, expectedKind: "gate-b", requests: 1, costMicrousd: 1 })).toBe(false);
    expect(await repository.reserve({ executionId, deviceId: "device-1", definitionHash, expectedKind: "gate-a", requests: 1, costMicrousd: 1 })).toBe(true);
  });

  test("completes Gate B only at its exact request count", async () => {
    const sql = new LifecycleSql();
    sql.row.kind = "gate-b";
    sql.row.max_requests = 6;
    sql.row.requests_used = 6;
    const repository = new PostgresLaboratoryExecutionGrantRepository(sql);
    const result = await repository.complete({
      executionId,
      principalKey,
      deviceId: "device-1",
      request: { schemaVersion: 1, kind: "gate-b", definitionHash, estimateHash, completedRequestCount: 6 },
    });
    expect(result.ok && result.data.completedRequestCount).toBe(6);
  });
  test("exposes Gate B source only to the same principal and device", async () => {
    const sql = new LifecycleSql();
    sql.row.status = "completed";
    sql.row.canonical_raw_refs = [
      { sampleId: evidence[0].sampleId, candidateId: "transcription-quality-v1-short-auto", rawRef: `lraw_${"1".repeat(64)}` },
      { sampleId: evidence[1].sampleId, candidateId: "transcription-quality-v1-short-auto", rawRef: `lraw_${"2".repeat(64)}` },
      { sampleId: evidence[2].sampleId, candidateId: "transcription-quality-v1-short-auto", rawRef: `lraw_${"3".repeat(64)}` },
    ];
    const repository = new PostgresLaboratoryExecutionGrantRepository(sql);
    const source = await repository.gateBSource({ runId: executionId, principalKey, deviceId: "device-1" });
    expect(source?.definitionHash).toBe(definitionHash);
    expect(source?.rawRefs).toHaveLength(3);
    expect(source?.rawRefs[0]).toEqual({
      sampleId: evidence[0].sampleId,
      rawRef: `lraw_${"1".repeat(64)}`,
    });
    expect(await repository.gateBSource({ runId: executionId, principalKey, deviceId: "other-device" })).toBe(null);
  });
});
