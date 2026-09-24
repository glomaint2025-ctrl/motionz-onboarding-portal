-- ============================================================================
-- Motionz Onboarding Portal Migration 004: Performance & Composite Indexing
-- ============================================================================

-- Composite indexes on high-frequency tenant queries to avoid full table scans
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_created ON leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_tenant_severity ON security_events (tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_client_setup_steps_tenant_sort ON client_setup_steps (tenant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_time ON appointments (tenant_id, appointment_time);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_stage ON orders (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_feature_toggles_tenant_key ON feature_toggles (tenant_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token_hash ON user_invitations (token_hash);
