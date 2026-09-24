-- Migration: 20260922000001_core_schema.sql
-- Description: Core relational schema for Motionz multi-tenant onboarding portal

-- 1. Custom Enum Types
CREATE TYPE user_role AS ENUM ('admin', 'csm', 'client', 'client_member');
CREATE TYPE setup_status AS ENUM ('not_started', 'in_progress', 'done');
CREATE TYPE step_owner AS ENUM ('we_handle', 'client_action');
CREATE TYPE order_stage AS ENUM ('ordered', 'packaged', 'shipped', 'delivered', 'issue');
CREATE TYPE video_preference AS ENUM ('undecided', 'ai_video', 'self_filmed');
CREATE TYPE security_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- 2. Master Portal Templates
CREATE TABLE IF NOT EXISTS portal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    default_features JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Template Setup Steps (Baseline 5 steps)
CREATE TABLE IF NOT EXISTS template_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES portal_templates(id) ON DELETE CASCADE,
    step_key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner step_owner NOT NULL,
    what_it_is TEXT NOT NULL,
    right_now TEXT NOT NULL,
    unlocks TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_template_step_key UNIQUE (template_id, step_key)
);

-- 4. Tenants (Client Organizations)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    primary_email VARCHAR(255) NOT NULL,
    primary_contact_name VARCHAR(255),
    phone VARCHAR(50),
    logo_url TEXT,
    status VARCHAR(50) DEFAULT 'active',
    template_id UUID REFERENCES portal_templates(id) ON DELETE SET NULL,
    ghl_location_id VARCHAR(100),
    settings JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 5. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(50),
    avatar_url TEXT,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CSM Assignments
CREATE TABLE IF NOT EXISTS csm_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    csm_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_csm_tenant UNIQUE (csm_user_id, tenant_id)
);

-- 7. User Invitations (Expiring Single-Use Magic Links)
CREATE TABLE IF NOT EXISTS user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Client Setup Steps (The 5 confirmed steps per tenant)
CREATE TABLE IF NOT EXISTS client_setup_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_step_id UUID REFERENCES template_steps(id) ON DELETE SET NULL,
    step_key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner step_owner NOT NULL,
    status setup_status DEFAULT 'not_started',
    what_it_is TEXT NOT NULL,
    right_now TEXT NOT NULL,
    we_need_from_you TEXT,
    unlocks TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_step_key UNIQUE (tenant_id, step_key)
);

-- 9. Tenant Feature Toggles
CREATE TABLE IF NOT EXISTS feature_toggles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_feature UNIQUE (tenant_id, feature_key)
);

-- 10. Integration Configurations
CREATE TABLE IF NOT EXISTS integration_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL, -- 'ghl', 'google_sheets', 'roof_provider'
    config_data JSONB DEFAULT '{}'::JSONB,
    is_active BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_integration UNIQUE (tenant_id, integration_type)
);

-- 11. Signed Contracts
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    document_url TEXT,
    storage_path TEXT,
    signed_at TIMESTAMPTZ,
    ghl_document_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Physical Orders and Shipments
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    stage order_stage DEFAULT 'ordered',
    carrier VARCHAR(100),
    tracking_number VARCHAR(255),
    tracking_url TEXT,
    batch_info TEXT,
    issue_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Video Script Templates & Client Preferences
CREATE TABLE IF NOT EXISTS script_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    script_content TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_script_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    video_preference video_preference DEFAULT 'undecided',
    custom_name VARCHAR(255),
    custom_company VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Roof Measurements
CREATE TABLE IF NOT EXISTS roof_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    planar_area_sqft NUMERIC(10, 2),
    pitch VARCHAR(10),
    surface_area_sqft NUMERIC(10, 2),
    squares NUMERIC(10, 2),
    result_data JSONB DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Leads & Appointments (Cached from GoHighLevel)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ghl_contact_id VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ghl_appointment_id VARCHAR(100),
    contact_name VARCHAR(255) NOT NULL,
    appointment_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Audit Logs & Security Events
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    details JSONB DEFAULT '{}'::JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    severity security_severity DEFAULT 'medium',
    details JSONB DEFAULT '{}'::JSONB,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token_hash) WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_setup_steps_tenant ON client_setup_steps(tenant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id, appointment_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_unresolved ON security_events(severity, is_resolved) WHERE is_resolved = FALSE;
