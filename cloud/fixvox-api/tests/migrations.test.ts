/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";

import {
  applyMigrations,
  loadMigrations,
  migrationChecksum,
  type AppliedMigration,
  type MigrationDatabase,
  type MigrationTransaction,
} from "../src/postgres/migrations";

class MemoryMigrationDatabase implements MigrationDatabase {
  readonly applied: AppliedMigration[] = [];
  readonly executed: string[] = [];
  transactions = 0;

  async execute(sql: string): Promise<void> {
    this.executed.push(sql);
  }

  async query<T>(): Promise<T[]> {
    return [...this.applied].sort((left, right) => left.version - right.version) as T[];
  }

  async transaction<T>(operation: (transaction: MigrationTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const pending: AppliedMigration[] = [];
    const transaction: MigrationTransaction = {
      execute: async (sql, parameters = []) => {
        this.executed.push(sql);
        if (sql.startsWith("INSERT INTO schema_migrations")) {
          pending.push({
            version: parameters[0] as number,
            name: parameters[1] as string,
            checksum: parameters[2] as string,
          });
        }
      },
    };
    const result = await operation(transaction);
    this.applied.push(...pending);
    return result;
  }
}

describe("PostgreSQL migration manifest", () => {
  test("loads a contiguous initial migration with a deterministic checksum", async () => {
    const migrations = await loadMigrations();
    expect(migrations).toHaveLength(4);
    expect(migrations[0].version).toBe(1);
    expect(migrations[0].name).toBe("initial_control_plane");
    expect(migrations[0].checksum).toBe(migrationChecksum(migrations[0].sql));
    expect(migrations[0].sql).toContain("CREATE TABLE control_plane_authority");
    expect(migrations[0].sql).not.toMatch(/\b(audio|transcript)_(body|content|payload)\b/i);
    expect(migrations[2].version).toBe(3);
    expect(migrations[2].name).toBe("auth_desktop_handoff");
    expect(migrations[2].sql).toContain("handoff_hash");
    expect(migrations[3].version).toBe(4);
    expect(migrations[3].name).toBe("admin_read_projections");
    expect(migrations[3].sql).toContain("prewarm_daily_counters");
  });

  test("applies pending migrations once and records their checksums", async () => {
    const database = new MemoryMigrationDatabase();
    const migrations = await loadMigrations();

    expect(await applyMigrations(database, migrations)).toEqual({ applied: [1, 2, 3, 4], currentVersion: 4 });
    expect(database.applied).toEqual([
      { version: 1, name: migrations[0].name, checksum: migrations[0].checksum },
      { version: 2, name: migrations[1].name, checksum: migrations[1].checksum },
      { version: 3, name: migrations[2].name, checksum: migrations[2].checksum },
      { version: 4, name: migrations[3].name, checksum: migrations[3].checksum },
    ]);
    expect(database.transactions).toBe(4);

    expect(await applyMigrations(database, migrations)).toEqual({ applied: [], currentVersion: 4 });
    expect(database.transactions).toBe(4);
  });

  test("fails closed when an applied checksum differs", async () => {
    const database = new MemoryMigrationDatabase();
    const migrations = await loadMigrations();
    database.applied.push({ version: 1, name: migrations[0].name, checksum: "changed" });

    await expect(applyMigrations(database, migrations)).rejects.toThrow("migration_checksum_mismatch:1");
    expect(database.transactions).toBe(0);
  });

  test("fails closed when the database contains an unknown migration", async () => {
    const database = new MemoryMigrationDatabase();
    const migrations = await loadMigrations();
    database.applied.push({ version: 5, name: "future", checksum: "future" });

    await expect(applyMigrations(database, migrations)).rejects.toThrow("database_schema_ahead_or_unknown:5");
    expect(database.transactions).toBe(0);
  });
});
