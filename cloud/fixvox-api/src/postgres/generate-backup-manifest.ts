/// <reference path="../bun-runtime.d.ts" />

import { createBackupManifest } from "./backup-manifest";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");

const sql = new Bun.SQL(databaseUrl);
try {
  const manifest = await createBackupManifest(sql);
  await Bun.write(Bun.stdout, `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await sql.close();
}
