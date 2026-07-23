/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, describe, expect, test } from "bun:test";

import {
  applyMigrations,
  loadMigrations,
  type MigrationDatabase,
  type MigrationTransaction,
} from "../src/postgres/migrations";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");
const sql = new Bun.SQL(databaseUrl);
const databases = await sql.unsafe<{ database_name: string }>("SELECT current_database() AS database_name");
if (databases[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");

const testSchema = "fixvox_clean_migration_test";
await sql.unsafe(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
await sql.unsafe(`CREATE SCHEMA ${testSchema}`);

afterAll(async () => {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
  await sql.close();
});

class SingleTransactionDatabase implements MigrationDatabase {
  constructor(private readonly transactionSql: Bun.SQL) {}

  async execute(query: string, parameters: readonly unknown[] = []): Promise<void> {
    await this.transactionSql.unsafe(query, [...parameters]);
  }

  async query<T>(query: string, parameters: readonly unknown[] = []): Promise<T[]> {
    return this.transactionSql.unsafe(query, [...parameters]) as Promise<T[]>;
  }

  async transaction<T>(operation: (transaction: MigrationTransaction) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

describe("PostgreSQL clean-schema migrations", () => {
  test("builds version 5 from empty, upgrades only version 6 and remains idempotent", async () => {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(`SET LOCAL search_path TO ${testSchema}, public`);
      const database = new SingleTransactionDatabase(transaction);
      const migrations = await loadMigrations();
      expect(await applyMigrations(database, migrations.slice(0, 5))).toEqual({
        applied: [1, 2, 3, 4, 5],
        currentVersion: 5,
      });
      expect(await applyMigrations(database, migrations)).toEqual({ applied: [6], currentVersion: 6 });
      expect(await applyMigrations(database, migrations)).toEqual({ applied: [], currentVersion: 6 });
      const tables = await database.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
      `, [testSchema]);
      const names = tables.map((row) => row.table_name);
      expect(names).toContain("budget_counters");
      expect(names).toContain("budget_reservations");
      expect(names).toContain("budget_ledger_checkpoints");
      expect(names).toContain("budget_ledger_outbox");
      expect(names).toContain("budget_ledger_read_model");
      expect(names).toContain("usage_events");
    });
  });
});
