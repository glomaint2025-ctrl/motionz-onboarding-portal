-- Audit logs are append-only (NFR-104): block DELETE and any UPDATE, even for the service role.
-- The one allowed update is the foreign-key cleanup Postgres performs (ON DELETE SET NULL)
-- when a tenant or user is deleted, which only nulls tenant_id / actor_user_id.
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (NEW.tenant_id IS NULL OR NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id)
       AND (NEW.actor_user_id IS NULL OR NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id)
       AND (to_jsonb(NEW) - 'tenant_id' - 'actor_user_id') = (to_jsonb(OLD) - 'tenant_id' - 'actor_user_id')
    THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_logs rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
