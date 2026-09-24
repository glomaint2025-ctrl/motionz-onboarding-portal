# Phase 03: Authentication and Role-Based Access Control (RBAC)

## Phase Objective
Implement enterprise authentication and authorization: internal staff domain restrictions (@motionz.ai), single-use expiring magic link invitations for external clients, secure session cookies, Next.js route middleware, and server-side capability guards.

## Dependencies
Phase 02 database schema and RLS policies.

## Phase Acceptance Criteria
1. Internal staff login restricted strictly to verified @motionz.ai domains with intrusion alerting: DONE
2. External client invitation engine generates single-use, 72-hour expiring magic links: DONE
3. No permanent access keys in URLs (?id=...&k=...): DONE
4. Session cookies configured with HttpOnly, Secure, and SameSite flags via HMAC signing: DONE
5. Route middleware and capability guards reject unauthorized role access and cross-tenant route manipulation: DONE
6. Automated integration tests verify staff restrictions, magic-link lifecycles, and tenant isolation: DONE (8/8 test cases passed)
7. Zero TypeScript errors across auth modules (`npx tsc --noEmit` exits with 0): DONE

---

## Detailed Task Breakdown

### TASK-03-01: Implement Staff Authentication and Domain Restriction
- Status: DONE
- Objective: Restrict Admin and CSM access strictly to authenticated @motionz.ai users; record security alerts on unauthorized domain attempts.
- Files: `src/lib/auth/staff.ts`, `src/app/auth/login/page.tsx`, `src/app/api/auth/login/route.ts`.
- Evidence: `authenticateStaff` rejects non-staff domains and logs a high-severity security event; verified in test suite.

### TASK-03-02: Implement Client Magic Link Invitation Engine
- Status: DONE
- Objective: Generate cryptographically secure, 72-hour expiring, single-use, revocable invitation tokens.
- Files: `src/lib/auth/invitations.ts`, `src/app/auth/verify/page.tsx`, `src/app/api/auth/verify/route.ts`.
- Evidence: `createInvitation`, `verifyInvitationToken`, and `revokeInvitation` implemented and verified against reuse, expiration, and revocation.

### TASK-03-03: Implement Secure Session Management
- Status: DONE
- Objective: Issue and verify cryptographically signed session tokens stored in HttpOnly cookies.
- Files: `src/lib/auth/session.ts`.
- Evidence: HMAC SHA-256 signing and verification with expiration checks; verified in test suite.

### TASK-03-04: Implement Route Boundary Middleware
- Status: DONE
- Objective: Write Next.js middleware enforcing route protection for `/admin`, `/csm`, and `/portal/[clientId]`.
- Files: `src/middleware.ts`.
- Evidence: Route protection active; unauthorized admin/csm requests redirect to login; cross-tenant route tampering redirects to authorized tenant portal.

### TASK-03-05: Implement Server-Side Capability Guard Helpers
- Status: DONE
- Objective: Build typed capability checking functions (`hasPermission`, `assertPermission`, `assertTenantAccess`).
- Files: `src/lib/auth/permissions.ts`.
- Evidence: Granular capability matrix implemented for Admin, CSM, Client, and Client Member roles; verified in test suite.

### TASK-03-06: Write Auth and RBAC Integration Tests
- Status: DONE
- Objective: Test expired tokens, reused tokens, cross-tenant URL manipulation, and privilege escalation attempts.
- Files: `tests/auth/rbac.test.ts`.
- Evidence: Automated test suite executed with 8/8 passing assertions.
