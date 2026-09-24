# Motionz Onboarding Portal

A multi-tenant client onboarding and operations portal purpose-built for roofing dealer partners, Customer Success Managers (CSMs), and Motionz Platform Administrators.

---

## 1. Executive Summary

The Motionz Onboarding Portal guides roofing contractors through a structured 5-milestone onboarding pipeline to launch their advertising, CRM, and communication infrastructure. It provides real-time campaign performance tracking, lead management, video script generation, roof measurement calculations, and direct strategy session booking.

### Core Value Proposition
- **Clarity for Clients**: Transparent setup progress bar, real-time "Right now" status updates from CSMs, and instant access to leads and signed contracts.
- **Efficiency for CSMs**: Centralized roster of assigned clients, one-click milestone status overrides, and unified guidance management.
- **Governance for Admins**: Global tenant provisioning from master templates, per-client feature flags, security audit log explorer, and intrusion alert monitoring.

---

## 2. Technology Stack & Architecture

- **Web Framework**: Next.js 14 (App Router) with React 18 and TypeScript.
- **Design System**: Vanilla CSS tokens (`src/styles/tokens.css`, `src/styles/globals.css`, `src/styles/components.css`) featuring a high-contrast dark theme (#0c0e14 base) with semantic color tokens and responsive grid spacing.
- **UI Policy**: Pure text-only interface. Strictly zero icons, zero emojis, and zero decorative dashes across all navigation, buttons, badges, and headers.
- **Dual-Mode Database**:
  - **Local In-Memory / Docker PostgreSQL**: Instant development and test suite execution without external dependencies.
  - **Supabase Cloud**: Production-ready PostgreSQL schema with Row-Level Security (RLS) policies and composite performance indexes (`supabase/migrations/`).
- **Security & RBAC**:
  - 72-hour single-use magic links with SHA-256 token hashing.
  - HMAC SHA-256 session signatures.
  - Email domain enforcement: `@motionz.ai` strictly required for `admin` and `csm` roles.
  - Tenant isolation guards preventing Insecure Direct Object References (IDOR).
  - Global HTTP security headers (`noindex, nofollow, noarchive`, `nosniff`, `SAMEORIGIN`, CSP, HSTS).
  - Sliding-window rate limiter and HTML entity input sanitization.

---

## 3. The 5 Confirmed Onboarding Milestones

Each client portal tracks exactly 5 verified milestones:

| Step | Milestone | Owner | Confirmed Form / Resource |
|---|---|---|---|
| 1 | **Google Sheet** | Client & CSM | Client intake parameters and territory mapping |
| 2 | **GoHighLevel / A2P Verified** | Motionz Tech Ops | GHL Onboarding Form (`wyM27h1ZCiwGoyXE03oC`) & A2P Form (`SH2jCt6DkV69gF6YHPni`) |
| 3 | **Facebook** | Client & CSM | Business Manager partner asset delegation and pixel |
| 4 | **Domain, Email & Website** | Motionz Tech Ops | Custom DNS records, Google Workspace, and dealer landing page |
| 5 | **Phone System & A2P Texting** | Motionz Tech Ops | Twilio/GHL phone number acquisition and SMS carrier registration |

---

## 4. Key Portal Modules

- **Overview Dashboard (`/portal/[clientId]`)**: Live onboarding progress percentage, current active milestone, and quick links to Slack and Skool.
- **Onboarding Roadmap (`/portal/[clientId]/onboarding`)**: Detailed setup cards displaying Name, Owner, Status, What it is, Right now, and Unlocks.
- **Leads & Pipeline (`/portal/[clientId]/leads`)**: Real-time lead tracker with contact info, status filter, and appointment details.
- **Campaign Tracking (`/portal/[clientId]/tracking`)**: Performance metrics including impressions, clicks, lead volume, and CPL.
- **Tools & Resources (`/portal/[clientId]/tools`)**:
  - **Video Scripts Generator**: Template-based script generator with variable interpolation (`{client_name}`, `{company_name}`, `{phone}`, `{state}`).
  - **Video Preference**: Dealer preference state tracking (AI Video vs Self-Filmed Video).
  - **Roof Measurement Tool**: Interactive calculator estimating total squares, pitch multiplier, and chemical volume.
- **Signed Contracts Vault (`/portal/[clientId]/contract`)**: Repository of signed agreements and legal documents.
- **Orders Tracker (`/portal/[clientId]/orders`)**: Equipment and marketing collateral shipment tracking with live carrier links.
- **Book a Call (`/portal/[clientId]/book-call`)**: Embedded calendar for strategy sessions (Calendar ID `SRn2ONyB295xnnPR5JwR`).
- **Admin Shell (`/admin`)**: Client management, Add Client wizard, feature switches, script template editor, and security event log explorer.
- **CSM Workspace (`/csm`)**: Assigned client roster, setup detail view, step guidance editor, and review queue.

---

## 5. Quickstart & Local Setup

### 5.1. Prerequisites
- Node.js v18.x or v20.x+
- npm or pnpm
- Docker (optional, for local PostgreSQL container)

### 5.2. Installation & Running Locally
```bash
# 1. Clone repository
git clone https://github.com/glomaint2025-ctrl/motionz-onboarding-portal.git
cd motionz-onboarding-portal

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local

# 4. Start local development server
npm run dev
```
Open `http://localhost:3000` to view the application.

---

## 6. Database Configuration & Migrations

### 6.1. Running Local PostgreSQL Container
```bash
docker compose up -d
```

### 6.2. Connecting to Supabase Cloud
Set your Supabase credentials in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres
```

### 6.3. Running Migrations
```bash
# Dry-run validation
npx tsx scripts/migrate.ts --dry-run

# Live schema migration
npx tsx scripts/migrate.ts

# Rollback
npx tsx scripts/rollback.ts
```

---

## 7. Testing & Verification

The project includes 16 automated test suites covering all architectural layers:

```bash
# Run all test suites
npm test

# Run TypeScript compiler verification
npx tsc --noEmit
```

### Test Suite Coverage:
1. `isolation.test.ts`: Multi-tenant data isolation and template cloning.
2. `rbac.test.ts`: Authentication, 72-hour magic links, SHA-256 tokens, `@motionz.ai` restriction, capability guards.
3. `admin.test.ts`: Client roster, Add Client wizard, feature switches, portal archival, audit logging.
4. `csm.test.ts`: Assigned client queries, status updates, progress recalculation, CSM role boundaries.
5. `portal.test.ts`: Client dashboard, profile persistence, team invitations, permission guards.
6. `onboarding.test.ts`: 5 confirmed setup cards, dynamic progress calculations, GHL form IDs.
7. `integrations.test.ts`: GHL client, Google Sheets client with 15m TTL cache, Slack alerts, booking calendar.
8. `content.test.ts`: Video script interpolation, video preference workflow, roof math calculations.
9. `tenant-isolation.test.ts`: IDOR attack prevention, rate limiting, XSS sanitization, security event audit.
10. `roof-math.test.ts`: Pitch multiplier and roof square math unit tests.
11. `template-engine.test.ts`: Variable interpolation unit tests.
12. `api-guards.test.ts`: API route capability and role-based guards.
13. `rls.test.ts`: Database Row-Level Security policy isolation.
14. `core-scenarios.test.ts`: 20 required core user scenarios verified end-to-end.
15. `performance.test.ts`: High-volume pagination, search debouncing, integration TTL caching.
16. `deployment.test.ts`: Environment validation, migration scripts, rollback runner, health check endpoint.

---

## 8. Documentation Map

Detailed operational playbooks and architectural documentation:
- `docs/12-handover/admin-guide.md`: Admin Operations Manual
- `docs/12-handover/csm-guide.md`: CSM Daily Playbook & Guidance Manual
- `docs/12-handover/client-guide.md`: Client User Manual & Navigation Guide
- `docs/12-handover/developer-guide.md`: Developer Onboarding Handbook
- `docs/12-handover/integrations-guide.md`: Integrations Setup & Configuration Guide
- `docs/implementation/MASTER-TASKS.md`: Master Implementation Tracker (Phases 00 - 14)
- `docs/implementation/DECISIONS.md`: Architectural Decision Records (ADRs)