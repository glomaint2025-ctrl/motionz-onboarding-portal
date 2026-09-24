# Phase 11: Production Launch Readiness Checklist

This operational gate must be completely verified and signed off by Platform Engineering and Security before pointing production traffic to `portal.motionz.ai`.

---

## 1. Production Launch Readiness Verification

### 1.1. Security & Compliance Gate
- [ ] **Row-Level Security (RLS)**: Verified active and enforced across 100% of tenant-scoped PostgreSQL tables.
- [ ] **Search Engine Blocker**: Verified `X-Robots-Tag: noindex, nofollow` response header on production apex domain.
- [ ] **No Permanent Query Keys**: Confirmed zero application routes rely on static `?id=...&k=...` tokens.
- [ ] **MFA Enforcement**: Mandatory 2FA verified on all Admin and CSM staff accounts.
- [ ] **Encryption Keys**: Production `TENANT_ENCRYPTION_KEY` generated with 256-bit entropy and stored securely.

### 1.2. Performance & Resilience Gate
- [ ] **Database Connection Pooling**: Supabase Transaction Pooler (PgBouncer) active to prevent connection exhaustion.
- [ ] **Rate Limiting**: Upstash Redis rate limiting active on `/api/actions`, `/api/auth`, and `/api/coach`.
- [ ] **Error Tracking & Alerting**: Sentry error tracking configured with source maps and Slack error alerting.
- [ ] **Lighthouse Mobile Score**: Performance $\ge 90$, Accessibility $\ge 95$, Best Practices $\ge 95$, PWA = Passed.

### 1.3. Integration & Operational Gate
- [ ] **GoHighLevel Webhook Secret**: HMAC signature verification active on `/api/webhooks/ghl`.
- [ ] **Google Service Account**: Quota limits and read-only scopes verified in Google Cloud Console.
- [ ] **Slack Webhooks**: Live alert dispatch verified for `#onboarding-alerts` and `#security-alerts`.
- [ ] **Automated Backups**: Verified active Point-in-Time Recovery (PITR) on Supabase production database.
