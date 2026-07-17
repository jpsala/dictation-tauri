/// <reference path="../bun-runtime.d.ts" />

import { BunSqlMigrationDatabase } from "./bun-sql-migration-database";
import { applyMigrations, loadMigrations } from "./migrations";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("missing_FIXVOX_DATABASE_URL");
}

const database = new BunSqlMigrationDatabase(databaseUrl);
try {
  const result = await applyMigrations(database, await loadMigrations());
  await Bun.write(
    Bun.stdout,
    `schema_version=${result.currentVersion} applied=${result.applied.join(",") || "none"}\n`,
  );
} finally {
  await database.close();
}
