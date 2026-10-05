# End-to-end test report, 5 Oct 2026 (latest)

Local app (http://localhost:3001, staging database), built-in browser, branch `phase-1-staging`. Type check, all 41 test suites and `next build` pass. Deployed to staging the same day.

## Results
| Area | Result |
|---|---|
| Archived client could still sign in | **Found and fixed**: owner and members are now refused at sign-in and on open pages ("Portal archived"); unarchive restores access. Test added. |
| Suspended client's sign-in screen | **Fixed**: now shows the reason the admin typed (it travels in the browser session, never the URL). |
| Sign-in, wrong password, redirect back, forgot/reset password (neutral answer, short and mismatched refused, link works once), invitation accept, sign out, 404 | Pass |
| Admin: dashboard numbers and links, Clients list, Add client (every validation, CSM by keyboard, one-sentence result, invitation email, sheet created), client detail (validation, sections off hide nav and refuse direct URL and API), invite / send again / cancel (old and cancelled links refused), suspend / reactivate, GHL Connect, Staff (duplicate refused, default calendar bad and valid), Templates, Scripts, Audit Logs, Security Alerts | Pass |
| CSM: assigned clients only, step edit (blank refused, Done changes %), staff preview bar, admin pages and APIs refused, another CSM's client refused (page and API) | Pass |
| Client owner: Home, Setup Progress (filters, onboarding form pop-up), Results Tracking (own sheet + calculator), Book a Call, Tools, Contract, Team (invite, no pages refused, send again, cancel) | Pass |
| Team member: only allowed pages, blocked URLs redirect, blocked APIs 403, password reset | Pass |
| Phone width (375px): every client and admin page, no sideways scroll | Pass after fixes |
| 1024 / 1280px: Team, Leads, admin Clients, dashboard, GHL Connect | Pass after fixes |
| Simulated webhooks: wrong secret 401, missing contact 400, unknown location ignored | Pass |
| Staging (https://motionz-onboarding-portal.vercel.app): login 200, noindex header, branded 404, webhook secret matches (bad 401, real 200) | Pass |

## Fixed this round
Archive sign-in bug; suspension reason on sign-in; Leads and Team lists become cards on phones/tablets and emails wrap only at "@" (no mid-word breaks); admin Clients table fits at laptop width and CSM names wrap between words; CSM tiles show a dash while loading; audit log shows step names and which invite was cancelled, hides "auth mode"; re-sending an invite no longer logs a confusing "cancelled".

## Live GoHighLevel test (sub-account "OBrian's Contratcing LLC", location TG1QAGQkANvoJ3UdmZRZ = Zydeco in the portal)
- Workflow "Sync leads" exists, Published, triggers Opportunity Created and Pipeline Stage Changed, with a Webhook action.
- Created a test contact "Portal Test" and an opportunity: the lead reached staging within seconds (stage "New Lead", matched to the client, audit entry written). Moving the opportunity to "Discovery Call" updated the same lead (no duplicate).
- Test opportunity and contact were deleted in GHL; the test lead was removed from the portal database.
- **Not done:** calendar booking ("Portal: CSM calls") and the real onboarding form submission ("Portal: onboarding form"); they need the Motionz Your Rejuvenation sub-account and were not run.

## Not tested, and why
- Emailed staff sign-in code settings (CSMs only / All staff): the browser would not allow changing that security setting this round. They passed on 5 Oct earlier in the day.
- Signing in on the live staging site: the browser would not allow typing a password there. Needs a manual check.
- Website request with attachments, Roof Measurement, Video Scripts, Company Profile: passed earlier on 5 Oct, not repeated.

## Notes
- Reactivating a suspended client always sets it to Active, even if it was still Onboarding.
- Step 1 "Google Sheet" stays "Not started" while Results Tracking says Ready (sheet is created automatically): decide whether to auto-mark Done.
- Leftover test sheets in the Drive folder: "Dialog Check Roofing (test) - Tracking", "Temp Check Roofing - Tracking".

---

# End-to-end test report — 4 Oct 2026

Tested on the local app (`http://localhost:3000`) against the staging database, in the built-in browser, starting from cleared data. Branch `phase-1-staging`. **Nothing from this round is deployed to staging yet.**

## Result

Every main flow works. The test found 16 issues; all are fixed and the fixed spots were re-checked in the browser. Type check, 41 automated test suites and the production build pass.

## What was tested

| # | Flow | What was checked | Result |
|---|---|---|---|
| 1 | Sign-in | Empty form, wrong password, correct password, redirect back to the page you came from | Pass |
| 2 | Add client | Invalid phone rejected; client created; invitation email sent; Google Sheet created; CSM dropdown by keyboard | Pass |
| 3 | Accept invitation | Short password and mismatched passwords rejected; valid password signs in | Pass |
| 4 | Client Home | Hero, current step, at-a-glance tiles, website change request (empty, bad URL, with attachment) | Pass |
| 5 | Setup Progress | Filters, onboarding form pop-up, texting form pop-up (email prefilled, does not close on outside click) | Pass |
| 6 | Leads | Empty state; 24 simulated leads; search; stage filter; counts | Pass after fixes |
| 7 | Results Tracking | New client's Google Sheet embedded and loading | Pass |
| 8 | Contract | Empty state; contract attached by admin appears | Pass |
| 9 | Tools & Resources | Slack, Skool, Roof, Scripts only | Pass |
| 10 | Video Scripts | AI Video vs Self-Filmed, pick a script, choice kept after reload | Pass |
| 11 | Roof Measurement | Empty, unknown address, real address | Pass |
| 12 | Book a Call | Calendar loads with name and email prefilled | Pass |
| 13 | Company Profile | Bad phone, blank name, valid save | Pass |
| 14 | Team | Bad email blocked; invite with limited access; member sees only allowed pages; server refuses blocked pages and permission changes | Pass after fixes |
| 15 | Admin clients | Search, status filter, client detail save validation, turn a section off, attach contract | Pass |
| 16 | GHL Connect | Bad Location ID rejected, good one saved | Pass |
| 17 | GoHighLevel webhooks (simulated) | Wrong secret 401; missing contact 400; unknown sub-account ignored; leads; stage change; CSM call; onboarding form; unmatched form | Pass after one fix |
| 18 | Settings & Integrations | Bad notification email rejected; link an unmatched form to a client | Pass |
| 19 | Staff | Non-Motionz email refused; bad calendar ID refused; rename a CSM | Pass |
| 20 | Portal Templates / Video Scripts (admin) | Edit a step; add and delete a script with confirmation | Pass |
| 21 | Audit Logs / Security Alerts | Date ranges, search, friendly labels, wrong-password attempt recorded | Pass |
| 22 | CSM | Sign-in, update a setup step (blank text refused), progress shows for the client, blocked from admin pages and APIs | Pass |
| 23 | Suspend / reactivate / archive / unarchive | Client and team locked out while suspended; reason shown; unarchive restores access | Pass |
| 24 | Forgot / reset password | Unknown email gives the same answer; bad link refused; valid link works once | Pass |
| 25 | Phone size (375px) | Bottom tab bar, no sideways scrolling, tables become cards | Pass |

## Second pass (same day): staff email flows, read from the tester's Gmail

A local-testing-only setting (`EMAIL_TEST_REDIRECT_TO`, ignored in production) sent every email to one Gmail inbox so the `@motionz.ai` flows could be checked.

| Flow | Result |
|---|---|
| All emails from the first pass arrived (2 invitations, password reset, onboarding-form notifications) | Pass |
| Staff emailed sign-in code: code step shown, wrong code refused ("4 tries left"), emailed code signs in | Pass |
| Add staff member: welcome email arrives, link sets the password, new CSM signs in and sees 0 clients | Pass |
| New CSM cannot open another CSM's client (setup, data, leads all 403) | Pass |
| Disable staff member: confirmation dialog, then sign-in refused | Pass after fix (was a browser pop-up; now the app's dialog) |

Also fixed: invitation email wording ("You have been invited you to…").

## Still not tested

- **Real GoHighLevel traffic.** GHL cannot reach `localhost`; this needs the staging deploy and a test sub-account (the agency has 7 real client sub-accounts and no test one).
- **Submitting the real GHL forms** (would write into a real sub-account until a test one exists).

## Issues found and fixed

1. "Internal Server Error" on every page: caused by deleting the build folder under the running dev server. Not a code bug; gone after restart.
2. Leads page said "GoHighLevel not connected" while connected with 24 leads.
3. Leads stage cards showed only two stages; now one "By stage" row with every stage in order, clickable as a filter.
4. A repeated onboarding form submission was stored twice.
5. A team invite could be sent with no pages ticked; now refused on screen and by the server.
6. A team member without Team access could still load the team list from the server.
7. A team member was greeted with the owner's name; the header showed the company or a fixed label instead of the signed-in person.
8. Error and success messages appeared out of view on long forms (add client, website request, profile, invite).
9. Admin "Add to category" on Video Scripts opened the form off-screen.
10. Admin clients table and client team table needed sideways scrolling at laptop width; the client row showed only the email domain.
11. `/csm` repeated the "My Clients" numbers; it now redirects there and the CSM menu has one entry.
12. A signed-in CSM opening an admin page landed on the sign-in page; now goes to My Clients.
13. Setup-step wording was jargon and claimed work was done on steps not yet started; rewritten in plain English (migration `20261004000003`).
14. Team invites had no name field, so members were named after their email.
15. Duplicate text: "Awaiting signature" twice, "N of 3 chosen" twice, two "Book a Call" titles; dashboard tile gap; raw timestamps and ids in log details.
16. Wording from the client's screenshots: "Nobody is stuck." is now "No clients are stuck in setup."; the Actions column header sits above its buttons.

Earlier the same day the 82-item code audit was also fixed (team permission check, unarchive, invite resend keeping access limits, password reset false success, error messages, removed duplicate pages and buttons).

## How the data flows

- **Leads** come only from GoHighLevel: a workflow in the client's sub-account sends each new lead and stage change to the portal. The 24 leads in the test client are simulated.
- **Google Sheet** is shown only on Results Tracking, embedded as-is. The portal does not read numbers from it. This matches what the client asked for.
- The test client uses the real Zydeco Location ID, but no data was read from or written to GHL.

## Before this can be called final

1. Deploy to staging (needs your go-ahead). Add to Vercel first: `GOOGLE_SOLAR_API_KEY`, `EMAIL_FROM_ADDRESS=no-reply@mail.motionz.ai`, `EMAIL_FROM_NAME=Motionz`.
2. Run two small SQL snippets on Supabase: invitation columns (`20261004000002`) — the wording migration (`20261004000003`) is already applied to staging data.
3. Live GoHighLevel test on staging with a dedicated test sub-account.
4. Still open with the client: media buyer email(s); second CSM calendar id; contract-signed automation; Discord item 24–25 ("7 days then delete"); the two lead forms (skipped for now); production accounts.
5. Old audit log entries cannot be deleted from the app by design; `TRUNCATE TABLE audit_logs;` in Supabase clears them if wanted.
