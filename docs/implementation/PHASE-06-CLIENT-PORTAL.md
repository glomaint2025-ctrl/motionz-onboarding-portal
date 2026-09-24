# Phase 06: Client Portal Shell and Core Modules

## Phase Objective
Build the client-facing portal shell, Overview dashboard, Leads/CRM viewer, Tracking Sheet viewer, Signed Contract vault, Orders fulfillment tracker, Client Profile, Team Member management, and Book a Call page.

## Dependencies
Phase 05 CSM step management and Phase 03 auth guards.

## Phase Acceptance Criteria
1. Responsive client layout shell with collapsing desktop rail and mobile drawer/bottom bar.
2. Overview dashboard displays setup percentage, current/next action focus card, and KPI snapshots.
3. Leads and Performance page displays lead metrics with clear connection states when GHL is not linked.
4. Signed Contract vault allows secure in-portal PDF viewing and authenticated downloads.
5. Orders and Shipping tracker displays stage pipeline (Ordered, Packaged, Shipped, Delivered, Issue).
6. Client Profile permits editing allowed business fields; Team Member page enables inviting employees.
7. Book a Call embeds the GHL scheduling calendar directly without redirect.

---

## Detailed Task Breakdown

### TASK-06-01: Build Client Portal Responsive Shell
- Status: DONE
- Objective: Shell layout for /portal/[clientId] with client identity header, collapsing rail, dynamic branding loader, and mobile bottom bar.
- Implementation: `src/app/portal/[clientId]/layout.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/MobileNav.tsx`.
- Evidence: Dynamic branding load from `/api/portal/[clientId]/data`, desktop rail, mobile drawer and bottom quick bar navigation.

### TASK-06-02: Build Overview Page
- Status: DONE
- Objective: Render setup progress percentage, single next action focus card, website change widget, and telemetry KPIs.
- Implementation: `src/app/portal/[clientId]/page.tsx`, `src/app/api/portal/[clientId]/website-update/route.ts`.
- Evidence: Dynamically computes completion percentage (60%), displays active action milestone, and submits change requests to the CSM queue.

### TASK-06-03: Build Leads and Performance Page
- Status: DONE
- Objective: Display leads count, replied, booked inspections, won jobs, revenue, and pipeline stages with empty/unconnected states.
- Implementation: `src/app/portal/[clientId]/leads/page.tsx`, `src/app/portal/[clientId]/performance/page.tsx`.
- Evidence: Pipeline list, search, status filtering, appointments tab, and GoHighLevel connection status badge.

### TASK-06-04: Build Tracking Sheet Page
- Status: DONE
- Objective: Render synchronized campaign tracking data and lead quota gauge with configurable mapping.
- Implementation: `src/app/portal/[clientId]/tracking/page.tsx`.
- Evidence: Google Sheets sync indicator, quota delivery gauge (42/50 leads, 84%), and weekly performance breakdown table.

### TASK-06-05: Build Signed Contract Vault
- Status: DONE
- Objective: Secure viewer for dealer agreements and LLC certificates with inline PDF display and download.
- Implementation: `src/app/portal/[clientId]/contract/page.tsx`.
- Evidence: E-signature audit trail, execution metadata, inline document reader, and authenticated PDF download action.

### TASK-06-06: Build Orders and Shipping Tracker
- Status: DONE
- Objective: Visual stage tracker for physical chemical product fulfillment with carrier tracking links.
- Implementation: `src/app/portal/[clientId]/orders/page.tsx`.
- Evidence: Visual stage pipeline (`Ordered`, `Packaged`, `Shipped`, `Delivered`), carrier tracking link, batch origin, and supply reorder request.

### TASK-06-07: Build Profile and Team Member Management Pages
- Status: DONE
- Objective: Profile view for business details and team member invitation/revocation interface.
- Implementation: `src/app/portal/[clientId]/profile/page.tsx`, `src/app/portal/[clientId]/team/page.tsx`, `src/app/api/portal/[clientId]/profile/route.ts`, `src/app/api/portal/[clientId]/team/route.ts`.
- Evidence: Company profile editing form with audit logging; team roster with single-use 72-hour magic-link generation modal.

### TASK-06-08: Build Book a Call Page
- Status: DONE
- Objective: Responsive embed of the confirmed GoHighLevel calendar widget.
- Implementation: `src/app/portal/[clientId]/book-call/page.tsx`, `src/app/portal/[clientId]/booking/page.tsx`, `src/components/portal/BookingWidget.tsx`.
- Evidence: Direct responsive iframe embedding confirmed calendar `SRn2ONyB295xnnPR5JwR` with loading skeleton and external window fallback.

---

## Verification Evidence
1. `tests/portal/portal.test.ts` executes 6 test assertions:
   - Tenant data & setup progress percentage calculation.
   - Cross-tenant IDOR isolation boundary checks.
   - Company profile updates & persistence.
   - Team member management & 72-hour magic-link generation.
   - Leads, appointments, contracts, and orders integrity.
   - Client role capability permission guard validation.
2. `npm test` runs 5 test suites (26 assertions) with 100% pass rate.
3. `npx tsc --noEmit` exits with code 0 (zero TypeScript errors).
