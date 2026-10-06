-- Lead Replacement and Unresponsive Lead forms sent from the client portal (Leads page).
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS lead_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('replacement', 'unresponsive')),
    lead_name TEXT NOT NULL,
    lead_phone TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'not_replaceable', 'needs_review', 'sent')),
    decision_reason TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    submitted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    submitter_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_requests_tenant ON lead_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_requests_open ON lead_requests (created_at DESC) WHERE status = 'open';

ALTER TABLE lead_requests ENABLE ROW LEVEL SECURITY;

-- Same style as the other tenant tables (20260922000002_rls_policies.sql): staff manage every row,
-- a client reads only their own. The portal itself writes with the service role.
DROP POLICY IF EXISTS admin_lead_requests_all ON lead_requests;
CREATE POLICY admin_lead_requests_all ON lead_requests
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

DROP POLICY IF EXISTS csm_lead_requests_all ON lead_requests;
CREATE POLICY csm_lead_requests_all ON lead_requests
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

DROP POLICY IF EXISTS client_lead_requests_select ON lead_requests;
CREATE POLICY client_lead_requests_select ON lead_requests
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());
