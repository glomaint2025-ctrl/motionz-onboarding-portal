# Handover: Motionz Client Portal

Read this first, then `docs/FINAL-REPORT.md` (what the portal does), `docs/CLIENT-QUESTIONS.md`
(open client questions) and `docs/07-integrations/ghl-workflows.md` (GHL setup).

## Current state (6 Oct 2026, read this first)
- Standard setup has **4 steps**: Google Sheet, GoHighLevel / A2P Verified, Domain/email/website, Phone system & A2P texting (Facebook step removed).
- Each client has their own Drive folder holding their tracking sheet and their own **Money Leak Calculator** copy; Results Tracking embeds both. Renaming a client renames the folder and files. Older clients: Admin > client > **Finish Google files setup**. Details and script redeploy steps: `docs/07-integrations/google-sheets.md`.
- Local dev runs on **port 3001** (`.claude/launch.json` "portal-dev"); it uses the staging database, so local and staging share data.
- Test logins live in `.env.local` (`TEST_CSM_PASSWORD`, `TEST_CLIENT_PASSWORD`, `TEST_MEMBER_PASSWORD`); never commit them. Test CSM `heshantharushka2002+csm@gmail.com` works only because of `STAFF_EXTRA_EMAILS`, which is **staging only: remove it for production**.
- Supabase GET responses are not cached (`cache: 'no-store'` in `src/lib/db/supabase-client.ts`); Next 14 had cached them for a year.
- Scripts: `clear-test-clients.mjs [--only=<id>] [--apply --yes-this-is-staging]`, `simulate-ghl-webhooks.mjs <what> --location=<test client location id> --email=<test client email>`, `clear-simulated-ghl-data.mjs`, `remove-facebook-step.mjs`.
- **Deployed to staging on 5 Oct** with this branch. Vercel production env now has `GOOGLE_SOLAR_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `STAFF_EXTRA_EMAILS`, `NEXTAUTH_URL`. Never add `EMAIL_TEST_REDIRECT_TO` or `TEST_*` there.
- Optional SQL (app works without): `ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS full_name TEXT; ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS allowed_modules TEXT[];`
- **Contract reminder (staff only):** while a client has no contract, admins see a notice on the client's Contract card, a "No contract attached" dashboard card and a "No contract" tag in the Clients list; CSMs see the tag and an "ask an admin" notice on the setup page (`hasContract` in the staff APIs, one query via `contractRepository.listTenantIdsWithContract()`; never sent to clients).
- **Notification emails per team:** the `notifications` setting has three lists (onboarding form, `website_request_recipients`, `lead_form_recipients`) edited on Settings & Integrations; website change requests go to the CSM (or all admins if none) plus the website list; the lead list is stored but unused until the lead forms exist (`leadFormRecipients()` in `src/lib/onboarding/submissions.ts`).
- Test results: `docs/E2E-TEST-REPORT.md`.
- **Waiting on the client:** media buyer email(s); second CSM calendar id; contract-signed automation; Discord item 27 ("7 days then delete"); Lead Replacement and Unresponsive Lead forms; CSM account for the client; production accounts; Google API key restriction; production Google account for the Apps Script.

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
| Google Sheets | Apps Script web app (`scripts/google-apps-script/create-client-sheet.gs`) runs under Heshan's Google account; creates one folder per client inside Drive folder `1rfpLmUMN5AJqjN2oND5eQGeoH1KPmCGZ`, copies the "Data Sheet - [TEMPLATE]" and the Money Leak Calculator template into it and shares both with the client (script property `CALCULATOR_TEMPLATE_ID` is required; see `docs/07-integrations/google-sheets.md`) | Works, tested |
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

## Decision reversed on 7 Oct 2026: the onboarding form is native (built into the portal)
The client asked for it in so many words: *"I meant them filling out the form IN the portal and us
seeing the answers on the portal, not on GoHighLevel."* So the onboarding form is no longer a GHL
form in a pop-up. **GoHighLevel no longer receives onboarding answers.** The texting (A2P) form and
the two Leads forms are unchanged and still follow the section below.

- **Questions:** `src/lib/onboarding/form-definition.ts` is the one place (5 sections, 31 questions,
  copied from the GHL form "Onboarding Rejuvenation | Forms"; 13 required). The page and the server
  check both read it. To add, remove or reword a question, edit that file — a developer change now,
  not a GHL edit. Answers are stored under the question **label**, so old GHL submissions and new
  ones display the same way; if a label is reworded, add the old wording to that field's `aliases`.
- **Page:** `/portal/[clientId]/onboarding/form` (Setup Progress → "Open onboarding form" /
  "Update your answers"). Pre-fills from the client record and from the newest earlier submission;
  keeps an unsent draft in the browser (`localStorage`, per client; text only, never files).
- **API:** `POST /api/portal/[clientId]/onboarding-form` (multipart). Checks every answer
  (`src/lib/onboarding/form-validation.ts`), 10 sends an hour per person, same answers within
  10 minutes ignored. Creates an `onboarding_submissions` row (`ghl_contact_id` empty, `answers`
  carries `_source: "portal"`, which is never displayed), writes audit action
  `onboarding.form_submitted` and sends the same notification emails as before.
- **Files:** private Supabase Storage bucket **`onboarding-files`**, created by the app on the first
  upload (`src/lib/storage/onboarding-files.ts`). Path `<tenantId>/<random folder>/<file name>`.
  PDF, PNG, JPG, WEBP, CSV, XLSX, DOCX, TXT; 5 files per upload question; **4 MB in total** per
  submission (Vercel's request limit). No video — clients are told to send videos on Slack.
  `answers` holds `[{ name, path, size }]` per upload question; people open a file through
  `GET /api/portal/[clientId]/onboarding-files?path=…`, which checks access and redirects to a
  signed link valid for 5 minutes. No migration and no new env var.
- **Shared code:** `src/lib/onboarding/submissions.ts` holds the duplicate check and the notification
  emails; the portal form and the GHL webhook both call it.
- **GHL side:** the webhook event `onboarding_form` still works, so nothing breaks if the old
  workflow `Portal: onboarding form` fires, but clients can no longer reach the GHL form from the
  portal. Set that workflow to Draft. **Any GHL automation that started from that form submission
  (Skool invite, Facebook launch steps, tags, contact fields) no longer starts** and needs another
  trigger — see `docs/07-integrations/ghl-workflows.md` section 3. Tell the client.
- **Admin → Settings & Integrations:** the "GoHighLevel forms" card has no Onboarding form row any
  more; `onboarding_form_id` and `PORTAL_LINKS.onboardingFormId` were removed (the API ignores the
  field if an old page sends it). "Onboarding forms without a client" only ever lists GHL
  submissions; portal submissions always belong to a client.

## Earlier decision (still true for the texting and Leads forms): forms stay in GHL
All other client-facing forms stay **GHL forms embedded in the portal** (iframe, email/name pre-filled via URL
params). The client edits forms only in GHL; the GHL "Form Submitted" workflow sends the submission to
`/api/webhooks/ghl` and the portal stores **every field generically** (`onboarding_submissions.answers`
JSONB, keyed by GHL field label). New or renamed GHL fields therefore need **no portal code or DB
change**. Keep this design for any new form (add a new `customData.event` value per form type).
**Done:** the client sees their own submitted answers (read-only) on **Setup Progress**, in the
"Tell us about your business" card: "Submitted <date, time>", **View your answers**, and the form
button becomes **Update your answers**. Data comes from `GET /api/portal/[clientId]/onboarding-answers`
(needs the Setup Progress module; own client only; newest 10). The list of webhook-only fields that
are never treated as answers lives in `src/lib/onboarding/answers.ts` and is used both when a
submission is stored and when it is shown (`displayAnswers`, which also orders answers like the form
and turns uploaded files into download links).

### Where form links are managed (no developer needed)
**Admin → Settings & Integrations → "GoHighLevel forms".** An admin pastes a form link, the `<iframe>`
embed code or the bare ID (in GHL: Sites → Forms → the form → Integrate/Share → copy link) and saves.
The portal keeps only the form ID and shows the form straight away:

| Form | Shown on | Can be empty? |
|---|---|---|
| Texting registration form | Setup Progress → "Open texting form" | No (built-in default) |
| Lead replacement form | Leads → "Request a lead replacement" | Yes (empty = button hidden) |
| Unresponsive lead form | Leads → "Report an unresponsive lead" | Yes (empty = button hidden) |

- Stored in `app_settings`, key `forms` (`FormSettings` in `src/lib/ghl-forms.ts`, read through
  `getFormSettings()` / `resolveFormSettings()` in `app-settings.repository.ts`). No migration needed.
  `PORTAL_LINKS.a2pFormId` is now only the default for that setting.
- `parseGhlFormId()` turns pasted text into an ID. API: `GET/PUT /api/admin/settings/forms` (admin only,
  audit action `settings.forms_updated`).
- The portal gets the IDs from `forms` in `GET /api/portal/[clientId]/data` (Setup Progress) and from
  `GET /api/portal/[clientId]/forms` (Leads page; also returns the email to pre-fill). The two Leads
  forms are left out for anyone who cannot open the Leads section.
- Every GHL form pop-up is `src/components/portal/GhlFormModal.tsx`. To add another GHL form: add a key to
  `FormSettings` + `FORM_SETTING_FIELDS`, then open it with `GhlFormModal` where it belongs.
- Saving a link only makes the form **appear**. To get its submissions into the portal, the form still
  needs its own GHL "Form Submitted" workflow → `/api/webhooks/ghl` (see the paragraph above).

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
3. Re-deploy the Apps Script under the client's Google account (new secret, their tracking and calculator templates, their parent folder). Steps: `docs/07-integrations/google-sheets.md`.
4. Verify the email domain in Resend; set `EMAIL_FROM_ADDRESS`.
5. Update the `secret` value in all GHL workflows (and the snapshot) to the new `GHL_WEBHOOK_SECRET`, and the URL if the domain changes.
6. Create real admin/CSM accounts via Admin → Staff; remove test accounts.
