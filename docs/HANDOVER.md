# Handover: Motionz Client Portal

Read this first, then `docs/FINAL-REPORT.md` (what the portal does), `docs/CLIENT-QUESTIONS.md`
(open client questions) and `docs/07-integrations/ghl-workflows.md` (GHL setup).

## Where things are
| Item | Value |
|---|---|
| Repo | `C:\Gloma\motionz-onboarding-portal` |
| Branch | `phase-1-staging` (committed, **not pushed**; `main` is far behind) |
| Staging URL | https://motionz-onboarding-portal.vercel.app (Vercel project `motionz-onboarding-portal`, CLI logged in as `heshan-404`) |
| Deploy | `npx vercel --prod --yes` from the repo (manual; no Git auto-deploy) |
| Database | Supabase project `hagqtrhgetyrubvcskij` (staging). All migrations in `supabase/migrations/` are applied, incl. `...000003_rate_limits` and `...000004_audit_log_immutability` |
| Secrets | `.env.local` (gitignored) and Vercel env vars. Never commit or paste them |
| Staging admin | `admin@motionz.ai` / `password` (test account; change before real use) |

All staging accounts (Google/Sheets script, Vercel, Supabase, Resend) belong to the developer
(Heshan). **For production, everything moves to the client's accounts.**

## Stack and conventions
Next.js 14 App Router, TypeScript, plain CSS tokens (`src/styles`), home-grown UI kit (`src/components/ui`),
Supabase via service-role repositories (`src/lib/db/repositories`, with in-memory mock used by tests),
custom HMAC session cookie (`src/lib/auth/session.ts`, `edge-session.ts`, `middleware.ts`, `guard.ts`).

- Verify every change with `npx tsc --noEmit`, `npm test` (27 suites, all passing) and `npx next build`.
- Tests strip `RESEND_API_KEY`, `GOOGLE_SHEETS_SCRIPT_URL` and `GHL_WEBHOOK_SECRET` so they never send real emails or create sheets.
- Windows: `python` is a Store stub (hangs); use Node for scripts. Some files have CRLF in the working copy.
- The portal must never show invented data (FR-502); empty states instead.

## Integrations
| Service | How | State |
|---|---|---|
| Email | Resend API (`src/lib/email`), Brevo also supported | Works, but in Resend **test mode**: only delivers to the Resend account's own email. Domain DNS records are with the client (see CLIENT-QUESTIONS #8 / DNS table). After verification set `EMAIL_FROM_ADDRESS=portal@mail.motionz.ai` in Vercel and redeploy |
| Google Sheets | Apps Script web app (`scripts/google-apps-script/create-client-sheet.gs`) runs under Heshan's Google account; copies the client's "Data Sheet - [TEMPLATE]" into Drive folder `1rfpLmUMN5AJqjN2oND5eQGeoH1KPmCGZ` and shares it with the client | Works, tested |
| GoHighLevel | Workflow webhooks → `/api/webhooks/ghl` with `customData.secret` + `customData.event` (`lead`, `csm_call`, `onboarding_form`) | See below |
| Roof | Google Solar API (`src/lib/integrations/roof/solar.ts`) | Built, untested; needs `GOOGLE_SOLAR_API_KEY` from the client |

### GHL state (agency "Motionz AI", 7 sub-accounts)
- **Motionz Your Rejuvenation** (`jMHUkxkfbH1KlzxsBgdi`) owns the onboarding form ("Onboarding Rejuvenation | Forms" = `wyM27h1ZCiwGoyXE03oC`), the A2P form, and the CSM booking calendar "Motionz - Reviews Meeting" (`SRn2ONyB295xnnPR5JwR`).
- Workflows created by the developer: `Portal: onboarding form` and `Portal: CSM calls` in Motionz Your Rejuvenation; `Portal: sync leads` pushed via snapshot **"Portal workflows"** to 4 client sub-accounts and published. The original `Portal: sync leads` in Motionz Your Rejuvenation should be Draft. Confirm all of this in GHL; it was configured by hand.
- Leads only reach a client once that client exists in the portal **with its GHL Location ID** (Admin → Clients). Zydeco Roof Revival = `TG1QAGQkANvoJ3UdmZRZ`.

## Staging data
Test clients were created (e.g. Zydeco Roof Revival with `heshantharushka2002+zydeco@gmail.com`,
Heshan Test Roofing). The user may have wiped all clients with the SQL in this conversation; check
Admin → Clients before assuming anything. Old test sheets may remain in the Drive folder.

## Pending work: no client input needed
1. **New-client success screen** (`src/app/admin/clients/new/page.tsx`): says "Deliver this link to the client" even though the invite is emailed. Return `emailDelivered` from `POST /api/admin/clients` and show "Invite emailed to …" or "Email couldn't be sent, copy this link".
2. **Admin dashboard (FR-501):** add website-change-request count and recent login activity (data is already in `audit_logs`: `client.authenticated`, `website-update` entries).
3. **PWA (NFR-202):** service worker / offline shell (manifest and icons exist).
4. **Roof tool extras (FR-404):** map view, manual pitch adjustment, material estimate. Test once the API key exists.
5. Hardcoded colours in some pages (e.g. `#2563eb`) should use the design tokens; Select dropdown lacks arrow-key support.
6. Change the staging test passwords (Supabase → Authentication → Users) after the client has looked.
7. Push the branch and decide on merging `phase-1-staging` into `main`.

## Client answers received (2026-10-03) → work to do
| Topic | Client said | Work |
|---|---|---|
| Onboarding form (7.1, 7.3) | Wants the form **built directly in the portal**, "embedded so the information stays within their portal and is saved to their profile". The GHL form is correct today. | Build a **native portal onboarding form** with the same fields as the GHL form "Onboarding Rejuvenation \| Forms" (`wyM27h1ZCiwGoyXE03oC`; field list in `api.leadconnectorhq.com/widget/form/<id>`). Save answers to `onboarding_submissions` for the tenant, show them to the client in their portal (read-only or editable?) and to Admin/CSM, and keep the notification email. Uploads (videos/materials, old-leads list) need storage (Supabase Storage). Confirm with the client whether answers must also be pushed into GHL (contact fields) for his existing GHL workflows. |
| Media buyer (7.1) | Not answered (he answered about the form instead). | Ask again: email address(es) to notify. Settings page already supports a list. |
| Facebook launch (7.2) | The email to the media buyer is enough. | Nothing extra. |
| CSM calls (8.1) | "Reviews" calendar is right; he will add **another calendar for his other CSM**. | Support **one booking calendar per CSM**: add a calendar-ID field per CSM (Admin → Staff), use the assigned CSM's calendar on the client's Book a Call page, and add the new calendar to the `Portal: CSM calls` workflow trigger filter in GHL. |
| Contracts (9.x) | Signed in **GHL → Payments → Documents & Contracts**. View only, no download. Visible to staff and the **client owner only** (not team members). Unsure if an automation can fire when signed. | Check GHL workflow triggers for a Documents & Contracts "signed/completed" trigger; if it exists, add webhook event `contract_signed` (doc name + link) that creates the contract record. Otherwise keep admin-attached links. Owner-only visibility already matches (`client:view_contract`). |
| Orders (10.x) | **Remove all shipping/orders.** Maybe later. | Remove the Orders page, nav item, feature toggle, admin orders UI and API (`/api/admin/clients/[id]/records` order parts, `orderRepository` usage, portal `orders` route). Keep the DB table (harmless) or drop in a new migration. |
| Video scripts (11.1) | Explained in a Loom: https://www.loom.com/share/b1b8b30ea26d4b8a8d60f5286fdaef44 and doc: https://docs.google.com/document/d/1ydc8mHu9pnTLyqq4AlpuOkjLoMTD34BoyY9FeFcxxhQ | Watch/read both, then redesign the Video Scripts page to match his real flow. Not yet reviewed. |
| Roof (12.1) | Sent a Google API key (in chat). | Set `GOOGLE_SOLAR_API_KEY` in Vercel (production + preview) and `.env.local`, redeploy, test a real address. Ask him to **restrict the key** in Google Cloud to Geocoding API + Solar API. Key was shared in plain text; consider rotating it later. |
| Email domain | Resend domain **verified**. | Set `EMAIL_FROM_ADDRESS` (e.g. `portal@mail.motionz.ai`) and `EMAIL_FROM_NAME` in Vercel, redeploy, test an invite to a non-owner address. Optionally add a reply-to address (needs a small code change in `src/lib/email/index.ts`). |

## Decision: forms stay in GHL (supersedes the "native onboarding form" row above)
All client-facing forms stay **GHL forms embedded in the portal** (iframe, email/name pre-filled via URL
params). The client edits forms only in GHL; the GHL "Form Submitted" workflow sends the submission to
`/api/webhooks/ghl` and the portal stores **every field generically** (`onboarding_submissions.answers`
JSONB, keyed by GHL field label). New or renamed GHL fields therefore need **no portal code or DB
change**. Keep this design for any new form (add a new `customData.event` value per form type).
Show the client their own submitted answers in their portal (read-only), not just Admin/CSM.

## Client feedback round 2 (2026-10-03): to do
1. **Branding:** app background `#090703` (warm near-black) and the client's new logo (orange robot in a
   hexagon on orange). Move the accent colour from cyan to the logo's orange in `src/styles/tokens.css`;
   replace `src/components/brand/MotionzLogo.tsx`, favicon and `public/icons/*`. Ask the client for the
   logo as SVG or high-res PNG with transparent background.
2. **Client home header:** rename "Overview" to the client's name and use a hero card like the client's
   example: small tag with the current phase/step (e.g. "PHASE 1 · GET LEGAL"), "Welcome, <first name>.",
   one-line subtitle ("Here's exactly where your business stands. We handle most of it. The steps marked
   as yours are the quick actions we need from you."), and a progress ring "% SET UP" on the right.
3. **Website change request** (client home): replace the placeholder/intro with the client's copy:
   "Want different colors, new wording, an updated photo or phone number? Describe it below — use 📎 to
   attach your logo or a photo — and it goes straight to our website team, who update your live site,
   usually the same day." Add a 📎 file attachment (image/PDF, size limit; Supabase Storage, private bucket,
   tenant-scoped path) and include the file link in the email to the CSM/website team.
4. **Security Alerts / Audit Logs:** filter and group by **date, time and week** (Today / This week /
   Last 7 days / custom range), clear date format (dates currently render as DD/MM and read like
   February), and human-readable details instead of raw JSON.
5. **Staff:** add an **Edit** button per staff member (name, email, role). Hide "Disable" on your own
   account. Changing an email must also update Supabase Auth (`auth.admin.updateUserById`).
6. **Tracking:** client now wants the Google Sheet **embedded** in the portal (this reverses answer 3.5).
   Embed the sheet in an iframe (`.../edit?rm=minimal` or `/preview`) with "Open in Google Sheets" as
   fallback; the viewer must be signed in to a Google account that the sheet is shared with.
7. **Admin dashboard:** rename the "GHL not connected" card to **"GHL connect"**; clicking it opens a list
   page of clients split into **Connected** and **Not connected** (with Location ID, link to set it).
8. **CSM:** the client himself is the first CSM. Create his account in Admin → Staff once he gives his
   @motionz.ai email; later support one booking calendar per CSM (see answers table).
9. **Two dealer-support forms** (client screenshots, OnyaRoof style): **Lead Replacement Form** and
   **Unresponsive Lead Form**, added at the end of the client nav / Tools. Per the decision above, these
   should be **GHL forms embedded** with dealer name, client ID and email pre-filled. Need from the client:
   the GHL form links (or confirmation that we should build them in GHL), and whether the "checked against
   the replacement rules straight away" logic is a GHL workflow or must be built in the portal. Rules from
   the screenshots: replaceable = cancelled before inspection and can't be rebooked, wrong contact info,
   not the homeowner, outside area, roof doesn't qualify (not asphalt shingle or under 4 years old),
   homeowner refused inspection; not replaceable = qualified roof inspected and they didn't buy.
   Unresponsive: submit from day 4 with no response after calling twice a day during the 7-day sequence.
**Developer decisions on round 2 (2026-10-03):**
- Logo: use the client's image as is for now. File from the chat:
  `C:\Users\Heshan\AppData\Local\Temp\claude\C--Gloma-motionz-onboarding-portal\76e42fbe-cce6-47f6-ba85-e717cc986ed9\images\10.webp`
  (copy into `public/brand/` and generate favicon/app icons from it; ask the client for a transparent version later).
- Tracking: embed the sheet **and** keep an "Open in new tab" button.
- **SKIPPED FOR NOW (2026-10-03): do not build item 9 until the developer says so.** Notes kept for later:
  Lead Replacement + Unresponsive Lead forms: **we create them in GHL** (Motionz Your Rejuvenation,
  since requests go to the Motionz marketing team), embed them in every client portal with dealer name,
  client ID and email pre-filled, and send submissions to the portal via webhook events
  `lead_replacement` / `unresponsive_lead` so the client and staff can see past requests and their status.
  How "checked against the rules straight away" works is still open (see questions).
- CSM account for the client: skip on staging.

10. **UI pass:** open every page (admin, CSM, client; desktop and 375px) and fix alignment, spacing and
    inconsistent components/colours (several pages still use inline styles and hardcoded `#2563eb`).

## Waiting on the client (see `docs/CLIENT-QUESTIONS.md` and the Google questions sheet)
- **"Lead form"**: client asked for a date and mentioned a "lead form". It's unclear whether it's the existing onboarding form, a Facebook lead form, or a **new website lead / roof-quote form** (possible new scope). Clarification message was drafted; don't estimate until answered.
- Media buyer email(s) and what "Facebook campaign launch" means.
- Which GHL calendars count as CSM calls (currently only "Motionz - Reviews Meeting").
- CSM names/emails (create via Admin → Staff), and which sub-accounts are real clients.
- Contracts (from GHL Documents? team visibility? download?) and Orders (what ships? keep page?).
- Video scripts: asked the client to explain the flow first (purpose, who writes/makes videos).
- Solar API key; DNS records for the email domain.
- Production accounts (Vercel, Supabase, Google, Resend) owned by the client.

## Going to production (checklist)
1. Client-owned Supabase: run `supabase/migrations/*` in order (skip `supabase/seed/demo_data.sql`).
2. Client-owned Vercel: set env vars listed in `docs/FINAL-REPORT.md`; new `SESSION_SECRET` and `GHL_WEBHOOK_SECRET`.
3. Re-deploy the Apps Script under the client's Google account (new secret, their template and folder).
4. Verify the email domain in Resend; set `EMAIL_FROM_ADDRESS`.
5. Update the `secret` value in all GHL workflows (and the snapshot) to the new `GHL_WEBHOOK_SECRET`, and the URL if the domain changes.
6. Create real admin/CSM accounts via Admin → Staff; remove test accounts.
