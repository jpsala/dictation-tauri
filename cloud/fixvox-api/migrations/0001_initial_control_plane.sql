CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE control_plane_authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('cloudflare-authority', 'import-validation', 'canary', 'vps-authority', 'rollback')),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  source_snapshot_hash text,
  source_version text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_subject_hash text NOT NULL,
  handle text NOT NULL,
  display_label text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject_hash)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  install_id_hash text,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  policy_id text,
  policy_label text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE install_bindings (
  install_id_hash text PRIMARY KEY,
  device_id uuid NOT NULL UNIQUE REFERENCES devices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL UNIQUE,
  label text NOT NULL,
  runtime_profile_id text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_groups (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, group_id)
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL UNIQUE,
  label text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'active',
  active_published_version integer,
  current_draft_version integer,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'historical')),
  definition jsonb NOT NULL,
  authority_revision bigint NOT NULL CHECK (authority_revision >= 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by text,
  published_at timestamptz,
  UNIQUE (profile_id, version)
);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_active_published_version_fk
  FOREIGN KEY (id, active_published_version)
  REFERENCES profile_versions(profile_id, version)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_current_draft_version_fk
  FOREIGN KEY (id, current_draft_version)
  REFERENCES profile_versions(profile_id, version)
  DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX profile_versions_one_draft
  ON profile_versions(profile_id)
  WHERE status = 'draft';

CREATE TABLE engines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id text NOT NULL UNIQUE,
  kind text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  runtime_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id text NOT NULL UNIQUE,
  kind text NOT NULL,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profile_engine_bindings (
  profile_version_id uuid NOT NULL REFERENCES profile_versions(id) ON DELETE RESTRICT,
  engine_id uuid NOT NULL REFERENCES engines(id) ON DELETE RESTRICT,
  purpose text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_version_id, purpose, engine_id)
);

CREATE TABLE profile_prompt_bindings (
  profile_version_id uuid NOT NULL REFERENCES profile_versions(id) ON DELETE RESTRICT,
  prompt_id uuid NOT NULL REFERENCES prompts(id) ON DELETE RESTRICT,
  purpose text NOT NULL,
  PRIMARY KEY (profile_version_id, purpose, prompt_id)
);

CREATE TABLE policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('account', 'device', 'group')),
  target_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  priority integer NOT NULL DEFAULT 0,
  source text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX policy_assignments_one_active_target
  ON policy_assignments(target_type, target_id)
  WHERE active;

CREATE TABLE settings_defaults (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quota_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_profile_id text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('limited', 'unlimited', 'tracking')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  multiplier numeric NOT NULL DEFAULT 1 CHECK (multiplier > 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  usage_kind text NOT NULL,
  estimated_amount numeric NOT NULL CHECK (estimated_amount >= 0),
  state text NOT NULL CHECK (state IN ('reserved', 'consumed', 'released', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES usage_reservations(id) ON DELETE SET NULL,
  request_ref_hash text,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  usage_kind text NOT NULL,
  safe_units numeric NOT NULL CHECK (safe_units >= 0),
  provider_id text,
  model_id text,
  outcome text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usage_events_subject_window
  ON usage_events(device_id, usage_kind, occurred_at DESC);
CREATE INDEX usage_events_account_window
  ON usage_events(account_id, usage_kind, occurred_at DESC);

CREATE TABLE oauth_states (
  state_hash text PRIMARY KEY,
  provider text NOT NULL,
  protected_metadata text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE desktop_login_sessions (
  session_hash text PRIMARY KEY,
  device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  install_binding_hash text,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  session_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recent_auth_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_bindings (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role text NOT NULL,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, role)
);

CREATE TABLE audit_records (
  sequence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audit_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  actor_ref_hash text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_ref_hash text NOT NULL,
  source_version integer,
  target_version integer,
  resulting_version integer,
  result text NOT NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE request_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route text NOT NULL,
  status integer NOT NULL,
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  provider_id text,
  model_id text,
  request_bytes integer CHECK (request_bytes >= 0),
  response_bytes integer CHECK (response_bytes >= 0),
  duration_ms integer CHECK (duration_ms >= 0),
  outcome text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  classification text NOT NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pricing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  model_id text NOT NULL,
  pricing jsonb NOT NULL,
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_id, effective_at)
);

CREATE TABLE pricing_watchlist (
  provider_id text NOT NULL,
  model_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, model_id)
);

CREATE TABLE migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_version text NOT NULL,
  schema_version integer NOT NULL,
  status text NOT NULL,
  safe_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_result text,
  private_artifact_ref text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

INSERT INTO control_plane_authority (mode, changed_by)
VALUES ('cloudflare-authority', 'initial-migration');
