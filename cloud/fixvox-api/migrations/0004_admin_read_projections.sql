-- Local-only, additive Admin read projections. No request content, credentials, OAuth data, or private identifiers are stored.
ALTER TABLE request_events
  ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  ADD COLUMN context text,
  ADD COLUMN usage_kind text,
  ADD COLUMN profile_id text,
  ADD COLUMN engine_id text,
  ADD COLUMN prompt_id text,
  ADD COLUMN prompt_tokens integer CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  ADD COLUMN completion_tokens integer CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  ADD COLUMN total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  ADD COLUMN input_units numeric(20,6) CHECK (input_units IS NULL OR input_units >= 0),
  ADD COLUMN output_units numeric(20,6) CHECK (output_units IS NULL OR output_units >= 0),
  ADD COLUMN cost_microusd bigint CHECK (cost_microusd IS NULL OR cost_microusd >= 0),
  ADD COLUMN ttft_ms integer CHECK (ttft_ms IS NULL OR ttft_ms >= 0),
  ADD COLUMN safe_metrics jsonb NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb,
  ADD CONSTRAINT request_events_safe_metrics_object CHECK (jsonb_typeof(safe_metrics) = 'object'),
  ADD CONSTRAINT request_events_safe_metrics_schema CHECK ((safe_metrics->>'schemaVersion') = '1');

CREATE INDEX request_events_admin_occurred_at ON request_events (occurred_at DESC, id DESC);
CREATE INDEX request_events_admin_device_occurred_at ON request_events (device_id, occurred_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX request_events_admin_dimensions ON request_events (context, profile_id, engine_id, prompt_id, occurred_at DESC);

CREATE TABLE prewarm_daily_counters (
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  utc_date date NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  successes integer NOT NULL DEFAULT 0 CHECK (successes >= 0),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, utc_date),
  CHECK (successes + failures <= attempts)
);
CREATE INDEX prewarm_daily_counters_date ON prewarm_daily_counters (utc_date DESC);

ALTER TABLE accounts
  ADD COLUMN budget_daily_microusd bigint CHECK (budget_daily_microusd IS NULL OR budget_daily_microusd >= 0),
  ADD COLUMN budget_monthly_microusd bigint CHECK (budget_monthly_microusd IS NULL OR budget_monthly_microusd >= 0),
  ADD COLUMN budget_mode text CHECK (budget_mode IS NULL OR budget_mode IN ('warn', 'block')),
  ADD COLUMN admin_metadata jsonb NOT NULL DEFAULT '{"schemaVersion":1,"variants":[],"segments":[]}'::jsonb,
  ADD CONSTRAINT accounts_admin_metadata_object CHECK (jsonb_typeof(admin_metadata) = 'object'),
  ADD CONSTRAINT accounts_admin_metadata_schema CHECK ((admin_metadata->>'schemaVersion') = '1');

ALTER TABLE groups
  ADD COLUMN description text,
  ADD COLUMN source text NOT NULL DEFAULT 'custom' CHECK (source IN ('built-in', 'custom', 'imported')),
  ADD COLUMN admin_metadata jsonb NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb,
  ADD CONSTRAINT groups_admin_metadata_object CHECK (jsonb_typeof(admin_metadata) = 'object'),
  ADD CONSTRAINT groups_admin_metadata_schema CHECK ((admin_metadata->>'schemaVersion') = '1');
