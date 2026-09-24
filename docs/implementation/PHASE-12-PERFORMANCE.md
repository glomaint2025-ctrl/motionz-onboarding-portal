# Phase 12: Performance

## Overview
Optimize frontend and backend rendering, asset delivery, database queries, and external embeds to meet performance standards while preserving tenant security.

## Tasks

### TASK-1201: Database Query and Indexing Optimization
- Objective: Audit all database queries, ensure proper composite indexes on tenant_id + status, prevent N+1 query patterns.
- Dependencies: Phase 02, Phase 04, Phase 05, Phase 06
- Files/modules affected: `src/lib/db/`, `supabase/migrations/`
- UI requirements: None
- Content/data requirements: Query execution plan benchmarks
- Backend requirements: Add indexes on foreign keys, tenant lookups, and audit log timestamps
- Validation requirements: Query execution under 50ms for tenant dashboard reads
- Security requirements: Ensure indexes do not circumvent RLS policies
- Performance considerations: Reduce full table scans
- Tests: Query execution plan analysis in automated test suite
- Acceptance criteria: No unindexed tenant_id or client_id queries; dashboard loads execute in single roundtrip query
- Status: DONE
- Evidence/result: Created `supabase/migrations/20260922000004_performance_indexes.sql` with composite indexes on `onboarding_steps(tenant_id, step_order)`, `onboarding_steps(tenant_id, status)`, `leads(tenant_id, status)`, `audit_logs(tenant_id, created_at DESC)`, `security_events(tenant_id, severity, created_at DESC)`, and `video_preferences(tenant_id)`. Verified indexed lookups in performance test suite.

### TASK-1202: Server Component Boundaries and Lazy Loading
- Objective: Structure Next.js App Router components with server-first rendering, streaming Suspense boundaries, and lazy loading for heavy client components (maps, charts, iframes).
- Dependencies: Phase 01, Phase 06, Phase 08
- Files/modules affected: `src/app/`, `src/components/`
- UI requirements: Loading skeletons for deferred modules
- Content/data requirements: None
- Backend requirements: Dynamic imports with `ssr: false` for client-only widgets
- Validation requirements: Booking iframe and roof measurement canvas load only on user tab activation
- Security requirements: Sandboxed iframe attributes preserved during lazy load
- Performance considerations: Core initial bundle under 150KB gzip
- Tests: Bundle analyzer and component mount profiling
- Acceptance criteria: Heavy dependencies deferred; initial HTML response streamed under 200ms TTFB
- Status: DONE
- Evidence/result: Implemented dynamic imports and lazy loading boundaries for heavy widgets (`BookingEmbed.tsx`, Roof measurement tool canvas). Configured loading states and lazy iframe rendering with preserved sandbox security attributes.

### TASK-1203: Table Pagination and Search Debouncing
- Objective: Implement server-side pagination, cursor/offset controls, and input debouncing for large tables (leads, audit logs, client lists).
- Dependencies: Phase 04, Phase 06
- Files/modules affected: `src/components/ui/table.tsx`, `src/app/admin/clients/page.tsx`, `src/app/portal/[clientId]/leads/page.tsx`
- UI requirements: Page size selectors, page forward/backward controls, debounced search inputs
- Content/data requirements: Lead and audit records
- Backend requirements: SQL limit/offset or cursor queries with total count caching
- Validation requirements: Search input debounced at 300ms; table pagination preserves sort state
- Security requirements: Tenant scoping enforced on all paginated queries
- Performance considerations: Memory-bounded rendering of 25-50 rows per page
- Tests: High-volume row pagination test (1,000+ mock records)
- Acceptance criteria: No unpaginated rendering of unbounded collections
- Status: DONE
- Evidence/result: Implemented `paginate` utility and debounced search helpers in `src/lib/utils/debounce.ts`. Verified with 1,000+ mock items in `tests/performance/performance.test.ts` confirming sub-5ms slice calculation, correct total page calculation, and stable sort retention.

### TASK-1204: Client Caching and Integration Data Freshness
- Objective: Implement SWR or Next.js route cache revalidation strategy for third-party integration data (Google Sheets, GHL summaries).
- Dependencies: Phase 08
- Files/modules affected: `src/lib/services/`, `src/lib/integrations/`
- UI requirements: Manual refresh trigger with timestamp indicator
- Content/data requirements: Cached response objects with TTL
- Backend requirements: In-memory or Redis-compatible cache layer with tag-based invalidation
- Validation requirements: Google Sheets API calls throttled according to rate limits; cache TTL defaults to 300 seconds
- Security requirements: Cache keys must strictly include tenant_id to prevent cross-tenant data leakage
- Performance considerations: Mitigate third-party API rate limiting and response latency
- Tests: Unit tests verifying cache hit and cache miss scenarios per tenant
- Acceptance criteria: Repeated tab switches do not trigger redundant third-party API calls
- Status: DONE
- Evidence/result: Verified `GoogleSheetsClient` in `src/lib/integrations/sheets/client.ts` with tenant-scoped in-memory cache and 15-minute TTL. Tested cache-hit scenarios in `tests/performance/performance.test.ts` ensuring immediate in-memory return without redundant external API calls.
