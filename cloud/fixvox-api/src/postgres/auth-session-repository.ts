/// <reference path="../bun-runtime.d.ts" />

import { DeviceBindingConflictError } from "./control-plane-repository.ts";

export const RECENT_GOOGLE_AUTH_MS = 10 * 60 * 1000;

type OAuthRow = {
  provider: string;
  protected_metadata: string | null;
  result_status: "pending" | "completed" | "failed" | "expired";
  result_subject_hash: string | null;
  result_error: string | null;
  google_verified_at: string | null;
  expires_at: string;
};

export type OAuthResult = {
  status: OAuthRow["result_status"];
  subjectHash: string | null;
  error: string | null;
  googleVerifiedAt: Date | null;
};

/** Stores only hashes of browser-visible OAuth/login handles; tokens are never persisted. */
export class PostgresAuthSessionRepository {
  constructor(private readonly sql: Bun.SQL) {}

  async createDesktopHandoff(input: { sessionHash: string; handoffHash: string; expiresAt: Date }): Promise<void> {
    await this.sql.unsafe(`
      INSERT INTO desktop_login_sessions (session_hash, handoff_hash, status, expires_at)
      VALUES ($1, $2, 'pending', $3::timestamptz)
    `, [input.sessionHash, input.handoffHash, input.expiresAt.toISOString()]);
  }

  async readDesktopHandoff(handoffHash: string): Promise<{ sessionHash: string; expiresAt: Date } | null> {
    const rows = await this.sql.unsafe<{ session_hash: string; expires_at: string }>(`
      SELECT session_hash, expires_at::text FROM desktop_login_sessions
      WHERE handoff_hash = $1 AND expires_at > now() AND claimed_at IS NULL
    `, [handoffHash]);
    return rows[0] ? { sessionHash: rows[0].session_hash, expiresAt: new Date(rows[0].expires_at) } : null;
  }

  async readDesktopStatus(sessionHash: string): Promise<{ status: string; expiresAt: Date; completedAt: Date | null } | null> {
    const rows = await this.sql.unsafe<{ status: string; expires_at: string; completed_at: string | null }>(`
      SELECT status, expires_at::text, completed_at::text FROM desktop_login_sessions WHERE session_hash = $1
    `, [sessionHash]);
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now() && row.status === "pending") {
      await this.sql.unsafe("UPDATE desktop_login_sessions SET status = 'expired', updated_at = now() WHERE session_hash = $1 AND status = 'pending'", [sessionHash]);
      return { status: "expired", expiresAt: new Date(row.expires_at), completedAt: null };
    }
    return { status: row.status, expiresAt: new Date(row.expires_at), completedAt: row.completed_at ? new Date(row.completed_at) : null };
  }

  async createOAuthState(input: { stateHash: string; provider: string; protectedMetadata: string; expiresAt: Date }): Promise<void> {
    await this.sql.unsafe(`
      INSERT INTO oauth_states (state_hash, provider, protected_metadata, expires_at)
      VALUES ($1, $2, $3, $4::timestamptz)
      ON CONFLICT (state_hash) DO NOTHING
    `, [input.stateHash, input.provider, input.protectedMetadata, input.expiresAt.toISOString()]);
  }

  async attachDesktopOAuthState(sessionHash: string, stateHash: string): Promise<boolean> {
    const rows = await this.sql.unsafe(`
      UPDATE desktop_login_sessions SET oauth_state_hash = $2, updated_at = now()
      WHERE session_hash = $1 AND status = 'pending' AND expires_at > now()
      RETURNING session_hash
    `, [sessionHash, stateHash]);
    return Boolean(rows[0]);
  }

  async readOAuthState(stateHash: string): Promise<{ provider: string; protectedMetadata: string | null } | null> {
    const rows = await this.sql.unsafe<{ provider: string; protected_metadata: string | null }>(`
      SELECT provider, protected_metadata FROM oauth_states
      WHERE state_hash = $1 AND expires_at > now() AND result_status = 'pending'
    `, [stateHash]);
    const row = rows[0];
    return row ? { provider: row.provider, protectedMetadata: row.protected_metadata } : null;
  }

  async readOAuthResult(stateHash: string): Promise<OAuthResult | null> {
    const rows = await this.sql.unsafe<OAuthRow>(`
      SELECT provider, protected_metadata, result_status, result_subject_hash, result_error,
             google_verified_at::text, expires_at::text
      FROM oauth_states WHERE state_hash = $1
    `, [stateHash]);
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now() && row.result_status === "pending") return { status: "expired", subjectHash: null, error: null, googleVerifiedAt: null };
    return { status: row.result_status, subjectHash: row.result_subject_hash, error: row.result_error, googleVerifiedAt: row.google_verified_at ? new Date(row.google_verified_at) : null };
  }

  /** Callback-only atomic one-time transition. A competing/replayed callback receives null. */
  async consumeOAuthState(stateHash: string): Promise<{ provider: string; protectedMetadata: string | null } | null> {
    const rows = await this.sql.unsafe<{ provider: string; protected_metadata: string | null }>(`
      UPDATE oauth_states SET consumed_at = now()
      WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now() AND result_status = 'pending'
      RETURNING provider, protected_metadata
    `, [stateHash]);
    const row = rows[0];
    return row ? { provider: row.provider, protectedMetadata: row.protected_metadata } : null;
  }

  async completeOAuthState(stateHash: string, subjectHash: string, verifiedAt: Date): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const completed = await tx.unsafe(`
        UPDATE oauth_states SET result_status = 'completed', result_subject_hash = $2,
          google_verified_at = $3::timestamptz, completed_at = now()
        WHERE state_hash = $1 AND consumed_at IS NOT NULL AND result_status = 'pending'
        RETURNING state_hash
      `, [stateHash, subjectHash, verifiedAt.toISOString()]);
      if (!completed[0]) return false;
      await tx.unsafe(`
        UPDATE desktop_login_sessions SET status = 'completed', completed_at = now(), google_verified_at = $2::timestamptz, updated_at = now()
        WHERE oauth_state_hash = $1 AND status = 'pending'
      `, [stateHash, verifiedAt.toISOString()]);
      return true;
    });
  }

  async failOAuthState(stateHash: string, error: string): Promise<boolean> {
    const rows = await this.sql.unsafe(`
      UPDATE oauth_states SET result_status = 'failed', result_error = $2, failed_at = now()
      WHERE state_hash = $1 AND consumed_at IS NOT NULL AND result_status = 'pending'
      RETURNING state_hash
    `, [stateHash, error.slice(0, 120)]);
    return Boolean(rows[0]);
  }

  async claimDesktopDevice(input: { sessionHash: string; deviceId: string; installIdHash: string }): Promise<{ deviceId: string; accountId: string } | null> {
    return this.sql.begin(async (tx) => {
      const sessions = await tx.unsafe<{ oauth_state_hash: string | null; status: string; subject_hash: string | null }>(`
        SELECT s.oauth_state_hash, s.status, o.result_subject_hash AS subject_hash
        FROM desktop_login_sessions s LEFT JOIN oauth_states o ON o.state_hash = s.oauth_state_hash
        WHERE s.session_hash = $1 AND s.claimed_at IS NULL AND s.expires_at > now()
        FOR UPDATE OF s
      `, [input.sessionHash]);
      const session = sessions[0];
      if (!session || session.status !== "completed" || !session.subject_hash) return null;
      const devices = await tx.unsafe<{ id: string; account_id: string | null }>(`
        SELECT d.id::text, d.account_id::text FROM devices d JOIN install_bindings b ON b.device_id = d.id
        WHERE d.device_id = $1 AND b.install_id_hash = $2 FOR UPDATE OF d
      `, [input.deviceId, input.installIdHash]);
      if (!devices[0]) {
        const existing = await tx.unsafe("SELECT 1 FROM devices WHERE device_id = $1", [input.deviceId]);
        if (existing[0]) throw new DeviceBindingConflictError();
        return null;
      }
      const accounts = await tx.unsafe<{ id: string }>(`
        INSERT INTO accounts (provider, provider_subject_hash, handle, display_label)
        VALUES ('google', $1, 'google-redacted', 'Google user')
        ON CONFLICT (provider, provider_subject_hash) DO UPDATE SET updated_at = now()
        RETURNING id::text
      `, [session.subject_hash]);
      if (devices[0].account_id && devices[0].account_id !== accounts[0].id) throw new DeviceBindingConflictError();
      await tx.unsafe("UPDATE devices SET account_id = $2::uuid, updated_at = now() WHERE id = $1::uuid", [devices[0].id, accounts[0].id]);
      const claimed = await tx.unsafe(`UPDATE desktop_login_sessions SET status = 'claimed', claimed_at = now(), account_id = $2::uuid, updated_at = now() WHERE session_hash = $1 AND claimed_at IS NULL RETURNING session_hash`, [input.sessionHash, accounts[0].id]);
      return claimed[0] ? { deviceId: input.deviceId, accountId: accounts[0].id } : null;
    });
  }

  async authorizeBearer(tokenHash: string, now = new Date()): Promise<{ capability: "view" | "edit" | "publish"; recentGoogle: boolean } | null> {
    const rows = await this.sql.unsafe<{ role: string; recent_auth_at: string | null }>(`
      SELECT rb.role, s.recent_auth_at::text
      FROM admin_sessions s JOIN role_bindings rb ON rb.account_id = s.account_id
      WHERE s.session_hash = $1 AND s.expires_at > $2::timestamptz
    `, [tokenHash, now.toISOString()]);
    const rank: Record<string, number> = { viewer: 0, editor: 1, publisher: 2, owner: 2 };
    const best = rows.reduce((value, row) => Math.max(value, rank[row.role] ?? -1), -1);
    if (best < 0) return null;
    const verifiedAt = rows.map((row) => row.recent_auth_at ? new Date(row.recent_auth_at) : null).find((value) => value !== null) ?? null;
    return { capability: (["view", "edit", "publish"] as const)[best], recentGoogle: this.isRecentGoogleVerification(verifiedAt, now) };
  }

  async expireStates(): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx.unsafe("UPDATE oauth_states SET result_status = 'expired' WHERE expires_at <= now() AND result_status = 'pending'");
      await tx.unsafe("UPDATE desktop_login_sessions SET status = 'expired', updated_at = now() WHERE expires_at <= now() AND status = 'pending'");
    });
  }

  isRecentGoogleVerification(verifiedAt: Date | null, now = new Date()): boolean {
    return verifiedAt !== null && now.getTime() - verifiedAt.getTime() <= RECENT_GOOGLE_AUTH_MS;
  }
}
