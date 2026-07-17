/// <reference path="../bun-runtime.d.ts" />

import { loadMigrations } from "./migrations";

const migrations = await loadMigrations();
const lines = migrations.map(
  (migration) => `${String(migration.version).padStart(4, "0")} ${migration.name} sha256:${migration.checksum}`,
);
await Bun.write(Bun.stdout, `${lines.join("\n")}\n`);
