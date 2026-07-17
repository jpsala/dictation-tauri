-- Local-only auth/session lifecycle. Browser admin cookies remain outside this API.
ALTER TABLE oauth_states
  ADD COLUMN result_status text NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending', 'completed', 'failed', 'expired')),
  ADD COLUMN result_subject_hash text,
  ADD COLUMN result_error text,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN google_verified_at timestamptz,
  ADD CONSTRAINT oauth_states_result_shape CHECK (
    (result_status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
    OR (result_status = 'completed' AND completed_at IS NOT NULL AND result_subject_hash IS NOT NULL)
    OR (result_status = 'failed' AND failed_at IS NOT NULL)
    OR (result_status = 'expired')
  );

ALTER TABLE desktop_login_sessions
  ADD COLUMN handoff_hash text,
  ADD COLUMN oauth_state_hash text REFERENCES oauth_states(state_hash) ON DELETE SET NULL,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN google_verified_at timestamptz,
  ADD CONSTRAINT desktop_login_sessions_status CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'claimed'));

CREATE UNIQUE INDEX desktop_login_sessions_handoff_hash_unique
  ON desktop_login_sessions(handoff_hash) WHERE handoff_hash IS NOT NULL;
CREATE INDEX oauth_states_pending_expiry ON oauth_states(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX desktop_login_sessions_pending_expiry ON desktop_login_sessions(expires_at) WHERE claimed_at IS NULL;
CREATE UNIQUE INDEX desktop_login_sessions_claim_once
  ON desktop_login_sessions(session_hash) WHERE claimed_at IS NOT NULL;
