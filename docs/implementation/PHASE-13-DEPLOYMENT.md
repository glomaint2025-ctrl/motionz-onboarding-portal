# Phase 13: Deployment

## Overview
Prepare production environments on Vercel and Supabase, environment variable contracts, production migration scripts, health check endpoints, and incident recovery guidelines.

## Tasks

### TASK-1301: Environment Variable Validation and Secret Schema
- Objective: Define a strict runtime environment variable schema validating all required secrets and configuration parameters on application startup.
- Dependencies: Phase 01, Phase 02, Phase 03, Phase 08
- Files/modules affected: `src/lib/env.ts`, `.env.example`
- UI requirements: None
- Content/data requirements: Documented environment variable definitions
- Backend requirements: Zod-based validation throwing descriptive build/start errors if required keys are missing
- Validation requirements: System fails fast if SUPABASE_SERVICE_ROLE_KEY or GHL secrets are missing in production
- Security requirements: Never log or expose secrets; separate public browser variables from private server keys
- Performance considerations: Validate once at startup or runtime bootstrap
- Tests: Unit tests verifying valid and invalid env configurations
- Acceptance criteria: Strict `.env.example` file checked in with descriptions for all variables; runtime validation active
- Status: DONE
- Evidence/result: Implemented `src/lib/env.ts` with strict validation for `NODE_ENV`, production `SESSION_SECRET` length (>=32 chars), valid URL checking for `NEXTAUTH_URL` and `GHL_API_BASE_URL`, and safe redaction helper `getSanitizedEnv()`. Tested and verified in `tests/deployment/deployment.test.ts`.

### TASK-1302: Production Database Migration Script and Rollback Strategy
- Objective: Provide automated migration deployment scripts and documented rollback protocols for Supabase/PostgreSQL.
- Dependencies: Phase 02
- Files/modules affected: `supabase/migrations/`, `scripts/migrate.sh`, `scripts/rollback.sh`
- UI requirements: None
- Content/data requirements: Migration change logs
- Backend requirements: Idempotent SQL migration files numbered sequentially with forward and backward operations
- Validation requirements: Automated dry-run migration execution against target database
- Security requirements: Run migrations using dedicated migration service role with restricted network access
- Performance considerations: Non-blocking schema modifications for live databases
- Tests: Test migrations against clean local PostgreSQL instance
- Acceptance criteria: Clean forward migration from empty database to current schema with 100% table and RLS policy verification
- Status: DONE
- Evidence/result: Implemented `scripts/migrate.ts` and `scripts/rollback.ts` supporting dry-run and live database execution across the 4 chronological SQL migration files (`20260922000001_core_schema.sql` through `20260922000004_performance_indexes.sql`) and verified forward/rollback operations in automated tests.

### TASK-1303: Health Check and Diagnostic Endpoint
- Objective: Implement an authenticated/monitored health check endpoint returning system status, database connectivity, and integration availability.
- Dependencies: Phase 02, Phase 08
- Files/modules affected: `src/app/api/health/route.ts`
- UI requirements: None
- Content/data requirements: JSON payload with status, timestamp, uptime, and database ping
- Backend requirements: Lightweight SQL query `SELECT 1` without loading large datasets
- Validation requirements: Returns HTTP 200 on healthy database connection; HTTP 503 on database disconnection
- Security requirements: Omit sensitive configuration, internal IP addresses, and secret values from health payload
- Performance considerations: Execution time under 20ms
- Tests: API integration tests for healthy and degraded states
- Acceptance criteria: Endpoint operational at `/api/health` responding with standardized health status
- Status: DONE
- Evidence/result: Built `src/app/api/health/route.ts` returning HTTP 200, uptime, database probe latency, adapter configuration states, and zero sensitive secrets or database passwords. Verified in `tests/deployment/deployment.test.ts`.

### TASK-1304: Vercel Production Build and Header Hardening
- Objective: Configure Vercel deployment configuration, caching rules, robots.txt, and security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy).
- Dependencies: Phase 01, Phase 10
- Files/modules affected: `next.config.js`, `vercel.json`, `public/robots.txt`
- UI requirements: None
- Content/data requirements: Production domain mappings
- Backend requirements: Security headers injected into all HTTP responses
- Validation requirements: Security header scanner passes with A+ rating; search engine crawlers blocked on all private routes
- Security requirements: Strict noindex headers; CSP allowing GHL iframes while blocking unauthorized scripts
- Performance considerations: Static asset immutable caching (1 year)
- Tests: Header inspection tests in automated test suite
- Acceptance criteria: Next.js production build succeeds with zero type or lint errors; security headers verified
- Status: DONE
- Evidence/result: Enhanced `next.config.js` with Content-Security-Policy (CSP allowing LeadConnectorHQ/GoHighLevel iframe embeds and Supabase connections), Strict-Transport-Security (HSTS), Permissions-Policy, X-Frame-Options (`SAMEORIGIN`), X-Content-Type-Options (`nosniff`), and `X-Robots-Tag: noindex, nofollow, noarchive`. Added `vercel.json` for deployment rules. Verified TypeScript compilation without errors.
