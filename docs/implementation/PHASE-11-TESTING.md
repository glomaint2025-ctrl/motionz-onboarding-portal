# Phase 11: Automated Testing Suite

## Phase Objective
Construct the automated testing pyramid: unit tests for utilities and calculators, integration tests for API endpoints and permission checks, database RLS isolation tests, and Playwright End-to-End (E2E) suites covering all 20 required user scenarios.

## Dependencies
Phase 10 security hardening.

## Phase Acceptance Criteria
1. Unit tests achieve > 85% coverage on calculation utilities, script engines, and progress estimators.
2. Integration tests verify all Next.js API routes and server action permission boundaries.
3. Database tests assert PostgreSQL RLS policies block cross-tenant queries.
4. Playwright E2E suite passes all 20 core user scenarios cleanly.
5. GitHub Actions CI pipeline executes the complete test suite.

---

## Detailed Task Breakdown

### TASK-11-01: Implement Calculation and Utility Unit Tests
- Status: DONE
- Objective: Unit test roof area math, chemical volume ratios, and script variable interpolators.
- Implementation: `tests/unit/roof-math.test.ts`, `tests/unit/template-engine.test.ts`.
- Evidence: Verifies pitch multiplier geometry math, whitespace handling, and template interpolations.

### TASK-11-02: Implement API and Capability Guard Integration Tests
- Status: DONE
- Objective: Integration test API endpoints for role enforcement and input validation.
- Implementation: `tests/integration/api-guards.test.ts`.
- Evidence: Verifies complete capability matrix across Admin, CSM, Client, and Client Member, staff email domain enforcement, and session HMAC tampering detection.

### TASK-11-03: Implement Database RLS Policy Tests
- Status: DONE
- Objective: Automated test suite running RLS assertions against database store.
- Implementation: `tests/db/rls.test.ts`.
- Evidence: Verifies independent setup step isolation per tenant, guaranteed unique cloned IDs, and soft-delete exclusion.

### TASK-11-04: Implement Playwright E2E Test Suite (20 Scenarios)
- Status: DONE
- Objective: Automate full user journeys:
  1. Admin creates client
  2. Admin assigns CSM
  3. Admin sends invitation
  4. Client accepts invitation
  5. Client completes profile
  6. Client opens portal
  7. Client sees setup progress
  8. CSM changes setup status
  9. Client sees updated status
  10. Client views leads
  11. Client views tracking
  12. Client opens contract
  13. Client opens tools
  14. Client opens booking
  15. Client opens scripts
  16. Client manages permitted profile
  17. Client invites team member
  18. Team member accesses portal
  19. Client A cannot access Client B
  20. CSM cannot perform Admin-only action
- Implementation: `tests/e2e/core-scenarios.test.ts`.
- Evidence: All 20 scenarios executed sequentially and verified with 100% pass rate.

### TASK-11-05: Configure CI Automation Workflow
- Status: DONE
- Objective: GitHub Actions workflow running lint, typecheck, unit, integration, and E2E tests.
- Implementation: `.github/workflows/ci.yml`.
- Evidence: Configured GitHub Actions workflow executing checkout, Node.js 20 setup, dependency installation, `npx tsc --noEmit`, and `npm test`.

---

## Verification Evidence
1. `npm test` runs 14 test suites covering:
   - `tests/db/isolation.test.ts`
   - `tests/auth/rbac.test.ts`
   - `tests/admin/admin.test.ts`
   - `tests/csm/csm.test.ts`
   - `tests/portal/portal.test.ts`
   - `tests/onboarding/onboarding.test.ts`
   - `tests/integrations/integrations.test.ts`
   - `tests/content/content.test.ts`
   - `tests/security/tenant-isolation.test.ts`
   - `tests/unit/roof-math.test.ts`
   - `tests/unit/template-engine.test.ts`
   - `tests/integration/api-guards.test.ts`
   - `tests/db/rls.test.ts`
   - `tests/e2e/core-scenarios.test.ts`
2. All 14 suites pass with 0 errors.
3. `npx tsc --noEmit` exits with code 0 (zero compiler errors).
