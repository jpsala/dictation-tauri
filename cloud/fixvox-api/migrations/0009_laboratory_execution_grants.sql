CREATE TABLE IF NOT EXISTS laboratory_execution_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  principal_key text NOT NULL,
  device_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('gate-a', 'gate-b')),
  definition_hash text NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  estimate_hash text NOT NULL CHECK (estimate_hash ~ '^[a-f0-9]{64}$'),
  source_run_id text,
  max_requests integer NOT NULL CHECK (max_requests > 0),
  max_cost_microusd bigint NOT NULL CHECK (max_cost_microusd >= 0),
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'consumed', 'expired')),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS laboratory_execution_grants_lookup
  ON laboratory_execution_grants (principal_key, device_id, state, expires_at);

CREATE TABLE IF NOT EXISTS laboratory_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL UNIQUE REFERENCES laboratory_execution_grants(id),
  principal_key text NOT NULL,
  device_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('gate-a', 'gate-b')),
  definition_hash text NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  estimate_hash text NOT NULL CHECK (estimate_hash ~ '^[a-f0-9]{64}$'),
  source_run_id text,
  max_requests integer NOT NULL CHECK (max_requests > 0),
  max_cost_microusd bigint NOT NULL CHECK (max_cost_microusd >= 0),
  requests_used integer NOT NULL DEFAULT 0 CHECK (requests_used >= 0),
  cost_microusd bigint NOT NULL DEFAULT 0 CHECK (cost_microusd >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted')),
  completed_request_count integer,
  canonical_raw_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS laboratory_executions_source
  ON laboratory_executions (kind, status, source_run_id);
