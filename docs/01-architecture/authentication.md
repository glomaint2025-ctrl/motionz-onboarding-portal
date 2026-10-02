# Phase 02: Production Authentication Architecture

This document defines the production authentication architecture for the Motionz Onboarding Portal across internal staff and external client organizations.

---

## 1. Architectural Topology & Identity Hierarchy

```
Supabase Auth Identity (`auth.users`)
        ↓
Application User Record (`public.users`)
        ↓
Role (`user_role`: admin | csm | client | client_member)
        ↓
Tenant Membership (`public.tenants.id` via `users.tenant_id`)
        ↓
Application Authorization & Database RLS
```

- **[CONFIRMED] Identity Source of Truth**: Supabase Auth provides the underlying user identity layer. Application authorization maps `auth.users.id` directly to `public.users.id`.
- **[CONFIRMED] Single Authority**: No competing authentication engines. Authorization decisions are derived server-side from persistent database state, never from browser state or incoming request payloads.
- **[CONFIRMED] Stateless Edge Sessions**: Sessions are cryptographically signed using HMAC SHA-256 (`crypto.subtle` in Edge runtime / middleware, and `node:crypto` in Node runtime). Delivered in `HttpOnly; Secure; SameSite=Lax` cookies named `motionz_session`.

---

## 2. Staff Authentication Flow (Admin & CSM)

- **[CONFIRMED] Strict Domain Policy**: Only email addresses ending with `@motionz.ai` are authorized for staff access. External domains (e.g. `@gmail.com`, `@apexroofing.com`) are rejected with `403 Forbidden` and logged as a high-severity security event (`unauthorized_staff_domain_access`).
- **[CONFIRMED] Server-Controlled Role Resolution (No Browser Role Selection)**: The user interface contains no role dropdown or selector. Users never submit a role. Roles are resolved authoritatively on the server by inspecting persistent `public.users.role` records or designated admin lists (`ADMIN_EMAILS`). If an untrusted request attempts to supply `role: 'admin'`, the server detects tampering, logs a `staff_privilege_escalation_attempt` security event, and rejects with `403`.
- **[CONFIRMED] Production vs Development Isolation**:
  - **[PROPOSED / PRODUCTION REQUIREMENT]**: In production (`NODE_ENV === 'production'`), staff accounts authenticate strictly via Google Workspace Single Sign-On (`@motionz.ai` enterprise domain). Passwordless direct email login is rejected with a clear user-facing error.
  - **[DEVELOPMENT ONLY]**: In development and automated test environments (`NODE_ENV !== 'production'`), local staff authentication via verified `@motionz.ai` email is permitted and explicitly logged as `staff.dev_authenticated`.
- **[CONFIRMED] Navigation Targets**:
  - `admin` → `/admin`
  - `csm` → `/csm`

---

## 3. Client & Client Member Magic Link Authentication Flow

External clients and their team members authenticate without passwords using cryptographic, expiring, single-use magic links:

1. **Invitation Generation**:
   - Cryptographically random 32-byte hexadecimal token (`crypto.randomBytes(32)`).
   - Only the SHA-256 hash (`token_hash`) is persisted in `public.user_invitations`. Raw tokens are never logged or stored.
   - Single-use, valid for exactly **72 hours** (`expires_at`).
   - Clean resend policy: issuing a new invitation for `(email, tenant_id)` automatically revokes prior pending invitations.
2. **Client Member Mandatory Fields**:
   - **[CONFIRMED]** Team invitations require **ONLY Email and Phone Number**. No full name or other mandatory fields.
   - Role is strictly assigned by the application to `client_member`.
   - Tenant is strictly assigned to the inviting organization's `tenant_id`.
3. **Atomic Verification & Concurrency Control**:
   - Verification is atomic via SQL conditional update: `UPDATE user_invitations SET accepted_at = NOW() WHERE id = $1 AND accepted_at IS NULL`.
   - If two requests hit simultaneously, exactly one succeeds; the second receives an idempotent `INVITATION_ALREADY_ACCEPTED` response.
4. **Session Establishment**:
   - Synchronizes Supabase Auth identity.
   - Sets secure session cookie `motionz_session`.
   - Redirects to `/portal/[clientId]`.

---

## 4. Open Redirect & Rate Limiting Defenses

- **[CONFIRMED] Open Redirect Prevention**: All redirect parameters are sanitized via `sanitizeRedirectUrl`. External URLs (e.g., `https://attacker.example`), protocol-relative URLs (`//attacker.example`), backslash tricks (`/\`), and script schemes (`javascript:`) are rejected in favor of safe internal fallbacks.
- **[CONFIRMED] Rate Limiting**:
  - Staff login: 10 requests / minute / IP (HTTP 429).
  - Magic link requests: 5 requests / 15 minutes / email (HTTP 429).
  - Magic link verification: 15 requests / minute / IP (HTTP 429).
  - Team invitations: 20 invitations / minute / tenant (HTTP 429).

---

## 5. Decision Log

| Decision Item | Status | Summary |
| :--- | :---: | :--- |
| Supabase Auth as Identity Layer | **CONFIRMED** | Primary persistent identity engine mapped to application user table. |
| Edge Runtime HMAC Session Cookie | **CONFIRMED** | Lightweight, fast session cookie verified by middleware and route guards. |
| Domain Policy `@motionz.ai` | **CONFIRMED** | Non-staff domains cannot authenticate into staff routes. |
| Team Member Fields | **CONFIRMED** | Only Email + Phone number required. |
| Single-Use Magic Link | **CONFIRMED** | 72-hour window, single-use, atomic claim, revocable. |
| Open Redirect Sanitization | **CONFIRMED** | Enforced across login, verify, and logout endpoints. |
| Multi-Factor Authentication (2FA) | **PROPOSED** | Future extension for Admin/CSM accounts via TOTP/WebAuthn. |
