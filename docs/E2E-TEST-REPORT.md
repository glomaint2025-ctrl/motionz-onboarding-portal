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
