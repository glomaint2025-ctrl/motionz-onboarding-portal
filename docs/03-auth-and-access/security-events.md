# Phase 02: Security Events & Audit Logging

The security monitoring subsystem tracks all critical security events, anomalies, and administrative actions in `public.security_events` and `public.audit_logs`.

---

## 1. Confirmed Security Event Catalog

| Event Type | Severity | Description | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `unauthorized_staff_domain_access` | **High** | Staff login attempt with non-@motionz.ai domain | External email enters staff login flow |
| `staff_privilege_escalation_attempt` | **High** | Staff user attempts to claim unauthorized admin role | Non-designated admin requests admin login or CSM requests admin route |
| `role_privilege_escalation_attempt` | **High** | Non-privileged role requests privileged route | Client attempts `/api/admin/*` or `/api/csm/*` |
| `unauthorized_capability_attempt` | **High** | Actor lacks required capability | Member attempts `team:invite` or CSM attempts `portal:delete` |
| `cross_tenant_access_attempt` | **Critical** | Tenant attempts accessing another client's data | Client A requests Tenant B data or URL |
| `magic_link_verification_failed` | **Medium** | Invalid, revoked, or expired token used | Failed verification via `/api/auth/verify` |
| `rate_limit_exceeded` | **Medium** | Request threshold exceeded | Rapid auth or invitation requests |
| `staff_login_success` | **Low** | Legitimate staff session created | Staff logs in with `@motionz.ai` |
| `invitation_created` | **Low** | Magic link generated | Admin/Client issues invitation |
| `invitation_accepted` | **Low** | Magic link claimed | User verifies token |
| `invitation_revoked` | **Low** | Active invitation cancelled | Administrator revokes invitation |
| `auth_logout` | **Low** | User signs out | Session cookie cleared |

> [!IMPORTANT]
> Raw token values are NEVER logged or stored in `security_events` or `audit_logs`. Only token hashes or prefix hashes may appear in diagnostic records.

---

## 2. Decision Log

| Decision Item | Status | Summary |
| :--- | :---: | :--- |
| Never Log Raw Tokens | **CONFIRMED** | Only SHA-256 token hash or token prefix logged. |
| Automatic Alert on Non-Staff Domain | **CONFIRMED** | High-severity security event emitted immediately. |
| Automatic Alert on Cross-Tenant Probe | **CONFIRMED** | Critical-severity security event emitted with actor details. |
| Rate Limit Event Persistence | **CONFIRMED** | Rate limit violations logged to `security_events`. |
