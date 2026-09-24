-- Migration: 20260922000002_rls_policies.sql
-- Description: Row-Level Security (RLS) policies enforcing strict multi-tenant isolation

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_setup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_toggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_script_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE roof_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Helper functions for current user context
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
    SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. Tenants Policies
-- Admin can view, create, update, and soft-delete any tenant
CREATE POLICY admin_tenants_policy ON tenants
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

-- CSM can view all active tenants
CREATE POLICY csm_tenants_select_policy ON tenants
    FOR SELECT
    TO authenticated
    USING (current_user_role() = 'csm');

-- CSM can update assigned tenants
CREATE POLICY csm_tenants_update_policy ON tenants
    FOR UPDATE
    TO authenticated
    USING (
        current_user_role() = 'csm' AND
        id IN (SELECT tenant_id FROM csm_assignments WHERE csm_user_id = auth.uid())
    );

-- Client and Client Member can only view their own tenant record
CREATE POLICY client_tenants_select_policy ON tenants
    FOR SELECT
    TO authenticated
    USING (
        current_user_role() IN ('client', 'client_member') AND
        id = current_user_tenant_id()
    );

-- Client owner can update permitted fields on their own tenant (company name, logo, phone)
CREATE POLICY client_tenants_update_policy ON tenants
    FOR UPDATE
    TO authenticated
    USING (
        current_user_role() = 'client' AND
        id = current_user_tenant_id()
    );

-- 2. Client Setup Steps Policies
CREATE POLICY admin_setup_steps_all ON client_setup_steps
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_setup_steps_all ON client_setup_steps
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_setup_steps_select ON client_setup_steps
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

-- 3. Contracts Policies
CREATE POLICY admin_contracts_all ON contracts
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_contracts_all ON contracts
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_contracts_select ON contracts
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

-- 4. Leads & Appointments Policies
CREATE POLICY admin_leads_all ON leads
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_leads_all ON leads
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_leads_select ON leads
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

CREATE POLICY admin_appointments_all ON appointments
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_appointments_all ON appointments
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_appointments_select ON appointments
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

-- 5. Orders Policies
CREATE POLICY admin_orders_all ON orders
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_orders_all ON orders
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_orders_select ON orders
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

-- 6. Roof Measurements Policies
CREATE POLICY admin_roof_all ON roof_measurements
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_roof_all ON roof_measurements
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_roof_select ON roof_measurements
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

CREATE POLICY client_roof_insert ON roof_measurements
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = current_user_tenant_id());

-- 7. Feature Toggles Policies (Strict Admin Control)
CREATE POLICY admin_feature_toggles_all ON feature_toggles
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY csm_feature_toggles_select ON feature_toggles
    FOR SELECT
    TO authenticated
    USING (current_user_role() = 'csm');

CREATE POLICY client_feature_toggles_select ON feature_toggles
    FOR SELECT
    TO authenticated
    USING (tenant_id = current_user_tenant_id());

-- 8. Audit Logs & Security Events (Append-only & Read-only)
CREATE POLICY admin_audit_logs_select ON audit_logs
    FOR SELECT
    TO authenticated
    USING (current_user_role() = 'admin');

CREATE POLICY admin_security_events_all ON security_events
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');
