import { describe, expect, test } from "bun:test";
import { PostgresLaboratoryExecutionGrantRepository, type LaboratoryGrantSql } from "../src/postgres/laboratory-execution-grant-repository.ts";
class FakeSql implements LaboratoryGrantSql {
  rows: Record<string, unknown>[] = [];

  async unsafe<T extends Record<string, unknown>>(query: string, parameters: unknown[] = []): Promise<T[]> {
    if (query.startsWith("INSERT INTO laboratory_execution_grants")) {
      this.rows.push({ state: "open" });
      return [{ id: "grant-id" }] as T[];
    }
    if (query.startsWith("INSERT INTO laboratory_executions")) return [{ id: "execution-id" }] as T[];
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
      }] as T[];
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
