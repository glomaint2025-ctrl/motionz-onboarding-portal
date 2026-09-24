# Motionz Onboarding Portal - Developer Onboarding Handbook

This handbook provides technical orientation, architectural overview, local development setup, database instructions, and testing workflows for software engineers working on the Motionz Onboarding Portal.

---

## 1. Architecture Overview

- **Framework**: Next.js 14 (App Router) with React 18 and TypeScript.
- **Styling**: Vanilla CSS design system (`src/styles/tokens.css`, `src/styles/globals.css`, `src/styles/components.css`) adhering to a high-contrast dark theme (#0c0e14 base), 8px grid spacing, and text-only UI rules.
- **Database Layer**: Dual-mode architecture:
  - **Local In-Memory / Docker**: In-memory repository with Docker PostgreSQL container support (`docker-compose.yml`) for development and instant test suite execution.
  - **Supabase Cloud**: Production-ready PostgreSQL schema with Row-Level Security (RLS) policies and composite performance indexes (`supabase/migrations/`).
- **Authentication & RBAC**:
  - Magic link passwordless authentication with 72-hour expiration and single-use token invalidation.
  - SHA-256 cryptographic token hashing.
  - HMAC SHA-256 session signatures.
  - Email domain enforcement: `@motionz.ai` strictly required for `admin` and `csm` roles.
  - Fine-grained capability checks (`assertCapability`).
- **Tenancy**: Multi-tenant isolation enforced at the database repository and route handler boundaries (`assertTenantAccess`).

---

## 2. Local Environment Setup

### 2.1. Prerequisites
- **Node.js**: v18.x or v20.x+
- **npm** or **pnpm**
- **Docker** (optional, for local PostgreSQL container)

### 2.2. Installation
```bash
# 1. Clone the repository
git clone https://github.com/glomaint2025-ctrl/motionz-onboarding-portal.git
cd motionz-onboarding-portal

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
```

### 2.3. Running the Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 3. Database Management & Migrations

### 3.1. Local Docker PostgreSQL
To run a local PostgreSQL instance:
```bash
docker compose up -d
```
Connection string: `postgresql://postgres:postgrespassword@localhost:5432/motionz_portal`

### 3.2. Connecting to Supabase Cloud
To connect to a Supabase project:
1. Open your `.env.local` file.
2. Set the following keys from your Supabase Project Settings:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-private-key
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project.supabase.co:5432/postgres
   ```
3. Run the migration script to apply all tables, RLS policies, and performance indexes:
   ```bash
   npx tsx scripts/migrate.ts
   ```

### 3.3. Running Migrations & Rollbacks
- **Dry-run migration check**:
  ```bash
  npx tsx scripts/migrate.ts --dry-run
  ```
- **Apply migrations**:
  ```bash
  npx tsx scripts/migrate.ts
  ```
- **Rollback migrations**:
  ```bash
  npx tsx scripts/rollback.ts
  ```

---

## 4. UI Rules & Design System Constraints

All engineers must adhere to the following mandatory design system rules:
1. **Pure Text-Only**:
   - Do NOT use emojis or icon libraries (no Lucide, Heroicons, FontAwesome).
   - Do NOT use decorative dashes (e.g. avoid `--hello` or decorative bullet lines).
   - All buttons, status indicators, and headers must use semantic text labels (e.g., `Complete`, `In Progress`, `Waiting on Client`, `View Details`, `Add Client`).
2. **Responsive Mobile & Desktop**:
   - Desktop viewports feature an expansive sidebar and widescreen layout.
   - Mobile viewports (down to 375px) use a slide-out drawer menu and bottom navigation tab bar.
3. **Optimized Changes**:
   - Avoid modifying unrelated lines.
   - Keep page components clean and ensure zero TypeScript errors (`npx tsc --noEmit`).

---

## 5. Testing & Verification

The repository contains 16 automated test suites covering isolation, RBAC, admin, CSM, client portal, onboarding, integrations, tools, security, math, template engine, API guards, RLS, 20 core user scenarios, performance, and deployment.

To execute all test suites:
```bash
npm test
```

To run TypeScript verification:
```bash
npx tsc --noEmit
```
