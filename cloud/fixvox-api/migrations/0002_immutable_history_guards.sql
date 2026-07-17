CREATE OR REPLACE FUNCTION reject_audit_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_records_are_append_only';
END;
$$;

CREATE TRIGGER audit_records_reject_update
BEFORE UPDATE ON audit_records
FOR EACH ROW EXECUTE FUNCTION reject_audit_record_mutation();

CREATE TRIGGER audit_records_reject_delete
BEFORE DELETE ON audit_records
FOR EACH ROW EXECUTE FUNCTION reject_audit_record_mutation();

CREATE OR REPLACE FUNCTION protect_profile_version_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.definition IS DISTINCT FROM OLD.definition
    OR NEW.authority_revision IS DISTINCT FROM OLD.authority_revision
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'profile_version_content_is_immutable';
  END IF;

  IF OLD.status <> 'draft' THEN
    IF NOT (
      OLD.status = 'published'
      AND NEW.status = 'historical'
      AND NEW.published_by IS NOT DISTINCT FROM OLD.published_by
      AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
    ) THEN
      RAISE EXCEPTION 'published_profile_version_is_immutable';
    END IF;
  ELSIF NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'invalid_profile_version_transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_versions_protect_history
BEFORE UPDATE ON profile_versions
FOR EACH ROW EXECUTE FUNCTION protect_profile_version_history();
