/// <reference path="../bun-runtime.d.ts" />

export type Migration = {
  version: number;
  name: string;
  checksum: string;
  sql: string;
};

export type AppliedMigration = {
  version: number;
  name: string;
  checksum: string;
};

export interface MigrationTransaction {
  execute(sql: string, parameters?: readonly unknown[]): Promise<void>;
}

export interface MigrationDatabase extends MigrationTransaction {
  query<T>(sql: string, parameters?: readonly unknown[]): Promise<T[]>;
  transaction<T>(operation: (transaction: MigrationTransaction) => Promise<T>): Promise<T>;
}

const MIGRATION_FILE = /^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/;
const MIGRATION_FILES = [
  "0001_initial_control_plane.sql",
  "0002_immutable_history_guards.sql",
  "0003_auth_desktop_handoff.sql",
  "0004_admin_read_projections.sql",
] as const;

export function migrationChecksum(sql: string): string {
  return new Bun.CryptoHasher("sha256").update(sql).digest("hex");
}

export async function loadMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];
  for (const filename of MIGRATION_FILES) {
    const match = MIGRATION_FILE.exec(filename);
    if (!match) {
      throw new Error(`invalid_migration_filename:${filename}`);
    }
    const version = Number.parseInt(match[1], 10);
    if (migrations.some((migration) => migration.version === version)) {
      throw new Error(`duplicate_migration_version:${version}`);
    }
    const sql = await Bun.file(new URL(`../../migrations/${filename}`, import.meta.url)).text();
    if (!sql.trim()) {
      throw new Error(`empty_migration:${filename}`);
    }
    migrations.push({ version, name: match[2], checksum: migrationChecksum(sql), sql });
  }

  if (migrations.length === 0) {
    throw new Error("no_migrations_found");
  }
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(`migration_sequence_gap:expected_${expected}:found_${migration.version}`);
    }
  });
  return migrations;
}

export async function applyMigrations(
  database: MigrationDatabase,
  migrations: readonly Migration[],
): Promise<{ applied: number[]; currentVersion: number }> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const appliedRows = await database.query<AppliedMigration>(
    "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
  );
  const expectedByVersion = new Map(migrations.map((migration) => [migration.version, migration]));

  for (const applied of appliedRows) {
    const expected = expectedByVersion.get(applied.version);
    if (!expected) {
      throw new Error(`database_schema_ahead_or_unknown:${applied.version}`);
    }
    if (expected.name !== applied.name || expected.checksum !== applied.checksum) {
      throw new Error(`migration_checksum_mismatch:${applied.version}`);
    }
  }

  const appliedVersions = new Set(appliedRows.map((migration) => migration.version));
  const newlyApplied: number[] = [];
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    await database.transaction(async (transaction) => {
      await transaction.execute(migration.sql);
      await transaction.execute(
        "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
        [migration.version, migration.name, migration.checksum],
      );
    });
    newlyApplied.push(migration.version);
  }

  return {
    applied: newlyApplied,
    currentVersion: migrations.at(-1)?.version ?? 0,
  };
}
