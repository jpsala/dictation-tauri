/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, describe, expect, test } from "bun:test";

import { BunSqlMigrationDatabase } from "../src/postgres/bun-sql-migration-database";
import { applyMigrations, loadMigrations } from "../src/postgres/migrations";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");

const database = new BunSqlMigrationDatabase(databaseUrl);
afterAll(async () => database.close());

describe("PostgreSQL migration integration", () => {
  test("is idempotent against the isolated local database", async () => {
    const result = await applyMigrations(database, await loadMigrations());
    expect(result).toEqual({ applied: [], currentVersion: 4 });
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
      "oauth_states",
      "desktop_login_sessions",
      "prewarm_daily_counters",
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
});
