-- C1: extend the existing engines catalog with discovery/review lifecycle.
-- Candidates remain in engines with enabled=false; the table stays the one
-- source of truth used by runtime/profile materialization.

ALTER TABLE engines
  ADD COLUMN provider_label text,
  ADD COLUMN model_label text,
  ADD COLUMN tier text NOT NULL DEFAULT 'balanced',
  ADD COLUMN supported_efforts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN default_effort_id text,
  ADD COLUMN availability text NOT NULL DEFAULT 'available',
  ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'published',
  ADD COLUMN published_revision text,
  ADD COLUMN catalog_revision bigint NOT NULL DEFAULT 0 CHECK (catalog_revision >= 0),
  ADD COLUMN source text NOT NULL DEFAULT 'custom',
  ADD COLUMN first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN last_missed_at timestamptz,
  ADD COLUMN consecutive_misses integer NOT NULL DEFAULT 0 CHECK (consecutive_misses >= 0),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by text;

UPDATE engines
SET provider_label = provider,
    model_label = model,
    first_seen_at = COALESCE(created_at, now()),
    last_seen_at = COALESCE(updated_at, now()),
    lifecycle_status = 'published',
    availability = 'available'
WHERE provider_label IS NULL OR model_label IS NULL;

-- Backfill the canonical rows created by the pre-C1 bootstrap. This keeps a
-- live database on the same catalog contract as a clean migration without
-- promoting or deleting any user-defined engine.
UPDATE engines
SET source = 'built-in',
    lifecycle_status = 'published',
    availability = 'available',
    published_revision = 'builtin-1',
    tier = CASE
      WHEN engine_id IN ('postprocess-openrouter-premium', 'transform-openrouter-premium') THEN 'premium'
      WHEN engine_id = 'assistant-groq-8b-instant' THEN 'cheap'
      WHEN engine_id IN ('stt-off', 'postprocess-off', 'transform-off') THEN 'off'
      ELSE 'balanced'
    END,
    supported_efforts = CASE
      WHEN engine_id IN ('postprocess-groq-gpt-oss-120b', 'transform-openrouter-premium') THEN '[{"id":"low","label":"Low"},{"id":"medium","label":"Medium"},{"id":"high","label":"High"}]'::jsonb
      ELSE '[]'::jsonb
    END,
    default_effort_id = CASE
      WHEN engine_id IN ('postprocess-groq-gpt-oss-120b', 'transform-openrouter-premium') THEN 'medium'
      ELSE NULL
    END,
    runtime_options = runtime_options
      || jsonb_build_object(
        'supportedEfforts', CASE
          WHEN engine_id IN ('postprocess-groq-gpt-oss-120b', 'transform-openrouter-premium') THEN '[{"id":"low","label":"Low"},{"id":"medium","label":"Medium"},{"id":"high","label":"High"}]'::jsonb
          ELSE '[]'::jsonb
        END,
        'defaultEffortId', CASE
          WHEN engine_id IN ('postprocess-groq-gpt-oss-120b', 'transform-openrouter-premium') THEN to_jsonb('medium'::text)
          ELSE 'null'::jsonb
        END
      )
WHERE engine_id IN (
  'stt-off', 'stt-groq-whisper-turbo', 'postprocess-off',
  'postprocess-groq-gpt-oss-120b', 'transform-off',
  'transform-groq-llama-70b', 'translate-groq-llama-70b',
  'assistant-groq-8b-instant', 'postprocess-openrouter-premium',
  'transform-openrouter-premium'
);

ALTER TABLE engines
  ALTER COLUMN provider_label SET NOT NULL,
  ALTER COLUMN model_label SET NOT NULL,
  ADD CONSTRAINT engines_availability_check CHECK (availability IN ('available', 'temporarily_unavailable', 'retired')),
  ADD CONSTRAINT engines_lifecycle_status_check CHECK (lifecycle_status IN ('candidate', 'published', 'retired')),
  ADD CONSTRAINT engines_source_check CHECK (source IN ('built-in', 'discovered', 'custom'));

CREATE INDEX engines_catalog_lifecycle_idx
  ON engines (lifecycle_status, provider, engine_id);

CREATE TABLE engine_catalog_runs (
  run_key text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  miss_count integer NOT NULL DEFAULT 0 CHECK (miss_count >= 0),
  failed_adapters jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE engine_catalog_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_ref_hash text NOT NULL,
  action text NOT NULL CHECK (action IN ('publish', 'retire', 'review')),
  engine_id text NOT NULL,
  previous_status text NOT NULL CHECK (previous_status IN ('candidate', 'published', 'retired')),
  resulting_status text NOT NULL CHECK (resulting_status IN ('candidate', 'published', 'retired')),
  previous_revision bigint NOT NULL CHECK (previous_revision >= 0),
  resulting_revision bigint NOT NULL CHECK (resulting_revision >= 0),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_catalog_audits_engine_fk FOREIGN KEY (engine_id) REFERENCES engines(engine_id) ON DELETE RESTRICT
);

CREATE INDEX engine_catalog_audits_recent_idx
  ON engine_catalog_audits (occurred_at DESC, id DESC);
