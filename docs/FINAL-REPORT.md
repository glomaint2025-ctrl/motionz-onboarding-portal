# Motionz Client Portal: Project Status Report

**Date:** 2026-10-02 · **Branch:** `phase-1-staging` · **Staging:** https://motionz-onboarding-portal.vercel.app

This replaces the earlier report, which overstated completion. Everything below was verified with
`npx tsc --noEmit` (0 errors), the automated suite (`npm test`), a production build, and manual
browser testing against the staging database.

## What the portal does now

### Clients (roofing companies and their team)
- **Home:** setup progress, current step, next call with their CSM, tracking-sheet button, signed-contract status, their CSM's name and email, Slack and Skool links, website change requests (emailed to the CSM).
- **Onboarding:** the 5 setup steps (status changed only by CSM/Admin, client answer 5.1), the GHL onboarding form embedded with their email pre-filled, the A2P form.
- **Leads:** read-only list of leads from their GoHighLevel sub-account with the GHL pipeline stage, search, stage filter, and a Day 1–7 follow-up counter (client answers 1.2–1.5).
- **Tracking:** "Open my tracking sheet" button. A copy of the client's Data Sheet template is created automatically in Drive and shared with the client as editor when the portal is created (P1.4, 3.4–3.6).
- **Signed contract, Orders, Video scripts, Book a call, Tools, Profile, Team:** all real data, no placeholders. Team invites need only email and phone (P1.2). Team members see only the sections the owner allows.
- **Roof measurement:** built on Google's Solar API (roof area, squares, pitch per facet). Shows "Coming soon" until the client provides an API key.

### CSMs
- See only the clients assigned to them; dashboard, client list and setup queue with real progress.
- Update step status and text (including step names) for their clients; see each client's onboarding form answers.

### Admin (CSM manager)
- **Dashboard:** active/onboarding/total clients, clients still in setup and stuck 14+ days, GHL not connected, clients without a CSM, security events, unmatched form submissions. Revenue and churn honestly show "Not connected".
- **Clients:** create (sheet + emailed invite created automatically), assign CSM, set GHL Location ID, feature toggles, suspend/archive, team oversight, onboarding answers, attach signed contracts, manage orders.
- **Staff:** add CSMs and Admins (they get an email to set a password), disable/enable access.
- **Templates:** edit the default setup steps and video scripts (applies to new clients).
- **Settings & Integrations:** onboarding-form notification emails (e.g. media buyer), link unmatched submissions, service status.
- **Audit logs and security alerts.**

### Integrations
| Service | How | Status |
|---|---|---|
| Email | Resend (Brevo also supported) | Working; test sender only until the client's domain is verified |
| Google Sheets | Google Apps Script web app (`scripts/google-apps-script/create-client-sheet.gs`) | Working, tested end to end |
| GoHighLevel | Workflow webhooks → `/api/webhooks/ghl` (leads, CSM calls, onboarding form) | Built and tested on staging; workflows must be added in GHL (`docs/07-integrations/ghl-workflows.md`) |
| Google Solar API | Roof measurement | Built; waiting for the client's API key |

## Security work done
- Fixed account takeover: reset and magic links were returned in API responses; now emailed only.
- No account enumeration on login, magic link or password reset.
- GHL webhook requires a shared secret (timing-safe), fails closed in production, never assigns data to the wrong client.
- Demo tenant is read-only and disabled in production; real tenant IDs are never rewritten.
- Production refuses to run without a real session secret; links always use the configured domain.
- CSMs are restricted to assigned clients; module and contract permissions are enforced on the server.
- Integration secrets are never sent to the browser; phone/text inputs are validated.
- `@motionz.ai` emails are staff-only (P1.1); disabled staff are blocked at login and in every API.
- Rate limiting is stored in Postgres so it works on Vercel (needs migration `20261002000003`).
- Audit logs are append-only (migration `20261002000004`).

## Database
Run the files in `supabase/migrations/` in order on any new database. `supabase/seed/demo_data.sql`
holds the demo client and users, **for local/staging only**.

**Still to run on staging** (Supabase → SQL Editor), in order:
1. `20261002000003_rate_limits.sql`: until then, login rate limits fall back to per-instance memory.
2. `20261002000004_audit_log_immutability.sql`

## Environment variables (Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
`NEXTAUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `GHL_WEBHOOK_SECRET`,
`GOOGLE_SHEETS_SCRIPT_URL`, `GOOGLE_SHEETS_SCRIPT_SECRET` (all set on staging).
Optional: `GOOGLE_SOLAR_API_KEY` (roof tool), `ADMIN_EMAILS` (extra admins), `MEDIA_BUYER_EMAIL`.

## Waiting on the client
See `docs/CLIENT-QUESTIONS.md`: media buyer and Facebook-launch meaning, Skool automation, price
display, Solar API key, contract source, what ships in Orders, sending-domain DNS, and adding the
GHL workflows plus each client's Location ID.

## Known limitations
- Staff sign in with email and password (Google SSO for staff is not implemented).
- No PDF storage: contracts are links (e.g. to the signed GHL document).
- Leads only appear from the moment the GHL workflow is added (no import of older leads).
