/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, describe, expect, test } from "bun:test";

import {
  applyMigrations,
  loadMigrations,
  LOCAL_SCHEMA_VERSION,
  type MigrationDatabase,
  type MigrationTransaction,
} from "../src/postgres/migrations";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");
const sql = new Bun.SQL(databaseUrl);
const databases = await sql.unsafe<{ database_name: string }>("SELECT current_database() AS database_name");
if (databases[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");

const testSchemas = {
  clean: "fixvox_clean_migration_test",
  upgrade: "fixvox_upgrade_migration_test",
} as const;
for (const testSchema of Object.values(testSchemas)) {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
  await sql.unsafe(`CREATE SCHEMA ${testSchema}`);
}

afterAll(async () => {
  for (const testSchema of Object.values(testSchemas)) {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
  }
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

async function tableNames(database: MigrationDatabase, testSchema: string): Promise<string[]> {
  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
  `, [testSchema]);
  return tables.map((row) => row.table_name);
}

describe("PostgreSQL clean and incremental migrations", () => {
  test("builds empty→8 and remains idempotent", async () => {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(`SET LOCAL search_path TO ${testSchemas.clean}, public`);
      const database = new SingleTransactionDatabase(transaction);
      const migrations = await loadMigrations();
      expect(await applyMigrations(database, migrations)).toEqual({
        applied: [1, 2, 3, 4, 5, 6, 7, 8],
        currentVersion: LOCAL_SCHEMA_VERSION,
      });
      expect(await applyMigrations(database, migrations)).toEqual({ applied: [], currentVersion: LOCAL_SCHEMA_VERSION });
      const names = await tableNames(database, testSchemas.clean);
      expect(names).toContain("budget_counters");
      expect(names).toContain("budget_reservations");
      expect(names).toContain("budget_ledger_checkpoints");
      expect(names).toContain("budget_ledger_outbox");
      expect(names).toContain("budget_ledger_read_model");
      expect(names).toContain("usage_events");
      expect(names).toContain("engine_catalog_runs");
      expect(names).toContain("engine_catalog_audits");
      expect(names).toContain("personal_vocabulary_revisions");
      expect(names).toContain("personal_vocabulary_rules");
    });
  });

  test("upgrades 6→8 by applying 0007 before 0008", async () => {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(`SET LOCAL search_path TO ${testSchemas.upgrade}, public`);
      const database = new SingleTransactionDatabase(transaction);
      const migrations = await loadMigrations();
      expect(await applyMigrations(database, migrations.slice(0, 6))).toEqual({
        applied: [1, 2, 3, 4, 5, 6],
        currentVersion: 6,
      });
      expect(migrations.slice(6).map(({ version, name }) => ({ version, name }))).toEqual([
        { version: 7, name: "engine_catalog_lifecycle" },
        { version: 8, name: "personal_vocabulary" },
      ]);
      expect(await applyMigrations(database, migrations)).toEqual({
        applied: [7, 8],
        currentVersion: LOCAL_SCHEMA_VERSION,
      });
      expect(await applyMigrations(database, migrations)).toEqual({
        applied: [],
        currentVersion: LOCAL_SCHEMA_VERSION,
      });
      const names = await tableNames(database, testSchemas.upgrade);
      expect(names).toContain("engine_catalog_runs");
      expect(names).toContain("engine_catalog_audits");
      expect(names).toContain("personal_vocabulary_revisions");
      expect(names).toContain("personal_vocabulary_rules");
    });
  });
});
