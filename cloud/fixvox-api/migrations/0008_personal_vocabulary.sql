-- Account-scoped personal vocabulary.  Rule text is intentionally stored only
-- in this account partition and is never projected into provider/runtime data.
CREATE TABLE personal_vocabulary_revisions (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE personal_vocabulary_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  spoken_key text NOT NULL CHECK (length(spoken_key) > 0 AND length(spoken_key) <= 256),
  spoken text NOT NULL CHECK (length(spoken) > 0 AND length(spoken) <= 256),
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array'),
  default_candidate_id text,
  mode text NOT NULL CHECK (mode IN ('automatic', 'ask')),
  enabled boolean NOT NULL DEFAULT true,
  note text CHECK (note IS NULL OR length(note) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (jsonb_array_length(candidates) >= 1 AND jsonb_array_length(candidates) <= 8),
  CHECK (mode = 'ask' OR jsonb_array_length(candidates) = 1),
  CHECK (default_candidate_id IS NULL OR default_candidate_id <> '')
);

CREATE INDEX personal_vocabulary_rules_account_order
  ON personal_vocabulary_rules (account_id, created_at, id);
CREATE INDEX personal_vocabulary_rules_account_trigger
  ON personal_vocabulary_rules (account_id, spoken_key, enabled);
