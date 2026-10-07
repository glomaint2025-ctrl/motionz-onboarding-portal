-- ============================================================================
-- Motionz Onboarding Portal: indexes and two read-only helper functions for
-- running with 1,000+ clients.
--
-- Safe to run on the live database, and safe to run more than once:
--   * every statement is CREATE INDEX IF NOT EXISTS or CREATE OR REPLACE FUNCTION
--   * no table is rewritten, no column or row is changed
--   * building an index briefly blocks writes to that one table; at this size
--     (thousands of clients, hundreds of thousands of leads) each takes well
--     under a second
--
-- The portal works the same without this file. It is only slower: the lookups
-- below scan the table, and the two grouped counts fall back to reading rows.
--
-- Indexes that already exist from earlier migrations are NOT repeated here:
--   users(email) unique, users(tenant_id, role), tenants(slug) unique,
--   tenants(status) where live, leads(tenant_id, created_at desc),
--   leads(tenant_id, status), leads(tenant_id, ghl_contact_id) unique,
--   client_setup_steps(tenant_id, sort_order), contracts(tenant_id, created_at desc),
--   appointments(tenant_id, appointment_time), audit_logs(tenant_id, created_at desc),
--   onboarding_submissions(tenant_id, submitted_at desc), user_invitations(token_hash) unique,
--   lead_requests(tenant_id, created_at desc), lead_requests(created_at desc) where open,
--   csm_assignments(csm_user_id, tenant_id) unique, feature_toggles(tenant_id, feature_key) unique.
-- ============================================================================

-- 1. GoHighLevel webhooks find the client by its Location ID on every event
--    (the busiest lookup in the portal). Also used by the "Location ID already in use" check.
CREATE INDEX IF NOT EXISTS idx_tenants_ghl_location
    ON tenants (ghl_location_id)
    WHERE ghl_location_id IS NOT NULL;

-- 2. Staff client lists read every client newest first, page by page.
CREATE INDEX IF NOT EXISTS idx_tenants_created
    ON tenants (created_at DESC, id);

-- 3. "Which CSM looks after this client?" (portal pages, notifications, the admin list).
--    The existing unique index starts with csm_user_id, so it does not serve a lookup by client.
CREATE INDEX IF NOT EXISTS idx_csm_assignments_tenant
    ON csm_assignments (tenant_id);

-- 4. Staff lists by role (the Staff page, "email every admin", the CSM dropdown).
CREATE INDEX IF NOT EXISTS idx_users_role
    ON users (role);

-- 5. A client's pending invitations (Team page, and the client portal's first load).
CREATE INDEX IF NOT EXISTS idx_user_invitations_tenant
    ON user_invitations (tenant_id, created_at DESC);

-- 6. Activity log and security alerts across every client, newest first
--    (Admin > Activity log / Security alerts, and the dashboard's 7-day numbers).
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
    ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created
    ON security_events (created_at DESC);

-- ----------------------------------------------------------------------------
-- Grouped counts. PostgREST cannot GROUP BY, so without these the portal reads
-- the rows and counts them itself. Both functions only read, run with the
-- caller's own rights (row-level security still applies), and may be called by
-- the portal's server (service role) only.
-- ----------------------------------------------------------------------------

-- How many leads a client has in each pipeline stage (client portal > Leads).
CREATE OR REPLACE FUNCTION public.lead_stage_counts(p_tenant_id UUID)
RETURNS TABLE (stage TEXT, lead_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COALESCE(NULLIF(l.status, ''), 'New')::TEXT AS stage, COUNT(*)::BIGINT AS lead_count
    FROM public.leads l
    WHERE l.tenant_id = p_tenant_id
    GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.lead_stage_counts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_stage_counts(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_stage_counts(UUID) TO service_role;

-- When each live client's newest lead arrived (Admin > GHL Connect): one index
-- lookup per client instead of one request per client.
CREATE OR REPLACE FUNCTION public.tenant_last_lead_at()
RETURNS TABLE (tenant_id UUID, last_lead_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT t.id AS tenant_id, newest.created_at AS last_lead_at
    FROM public.tenants t
    CROSS JOIN LATERAL (
        SELECT l.created_at
        FROM public.leads l
        WHERE l.tenant_id = t.id
        ORDER BY l.created_at DESC
        LIMIT 1
    ) newest
    WHERE t.deleted_at IS NULL
    ORDER BY t.id;
$$;

REVOKE ALL ON FUNCTION public.tenant_last_lead_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_last_lead_at() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_last_lead_at() TO service_role;
