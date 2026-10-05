# Session handoff, 5 Oct 2026 (read this first)

Branch `phase-1-staging`, everything below is committed (last commit `b819774`). **Not pushed, not deployed.**
Background: `docs/E2E-TEST-REPORT.md` (4 Oct), `docs/HANDOVER.md` (older, update at the end), `docs/07-integrations/ghl-workflows.md`.

---

## 1. Decisions from the developer (Heshan) this session

| Topic | Decision |
|---|---|
| B. Facebook setup step | **Removed** (client does not manage clients' Facebook). Standard template now has 4 steps. Done. |
| C. "Rejuvenation Money Leak Calculator" sheet (`1pDXSCpnGIJXLnXheL-yQofUWvZ8mSDk-YM6nLl_pZrw`, view-only, public link) | **One shared sheet for every client for now**, embedded + "Open in new tab" as a second section on Results Tracking. Link lives in `src/lib/portal-links.ts` (`moneyLeakCalculatorSheet`). Client may later want per-client copies; wait for Heshan. Done. |
| Deploy to staging | **Approved**, after local testing passes. |
| End of work | Commit + **push branch** `phase-1-staging` (do not merge to main). |
| GHL live test | Approved for the **Zydeco** sub-account only (create/move/delete a test contact + opportunity). In "Motionz Your Rejuvenation" only one calendar booking + one form submission with the test client's email. **Never change other sub-accounts or any workflow**; if a workflow is wrong, tell Heshan the exact fix. Check that webhooks fire and data syncs. |
| Emails | All test email must go to Heshan's Gmail. Test CSM is `heshantharushka2002+csm@gmail.com` (allowed by new env `STAFF_EXTRA_EMAILS`). Onboarding notification list = `heshantharushka2002@gmail.com`, "also email the CSM" ticked. Read Gmail only for Motionz mails (from no-reply@mail.motionz.ai). |
| Success dialogs | **No green "status" boxes and no invite links on success.** One plain sentence; the link/Copy button only when the email failed. (Done for Add client, Team invite/resend, admin client invite/resend.) Short "Saved." confirmations after a save were kept; ask Heshan if those should go too. |
| Discord item 27 ("7 days then delete") | Still unclear, do not build. |

---

## 2. What was changed this session (code)

- Facebook step removed: migration `supabase/migrations/20261005000001_remove_facebook_step.sql` (already applied to staging **data** with `scripts/remove-facebook-step.mjs`), mock data, seed, tests, "of 5" copy. "Needs action" filter is now "Still to do"; Home wording no longer mentions client actions; "Current step".
- Money Leak Calculator section on Results Tracking.
- `STAFF_EXTRA_EMAILS` (exact extra staff addresses, staging only; leave unset in production). Staff accounts can no longer sign in through the client path.
- **Serious bug fixed:** Next.js 14 cached Supabase GET responses for a year (stale users/tenants, permissions, phone…). All Supabase requests now `cache: 'no-store'` (`src/lib/db/supabase-client.ts`).
- `/data` API no longer sends setup steps, pending invites or the sheet link to a team member without those pages.
- Suspension messages: a person whose own access is off sees a generic message (the private reason stays private); a suspended client shows the client's reason to everyone (client check runs first).
- Clients list: row menu stays on screen in card layout, "Manage client", emails shorten with "…", duplicate gauges removed (admin + CSM), shorter search hint.
- Staff welcome email/page no longer mention a "Staff tab".
- Staff previewing a portal see the client contact's name in the hero.
- Branded 404 page; "This portal is not available to you" instead of "Something went wrong" for no-access; "This client is not assigned to you".
- Accessible names on Edit/Disable/Send again/Cancel invite/Edit step/Delete script buttons.
- Leads: closed stages (Sold/Lost…) show "-" instead of a follow-up day.
- Unmatched onboarding-form email says to link it and opens Settings & Integrations.
- Team page confirms access changes / access off-on / cancelled invites.
- Company Profile: old error clears on edit; member sees "The main email for this business".
- Audit log details show words ("Pain point", "Google sheet"), hide redundant "event".
- Script grammar "property's" (migration `20261005000002_script_wording_fix.sql`; staging already fixed via the admin UI).
- `scripts/clear-test-clients.mjs` (dry run without `--apply`), `scripts/simulate-ghl-webhooks.mjs` (local/staging simulated GHL events).

`npx tsc --noEmit` clean after every change. Individual suites run green; **full `npm test` and `next build` not yet re-run after the last changes** (do it).

---

## 3. Local test results so far (http://localhost:3001, staging database)

| Area | Result |
|---|---|
| Sign-in: empty (browser blocks), wrong password, correct | Pass |
| Settings: notification emails (bad email refused, Gmail saved), sign-in code Off → CSMs only → Off | Pass |
| Staff: add (non-staff Gmail refused, +csm added, welcome email in Gmail, set password via link incl. mismatch), edit name, bad calendar ID refused, enable/disable Test CSM Two with dialog | Pass |
| Add client: empty, incomplete email, bad phone, staff email refused, CSM by keyboard, create → invite email in Gmail, Google Sheet created in Drive | Pass |
| Clients list: search hit/miss, every status filter, CSM filter, paging (11 temp clients via script, removed), 1280/1024 layout | Pass after fixes |
| Client detail: blank name, bad phone, sections on/off (Roof hidden + direct URL redirects), CSM change persists, contract bad link refused / attach / shows to client / remove | Pass |
| Client owner: accept invite (short password refused), used/cancelled links refused, Home, website request (empty, bad URL, without and with attachment → both emails in Gmail, attachment link downloads) | Pass |
| Setup Progress: 4 steps, filters, onboarding + texting forms (email prefilled, outside click keeps open, Esc closes) | Pass |
| Leads: empty state; 8 simulated leads, stage change, search, stage filter, counts | Pass (simulated webhooks) |
| Results Tracking: client sheet and calculator both load | Pass |
| Contract, Tools, Book a Call (calendar + prefill), Video Scripts (both modes, pick 3, reload), Roof (empty, unknown, real), Company Profile (bad phone, blank name, save) | Pass |
| Team (owner): bad email, no pages refused, invite with name + 2 pages, send again, cancel invite, change access, access off/on | Pass after fixes |
| Team member: accept invite, sees only allowed pages, blocked URLs redirect, blocked APIs 403 | Pass after fix (/data) |
| CSM: sign-in with emailed code (wrong code refused, code from Gmail works), My Clients, edit step (blank refused, Done → 25%), portal as staff, admin pages/APIs refused, other CSM's client refused (temp client via script, removed) | Pass |
| GHL Connect: bad Location ID refused, Zydeco ID saved | Pass |
| Simulated webhooks: wrong secret 401, leads, stage, CSM call (Next CSM Call on Home), onboarding form (answers on admin page, emails to Gmail + CSM), unmatched form linked in Settings | Pass |
| Portal Templates: blank refused, edit + revert | Pass |
| Video Scripts admin: edit (grammar fix), add (empty refused), delete with confirm | Pass |
| Audit Logs (ranges, search) / Security Alerts (severity) | Pass |
| Admin: member permissions view, disable/enable member, suspend client (reason shown to owner + member), reactivate | Pass after fix |
| **Archive client** | **FAIL: after archiving, the owner can still sign in (login API returned 200). The dialog says the team cannot sign in. Not fixed yet.** |

## 4. Open issues / notes (not fixed)

1. **Archived client can still sign in** (see above). Check the login route and `assertActiveAccount` for `tenant.status === 'archived'` / `deleted_at`, fix, add a test, re-test, then **Unarchive Zydeco** (it is archived right now).
2. Step 1 "Google Sheet" stays "Not started: We are setting up your tracking sheet" while Results Tracking already says "Ready" (sheet is created automatically). Ask Heshan whether the step should be marked Done automatically when the sheet is created.
3. Members' "Company Profile" is read-only (fine) and visible to every member regardless of page choices (by design?).
4. A throwaway test sheet "Dialog Check Roofing (test) - Tracking" is left in the Drive folder; delete it by hand if wanted.
5. Leads "By stage" order is New → Day N → others A–Z → closed (portal cannot know GHL pipeline order). OK unless Heshan wants otherwise.
6. Browser tooling: in the built-in browser, viewport emulation (resize_window) breaks typing, and screenshots often lag one frame. For layout checks at 1280/1024 load the page in a same-origin iframe of that width scaled to fit, and take two screenshots.

## 5. Current state of data / environment

- Local app: `.claude/launch.json` `portal-dev` → **http://localhost:3001** (port 3000 is another project). `NEXTAUTH_URL` for it is 3001. Uses the STAGING Supabase database, so staging and local share data.
- Staging client: **Zydeco Roof Revival** (id `5dffb48f-f4af-4611-bd0e-bb4ededbc1a6`), owner `heshantharushka2002@gmail.com`, member Sam `heshantharushka2002+team@gmail.com` (Leads, Results Tracking, Video Scripts), CSM `heshantharushka2002+csm@gmail.com` ("Heshan (Test CSM)"), Location ID `TG1QAGQkANvoJ3UdmZRZ` saved, **status: ARCHIVED (unarchive it)**, 8 simulated leads (@example.com), 1 simulated CSM call, 2 onboarding submissions (1 simulated + 1 linked unmatched), step 1 Done, contract removed. Before the live GHL test clear the simulated data (or recreate the client with `scripts/clear-test-clients.mjs`).
- Staff: admin@motionz.ai (password in HANDOVER), Thomas csm@motionz.ai (no clients), Test CSM Two (disabled), Heshan (Test CSM).
- Test passwords for the Gmail-based test accounts are in `.env.local` (`TEST_CSM_PASSWORD`, `TEST_CLIENT_PASSWORD`, `TEST_MEMBER_PASSWORD`). Never print them in chat.
- Settings: notification list = Heshan's Gmail, notify CSM on, sign-in codes **Off**.
- In the browser the session cookie is currently the **client owner** (a login API check replaced the admin session) – sign out and sign in as needed.

---

## 6. What is left to do (in order)

1. Fix the archive sign-in bug (§4.1), unarchive Zydeco, re-test archive/unarchive (owner + member refused while archived, allowed after).
2. Run `NEXTAUTH_URL=http://localhost:3000 npm test` (all suites) and `npx tsc --noEmit`. Stop the dev server → `npx next build` → delete `.next` → start the server again. Never build while the server runs.
3. Phone width (375px) check of the main pages: admin dashboard, clients list (cards + row menu), client detail, staff, GHL Connect, client Home, Setup Progress, Leads, Results Tracking, Team, Video Scripts, Book a Call, CSM My Clients and setup page. No sideways scroll, menus on screen, dialogs fit.
4. Remaining local checks not yet done: forgot/reset password flow (unknown email same answer, bad link refused, valid link works once – email in Gmail); admin client-detail **Invite** (new dialog: one sentence, no link) and admin **Send again**; client Team invite dialog new wording; Staff "Default booking calendar" save (bad + valid, then restore `SRn2ONyB295xnnPR5JwR`); admin dashboard numbers vs real data; 1280px/1024px check of CSM clients table, client Team table, GHL Connect inline editor, admin dashboard tiles.
5. Deploy to staging (approved):
   - Vercel env (production): `GOOGLE_SOLAR_API_KEY`, `EMAIL_FROM_ADDRESS=no-reply@mail.motionz.ai`, `EMAIL_FROM_NAME=Motionz` (values from `.env.local`), and `STAFF_EXTRA_EMAILS=heshantharushka2002+csm@gmail.com` (staging only, must be removed for production). **Never** add `EMAIL_TEST_REDIRECT_TO` or the `TEST_*_PASSWORD` values.
   - `npx vercel --prod --yes`.
   - Ask Heshan to paste in Supabase SQL editor (optional, app works without): `ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS full_name TEXT; ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS allowed_modules TEXT[];` Migrations `20261005000001/2` are already reflected in staging data.
   - Short smoke test on https://motionz-onboarding-portal.vercel.app: sign-in admin, client Home/Results Tracking (both sheets), Leads, CSM sign-in, Book a Call, one website request email, 404 page.
6. Live GoHighLevel test on staging (Heshan is signed in to GHL in the browser):
   a. Zydeco client exists on staging with Location ID (same DB). Clear the simulated leads/call/forms first.
   b. Zydeco sub-account → Automation → Workflows: confirm **"Portal: sync leads"** exists, is **Published**, triggers Opportunity Created + Pipeline Stage Changed, webhook URL = `https://motionz-onboarding-portal.vercel.app/api/webhooks/ghl`, custom data `secret` (value must equal Vercel `GHL_WEBHOOK_SECRET`; do not print it) + `event=lead` + `stage`. Read-only; report problems to Heshan.
   c. In Zydeco create a test contact (name "Portal Test", email `heshantharushka2002+ghltest@gmail.com`) + opportunity in the pipeline → check it appears on the client's Leads page with the right stage. Move it through 2–3 stages → stage updates each time, no duplicate lead. Check Admin → GHL Connect "Last lead received". Delete the test contact/opportunity in GHL afterwards (and note the lead stays in the portal; delete it from the DB if wanted).
   d. In "Motionz Your Rejuvenation": book ONE call on "Motionz - Reviews Meeting" (the portal's Book a Call page embeds it; use the client's email `heshantharushka2002@gmail.com`) → "Next CSM Call" on client Home shows the right time; check the booking confirmation; cancel the booking afterwards if Heshan wants (ask).
   e. Submit the onboarding form ONCE from the portal (Setup Progress → Open onboarding form, email prefilled `heshantharushka2002@gmail.com`, mark answers "TEST") → answers on Admin client page and CSM setup page, notification email in Gmail (to Gmail list + CSM +csm).
   f. Admin → Audit Logs shows each GHL event (lead, stage change, csm_call, onboarding_form) as "received from GoHighLevel", matched to Zydeco.
   g. If a workflow does not fire: check GHL workflow execution logs (read-only), report the exact fix.
7. Update `docs/E2E-TEST-REPORT.md` (new section for 5 Oct + live GHL) and `docs/HANDOVER.md` (4 steps, calculator, STAFF_EXTRA_EMAILS, cache fix, port 3001, test accounts, scripts), delete or fold this handoff file into them, commit, **push `phase-1-staging`**.
8. Final short report to Heshan: passed, failed+fixed, waiting on client (media buyer emails, second CSM calendar id, contract-signed automation, Discord item 27, production accounts, Google API key restriction, per-client calculator?), not testable and why.

## 7. Full end-to-end checklist (verify everything, every input)

Post "Now testing: <flow>" in chat before each flow. Click through the real UI; use scripts only where the UI cannot (say so).

**Auth**: sign-in empty / wrong / right / redirect-back; staff code on (wrong code, code from Gmail, resend timer, "use a different account"), code off; forgot password (unknown email same message, email arrives, link sets password, link reused refused, mismatch + short password refused); sign out everywhere; 404 page; suspended/archived/disabled messages.

**Admin**: Dashboard tiles match data, links work; Clients search/filters/paging/per-page, row menu (Manage client, Suspend, Archive) on desktop and phone; Add client every field (blank, bad email, staff email, bad phone, CSM by keyboard, sections), success dialog wording, invite email, sheet created; Client detail: name/phone validation, status, sections on/off reflected in portal + direct URL, CSM change (CSM sees/loses client), GHL ID link, tracking sheet link, onboarding answers, contract (bad link, attach with/without signed date, client sees "Awaiting signature"/signed, remove), team (Invite owner/member, permissions view/save, disable with reason, enable, send again, cancel invite), suspend (reason shown on sign-in to owner + member), reactivate (members back, individually disabled stay disabled), archive (nobody can sign in), unarchive; GHL Connect (bad ID, save, change, open client, last lead time); Staff (add validation, welcome email, set password, edit name/email/role/calendar, bad calendar, default calendar, disable/enable, cannot disable self); Portal Templates (edit each field, blank refused, owner dropdown, revert); Video Scripts (add per category, empty refused, edit, delete confirm, client sees change); Settings & Integrations (notification list validation/save, notify CSM toggle, sign-in code modes incl. "All staff", unmatched forms link, connected services); Audit Logs (Today/Yesterday/This week/7/30/custom, search, Show raw, friendly labels); Security Alerts (ranges, severity, search).

**Client owner**: invite acceptance; Home (hero step N of 4, %, current step, tiles, next call, contract state, CSM card, website request: empty, bad URL, valid, 1–3 attachments, >4 MB refused, wrong file type refused, email to CSM with links); Setup Progress (filters, forms, step actions); Leads (empty/not connected, list, search, stage chips, paging, Day counter/closed "-", Past day 7); Results Tracking (own sheet + calculator, open in new tab); Contract; Tools links; Video Scripts (AI/Self-Filmed, pick/replace/remove pick, copy script, reload persists); Roof (empty/unknown/real, recent list); Book a Call (CSM's calendar, prefill, open in new tab); Company Profile (validation, save, clear phone); Team (all of §3 + member limits).

**Team member**: accept, allowed pages only, blocked URLs redirect, blocked APIs 403, read-only profile, cannot invite, access off message, access on again.

**CSM**: sign-in (code on/off), My Clients search/filter, setup step edit (each field, blank refused, status), onboarding answers visible, open portal as staff (greeting = client contact), admin pages/APIs refused, other CSM's client refused, website-request email "Open client" link works.

**Responsive**: 375px, 1024px, 1280px for all main pages (no sideways scroll, menus/dialogs on screen, tables → cards on phone).

**Integrations**: Gmail (every email: invite, staff welcome, sign-in code, reset, website request, onboarding notification, unmatched), Google Drive (sheet created + shared), GHL live (§6), audit log for each.
