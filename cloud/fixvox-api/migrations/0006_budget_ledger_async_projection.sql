-- Local/provider-free maintenance state for rebuilding and projecting the O(1) budget ledger.
CREATE TABLE budget_ledger_checkpoints (
  checkpoint_key text PRIMARY KEY CHECK (length(checkpoint_key) > 0),
  source_fingerprint text NOT NULL CHECK (length(source_fingerprint) = 64),
  source_event_count integer NOT NULL CHECK (source_event_count >= 0),
  imported_event_count integer NOT NULL CHECK (imported_event_count >= 0),
  counter_update_count integer NOT NULL CHECK (counter_update_count >= 0),
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE budget_ledger_imported_events (
  source_event_id text PRIMARY KEY CHECK (length(source_event_id) > 0),
  source_fingerprint text NOT NULL CHECK (length(source_fingerprint) = 64),
  checkpoint_key text NOT NULL REFERENCES budget_ledger_checkpoints(checkpoint_key),
  scope_type text NOT NULL CHECK (scope_type = 'device'),
  scope_id text NOT NULL CHECK (length(scope_id) > 0),
  occurred_at timestamptz NOT NULL,
  day_key date NOT NULL,
  month_key date NOT NULL,
  cost_microusd bigint NOT NULL CHECK (cost_microusd >= 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (month_key = date_trunc('month', month_key::timestamp)::date),
  CHECK (month_key = date_trunc('month', day_key::timestamp)::date)
);
CREATE INDEX budget_ledger_imported_events_checkpoint
  ON budget_ledger_imported_events (checkpoint_key, source_event_id);

CREATE TABLE budget_ledger_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE CHECK (length(dedupe_key) > 0),
  event_type text NOT NULL CHECK (event_type IN ('legacy_checkpoint_applied', 'reservation_expired')),
  safe_payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(safe_payload) = 'object'),
  CHECK ((safe_payload->>'schemaVersion') = '1'),
  CHECK ((safe_payload->>'kind') = event_type),
  CHECK ((safe_payload - 'schemaVersion' - 'kind') = '{}'::jsonb)
);
CREATE INDEX budget_ledger_outbox_pending
  ON budget_ledger_outbox (created_at, id)
  WHERE published_at IS NULL;

CREATE TABLE budget_ledger_read_model (
  event_id uuid PRIMARY KEY REFERENCES budget_ledger_outbox(id),
  event_type text NOT NULL CHECK (event_type IN ('legacy_checkpoint_applied', 'reservation_expired')),
  safe_payload jsonb NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(safe_payload) = 'object'),
  CHECK ((safe_payload->>'schemaVersion') = '1'),
  CHECK ((safe_payload->>'kind') = event_type),
  CHECK ((safe_payload - 'schemaVersion' - 'kind') = '{}'::jsonb)
);
