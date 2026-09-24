# Phase 9: Security Test Plan & Penetration Scenarios

This test plan defines explicit test scenarios to prove that **Client A cannot access Client B's data**, that magic links expire properly, and that unauthorized privilege escalation is impossible.

---

## 1. Automated Security Test Scenarios

### Scenario SEC-TEST-01: Cross-Tenant Data Access (IDOR Test)
- **Objective**: Verify that Client A cannot read Client B's leads, contracts, or onboarding form answers.
- **Setup**:
  - Tenant A (`Apex Roofing`, ID: `tenant_apex`, User: `stephen@apex.com`).
  - Tenant B (`Metro Roofing`, ID: `tenant_metro`, Lead ID: `lead_metro_99`).
- **Execution**:
  1. Authenticate as `stephen@apex.com`.
  2. Issue API call: `GET /api/client-view?id=tenant_metro&view=leads`.
  3. Issue API call: `GET /api/agreements?id=tenant_metro&doc=contract.pdf`.
  4. Issue Direct Database Query via Client A session for `lead_metro_99`.
- **Expected Result**:
  - API returns `403 Forbidden`.
  - Storage download returns `403 Forbidden`.
  - Database query returns `0 rows`.
  - An audit log entry (`SEC-004: tenant.cross_tenant_probe`) is dispatched to Slack.

---

### Scenario SEC-TEST-02: Expired & Reused Magic Link Rejection
- **Objective**: Verify that magic links cannot be reused or consumed after expiration.
- **Execution**:
  1. Generate login magic link for `stephen@apex.com`.
  2. Consume link via `GET /auth/verify?token=tok_123`.
  3. Attempt second consumption with the same link: `GET /auth/verify?token=tok_123`.
  4. Generate another link, advance mock system time by 16 minutes, and attempt consumption.
- **Expected Result**:
  - Step 2 succeeds and establishes a session.
  - Step 3 fails with `401 Unauthorized` (`"This link has already been used"`).
  - Step 4 fails with `401 Unauthorized` (`"This link has expired"`).

---

### Scenario SEC-TEST-03: Privilege Escalation Attempt
- **Objective**: Verify that a Client user cannot access Admin or CSM routes.
- **Execution**:
  1. Authenticate as Client user (`stephen@apex.com`).
  2. Attempt to navigate to `/admin` and `/csm`.
  3. Issue API mutation: `POST /api/templates` to create a template.
  4. Issue API mutation: `POST /api/portals/delete` to delete a portal.
- **Expected Result**:
  - Navigation immediately redirects to `/portal/apex-roofing` with an unauthorized alert.
  - API calls reject with `403 Forbidden: Insufficient Permissions`.
  - Audit log records `SEC-005: role.privilege_escalation`.

---

### Scenario SEC-TEST-04: API Rate Limiting Verification
- **Objective**: Verify that bot attacks against AI and authentication endpoints are throttled.
- **Execution**:
  1. Script issues 50 requests in 5 seconds to `/api/actions` (AI endpoint).
- **Expected Result**:
  - First 20 requests succeed.
  - Requests 21 through 50 return `429 Too Many Requests` with `Retry-After` header.
