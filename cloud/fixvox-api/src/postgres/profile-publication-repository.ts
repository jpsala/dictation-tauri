/// <reference path="../bun-runtime.d.ts" />

export class StaleProfileRevisionError extends Error {
  constructor() {
    super("stale_profile_revision");
  }
}

export type PublishedProfile = {
  profileId: string;
  version: number;
  revision: number;
};

type LockedProfile = {
  id: string;
  profile_id: string;
  revision: string;
  current_draft_version: number | null;
  active_published_version: number | null;
};

export class PostgresProfilePublicationRepository {
  constructor(private readonly databaseUrl: string) {}

  async publish(input: {
    profileId: string;
    expectedRevision: number;
    actorRefHash: string;
  }): Promise<PublishedProfile> {
    const sql = new Bun.SQL(this.databaseUrl);
    try {
      return await sql.begin(async (transaction) => {
      const profiles = await transaction.unsafe<LockedProfile>(`
        SELECT id::text, profile_id, revision::text, current_draft_version, active_published_version
        FROM profiles
        WHERE profile_id = $1
        FOR UPDATE
      `, [input.profileId]);
      const profile = profiles[0];
      if (!profile) throw new Error("profile_not_found");
      if (Number(profile.revision) !== input.expectedRevision) {
        throw new StaleProfileRevisionError();
      }
      if (profile.current_draft_version === null) throw new Error("profile_draft_not_found");

      const drafts = await transaction.unsafe<{ id: string; version: number }>(`
        SELECT id::text, version
        FROM profile_versions
        WHERE profile_id = $1::uuid AND version = $2 AND status = 'draft'
        FOR UPDATE
      `, [profile.id, profile.current_draft_version]);
      const draft = drafts[0];
      if (!draft) throw new Error("profile_draft_not_found");

      if (profile.active_published_version !== null) {
        await transaction.unsafe(`
          UPDATE profile_versions
          SET status = 'historical'
          WHERE profile_id = $1::uuid AND version = $2 AND status = 'published'
        `, [profile.id, profile.active_published_version]);
      }
      await transaction.unsafe(`
        UPDATE profile_versions
        SET status = 'published', published_by = $2, published_at = now()
        WHERE id = $1::uuid
      `, [draft.id, input.actorRefHash]);

      const updated = await transaction.unsafe<{ revision: string }>(`
        UPDATE profiles
        SET active_published_version = $2,
            current_draft_version = NULL,
            revision = revision + 1,
            updated_at = now()
        WHERE id = $1::uuid
        RETURNING revision::text
      `, [profile.id, draft.version]);
      const revision = Number(updated[0].revision);
      await transaction.unsafe(`
        INSERT INTO audit_records (
          actor_ref_hash, action, target_type, target_ref_hash,
          source_version, target_version, resulting_version, result, safe_metadata
        ) VALUES ($1, 'profile.publish', 'profile', $2, $3, $4, $4, 'success', $5::jsonb)
      `, [
        input.actorRefHash,
        input.profileId,
        profile.active_published_version,
        draft.version,
        JSON.stringify({ authorityRevision: revision }),
      ]);
        return { profileId: profile.profile_id, version: draft.version, revision };
      });
    } finally {
      await sql.close();
    }
  }
}
