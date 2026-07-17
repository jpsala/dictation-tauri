/// <reference path="../bun-runtime.d.ts" />

export type BackupManifest = {
  schemaVersion: number;
  authority: { mode: string; revision: number };
  counts: Record<string, number>;
  projectionHashes: Record<string, string>;
  createdAt: string;
  toolVersion: string;
};

const COUNTED_TABLES = [
  "accounts",
  "devices",
  "profiles",
  "profile_versions",
  "policy_assignments",
  "usage_reservations",
  "usage_events",
  "audit_records",
] as const;

export async function createBackupManifest(sql: Bun.SQL, now = new Date()): Promise<BackupManifest> {
  const versions = await sql.unsafe<{ version: number }>(
    "SELECT COALESCE(MAX(version), 0)::integer AS version FROM schema_migrations",
  );
  const authorities = await sql.unsafe<{ mode: string; revision: string }>(
    "SELECT mode, revision::text FROM control_plane_authority WHERE singleton = true",
  );
  if (!authorities[0]) throw new Error("control_plane_authority_missing");

  const counts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    const rows = await sql.unsafe<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    counts[table] = Number(rows[0].count);
  }

  const accountHashes = await sql.unsafe<{ hash: string }>(`
    SELECT encode(digest(COALESCE(string_agg(
      provider || ':' || provider_subject_hash || ':' || status,
      '|' ORDER BY provider, provider_subject_hash
    ), ''), 'sha256'), 'hex') AS hash
    FROM accounts
  `);
  const profileHashes = await sql.unsafe<{ hash: string }>(`
    SELECT encode(digest(COALESCE(string_agg(
      p.profile_id || ':' || COALESCE(p.active_published_version::text, '-') || ':' || p.revision::text,
      '|' ORDER BY p.profile_id
    ), ''), 'sha256'), 'hex') AS hash
    FROM profiles p
  `);

  return {
    schemaVersion: versions[0]?.version ?? 0,
    authority: { mode: authorities[0].mode, revision: Number(authorities[0].revision) },
    counts,
    projectionHashes: {
      accounts: accountHashes[0].hash,
      profiles: profileHashes[0].hash,
    },
    createdAt: now.toISOString(),
    toolVersion: "fixvox-backup-manifest-v1",
  };
}
