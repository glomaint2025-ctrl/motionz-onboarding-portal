# Phase 2: Database & Data Model Architecture

The data architecture for **Motionz Onboarding Portal** is designed on **PostgreSQL (via Supabase)**, optimized for multi-tenant isolation, template inheritance, audit compliance, and fast relational aggregation.

---

## 1. Database Design Principles

1. **Relational Core with JSONB Flexibility**: Core business entities (Tenants, Users, Steps, Contracts, Orders) are fully normalized with strict foreign keys. Semi-structured operational payloads (onboarding form answers, AI conversation transcripts, custom marketing overrides) utilize PostgreSQL `JSONB` with GIN indexing.
2. **Tenant Scoping as First-Class Column**: Every table housing client-specific data contains a non-nullable `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`.
3. **Auditability by Default**: All core tables track `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`. Mutations generate records in an immutable `audit_logs` table.
4. **Soft Deletion for Portals**: Portals are soft-deleted via `deleted_at TIMESTAMPTZ` to enable emergency restoration and maintain historical integrity.

---

## 2. Table Indexing & Performance Strategy

To ensure sub-millisecond query execution across thousands of client portals:
- **Composite Tenant Indexes**: All tenant-scoped queries query by `(tenant_id, created_at DESC)` or `(tenant_id, status)`.
- **Slug Lookups**: Unique index on `tenants.slug` and `portal_templates.slug`.
- **Foreign Key Indexes**: Every foreign key column (`user_id`, `tenant_id`, `template_id`) is explicitly indexed to optimize JOIN performance and cascade checks.
- **GIN Indexes on JSONB**: Specific JSONB fields frequently searched or filtered (such as `tenants.feature_flags` and `onboarding_steps.metadata`) utilize GIN indexing.

---

## 3. Enumerated Types (Postgres Enums)

```sql
-- User platform roles
CREATE TYPE user_role AS ENUM ('admin', 'csm', 'client', 'client_member');

-- Onboarding step statuses
CREATE TYPE step_status AS ENUM ('not_started', 'in_progress', 'blocked', 'done', 'not_needed');

-- Step ownership classification
CREATE TYPE step_owner AS ENUM ('we_handle', 'client_action');

-- Physical order fulfillment stages
CREATE TYPE order_stage AS ENUM ('ordered', 'packaged', 'shipped', 'delivered', 'issue');

-- Video production format preference
CREATE TYPE video_preference AS ENUM ('undecided', 'ai_avatar', 'self_filmed');

-- Payment KYC status
CREATE TYPE kyc_status AS ENUM ('unstarted', 'pending_verification', 'action_required', 'verified', 'denied');
```
