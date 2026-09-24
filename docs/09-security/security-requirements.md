# Phase 9: Security & Compliance Requirements

This document defines the technical compliance standards, encryption baselines, and OWASP Top 10 mitigation strategies for the **Motionz Onboarding Portal**.

---

## 1. Security Compliance Baseline

1. **Encryption in Transit**: Strict TLS 1.3 enforcement across all domains, API routes, and WebSocket endpoints. Plain HTTP is redirected to HTTPS at the Edge.
2. **Encryption at Rest**:
   - PostgreSQL database volume encryption using AES-256.
   - Field-level application encryption (AES-256-GCM) for sensitive credentials (GHL Location keys, SSN, Tax IDs).
   - Document storage encrypted with server-side SSE-S3.
3. **Session Hygiene**:
   - Authenticated JWT tokens stored strictly in `HttpOnly; Secure; SameSite=Lax` cookies.
   - Session duration capped at 7 days with sliding refresh rotation.
   - Immediate session invalidation on password change or manual logout.
4. **Search Engine Exclusion**:
   - Hard enforced `X-Robots-Tag: noindex, nofollow, noarchive` on all routes.
   - Global `robots.txt` disallowing all user agents.

---

## 2. OWASP Top 10 (2021) Defensive Matrix

| OWASP Risk Category | Primary Vulnerability Risk | Implemented Architectural Defense |
| :--- | :--- | :--- |
| **A01: Broken Access Control** | IDOR: Client A views Client B's leads | Multi-tier enforcement: Route middleware + scoped server actions + PostgreSQL Row-Level Security (RLS). |
| **A02: Cryptographic Failures** | Hardcoded secrets or leaked API keys | Secrets isolated in Vercel environment variables; field-level AES-256-GCM encryption for stored client API keys. |
| **A03: Injection** | SQL injection or prompt injection | Prisma / Supabase parameterized queries; strict input sanitization with Zod; prompt delimiters and tool confirmation gates. |
| **A04: Insecure Design** | Permanent access tokens in URLs | Permanent URL keys forbidden; single-use, 15-minute expiring magic links; authenticated sessions. |
| **A05: Security Misconfiguration** | Verbose error stack traces in production | Next.js production error boundaries suppressing internal stack traces; sanitized JSON error responses. |
| **A06: Vulnerable Components** | Outdated npm packages | Automated GitHub Dependabot scanning and vulnerability alerts. |
| **A07: Identification & Auth Failures** | Brute-force credential guessing | Upstash Redis rate limiting on auth endpoints; mandatory 2FA for Admin/CSM accounts. |
| **A08: Software & Data Integrity** | Tampered webhook payloads | HMAC signature verification on all inbound webhooks (GoHighLevel, Slack, Whop). |
| **A09: Security Logging Failures** | Unaudited privilege escalation | Immutable `audit_logs` table capturing all security and administrative events. |
| **A10: Server-Side Request Forgery** | Attacker probes internal network via URLs | URL validation whitelist on webhook registration and geocoding fetchers. |
