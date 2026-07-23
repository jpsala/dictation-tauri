-- Additive O(1) monetary budget ledger. Request events remain the asynchronous audit/read model.
CREATE TABLE budget_counters (
  scope_type text NOT NULL CHECK (scope_type = 'device'),
  scope_id text NOT NULL CHECK (length(scope_id) > 0),
  period_type text NOT NULL CHECK (period_type IN ('day', 'month')),
  period_key date NOT NULL,
  spent_microusd bigint NOT NULL DEFAULT 0 CHECK (spent_microusd >= 0),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id, period_type, period_key),
  CHECK (
    period_type = 'day'
    OR period_key = date_trunc('month', period_key::timestamp)::date
  )
);

CREATE INDEX budget_counters_scope_period
  ON budget_counters (scope_type, scope_id, period_key DESC);

CREATE TABLE budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE CHECK (length(request_id) > 0),
  scope_type text NOT NULL CHECK (scope_type = 'device'),
  scope_id text NOT NULL CHECK (length(scope_id) > 0),
  day_key date NOT NULL,
  month_key date NOT NULL,
  estimated_microusd bigint NOT NULL CHECK (estimated_microusd >= 0),
  settled_microusd bigint CHECK (settled_microusd IS NULL OR settled_microusd >= 0),
  state text NOT NULL CHECK (state IN ('reserved', 'settled', 'released', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (month_key = date_trunc('month', month_key::timestamp)::date),
  CHECK (month_key = date_trunc('month', day_key::timestamp)::date),
  CHECK (
    (state = 'settled' AND settled_microusd IS NOT NULL)
    OR (state <> 'settled' AND settled_microusd IS NULL)
  )
);

CREATE INDEX budget_reservations_active_expiry
  ON budget_reservations (expires_at, request_id)
  WHERE state = 'reserved';
CREATE INDEX budget_reservations_scope_period
  ON budget_reservations (scope_type, scope_id, day_key, month_key);

CREATE OR REPLACE FUNCTION protect_budget_reservation_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
    OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
    OR NEW.day_key IS DISTINCT FROM OLD.day_key
    OR NEW.month_key IS DISTINCT FROM OLD.month_key
    OR NEW.estimated_microusd IS DISTINCT FROM OLD.estimated_microusd
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'budget_reservation_identity_is_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER budget_reservations_protect_identity
BEFORE UPDATE ON budget_reservations
FOR EACH ROW EXECUTE FUNCTION protect_budget_reservation_identity();
