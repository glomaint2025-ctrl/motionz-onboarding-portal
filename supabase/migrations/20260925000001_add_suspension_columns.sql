-- Migration: 20260925000001_add_suspension_columns.sql
-- Description: Add suspension tracking columns to tenants and users tables

-- 1. Add suspension columns to tenants
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_by VARCHAR(255);

-- 2. Add status and suspension columns to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS suspended_by_role VARCHAR(50),
ADD COLUMN IF NOT EXISTS cascade_suspended BOOLEAN DEFAULT FALSE;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_tenants_suspended_at ON tenants(suspended_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_suspended_at ON users(suspended_at);
