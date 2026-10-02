# Phase 02: Authentication & Access Implementation

This document details the production authentication lifecycles, token issuance mechanisms, and credential verification procedures for the **Motionz Onboarding Portal**.

---

## 1. Authentication Lifecycles

### 1.1. Internal Staff (Admin & CSM) Login Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Admin / CSM Staff
    participant Browser as Browser Client
    participant API as /api/auth/login
    participant StaffAuth as authenticateStaff()
    participant DB as Supabase PostgreSQL
    
    Staff->>Browser: Enters email (@motionz.ai) [NO role selection]
    Browser->>API: POST /api/auth/login { email, action: 'staff' }
    API->>StaffAuth: Validate domain ending with @motionz.ai
    alt Non-Staff Domain
        StaffAuth-->>API: Reject (403 Forbidden) + Security Alert
        API-->>Browser: "Internal staff access is restricted to verified @motionz.ai accounts"
    else Verified @motionz.ai
        StaffAuth->>DB: Query user record & authoritatively resolve role
        StaffAuth->>StaffAuth: Prevent role self-elevation / detect tampering
        StaffAuth-->>API: Return authenticated user object with server-resolved role
        API->>Browser: Set-Cookie: motionz_session (HttpOnly, Secure, SameSite=Lax)
        Browser->>Browser: Server-driven redirect to /admin (admin) or /csm (csm)
    end
```

### 1.2. External Client & Team Member Invitation Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Inviter as Client Owner / Admin
    actor Invitee as External Client Member
    participant API as /api/portal/[clientId]/team
    participant InvService as InvitationService
    participant DB as PostgreSQL (user_invitations)
    participant VerifyAPI as /api/auth/verify
    
    Inviter->>API: POST /api/portal/[clientId]/team { email, phone }
    API->>API: Assert role capability ('team:invite')
    API->>API: Enforce role = 'client_member', tenant = inviting tenant
    API->>InvService: createInvitation({ tenantId, email, phone, role: 'client_member' })
    InvService->>DB: Revoke prior pending invitations for (email, tenantId)
    InvService->>DB: Insert new invitation (token_hash, expires_at = +72h)
    InvService-->>Inviter: Return invitation & single-use magic link
    Invitee->>VerifyAPI: POST /api/auth/verify { token }
    VerifyAPI->>InvService: verifyAndAccept(rawToken)
    InvService->>DB: Atomic claim (accepted_at = NOW() WHERE accepted_at IS NULL)
    InvService->>DB: Provision/update user in users table
    VerifyAPI-->>Invitee: Set-Cookie: motionz_session (Role: client_member)
    Invitee->>Invitee: Redirect to /portal/[tenantId]
```

---

## 2. Magic Link Security Specifications

- **Token Cryptography**: 256-bit cryptographically secure random bytes generated via `crypto.randomBytes(32).toString('hex')`.
- **Database Storage**: The raw token is hashed using SHA-256 before insertion into `public.user_invitations.token_hash`. The plain token is never stored or logged.
- **Expiration Threshold**: Exactly 72 Hours (3 days) from creation timestamp.
- **Single-Use Invalidation**: Upon receipt, the token is claimed atomically (`accepted_at = NOW()`). Subsequent attempts trigger an immediate `410 INVITATION_ALREADY_ACCEPTED` error.
- **Revocability**: Administrators can revoke active invitations at any time via `revokeInvitation()`.
- **Resend Safety**: Creating a new invitation automatically revokes any dangling pending invitations for the same `(email, tenant_id)`.

---

## 3. Session Cookie Configuration

Session tokens are generated via HMAC SHA-256 and stored in secure cookies:

```typescript
export const SESSION_COOKIE_NAME = 'motionz_session';

response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days persistent session
});
```

---

## 4. Session Revocation & Logout

- **Logout Endpoint**: `POST /api/auth/logout`
  - Validates active session and records `auth.logout` audit log entry and `auth_logout` security event.
  - Clears `motionz_session` cookie (`maxAge: 0`, `expires: new Date(0)`).
  - Returns `{ success: true, redirectTo: '/auth/login' }`.

---

## 5. Decision Log

| Decision Item | Status | Notes |
| :--- | :---: | :--- |
| Magic-Link Validity (72h) | **CONFIRMED** | Expiring single-use access link. |
| Client Member Mandatory Fields | **CONFIRMED** | Email + Phone Number only. |
| Domain Policy `@motionz.ai` | **CONFIRMED** | Non-staff domains strictly rejected from staff login. |
| Open Redirect Sanitization | **CONFIRMED** | Centralized via `sanitizeRedirectUrl`. |
| Concurrency Control | **CONFIRMED** | Atomic conditional update on `accepted_at IS NULL`. |
