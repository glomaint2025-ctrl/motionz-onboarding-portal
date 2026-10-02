-- Onboarding form submissions received from the GHL "Form Submitted" workflow.
CREATE TABLE IF NOT EXISTS onboarding_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    submitter_email VARCHAR(255),
    ghl_contact_id VARCHAR(100),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_tenant ON onboarding_submissions (tenant_id, submitted_at DESC);
ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Platform-wide settings editable by admins (e.g. onboarding notification recipients).
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
