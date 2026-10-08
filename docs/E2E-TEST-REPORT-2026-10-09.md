# End-to-end test report: staging, 9 Oct 2026

Staging: https://motionz-onboarding-portal.vercel.app (commit `583bc0e`, region sin1, database Supabase Singapore).
Tested by the Browser test session in a real browser, signed in as CSM Manager, CSM, client owner and team member, on test accounts (Apex Shield, O'Brians Contracting and a throwaway client "ZZ Staging Test Roofing"). Real Gmail was used for the emails.

## Result in one line

Everything tested passed. One small bug was found and fixed during the run. The GoHighLevel tag flow was **not tested** (the tester's permission system blocks writing to GoHighLevel accounts) and still has to be done by hand.

## Staging is up to date

No code difference between the deployed staging build and the latest code except the fix below (`583bc0e`).

## Passed

| Area | What was checked |
|---|---|
| Sign-in | Staff and client sign-in, wrong password messages, forgot password email and reset link, sign out/in with the new password |
| My profile | Photo, name, phone, read-only email, password card (wrong current password, mismatch, success) |
| Admin pages | Dashboard, Clients (search, no-match message, rename), Staff (add, roles CSM / CSM Manager / Tech, delete), Settings & Integrations, GHL Connect (rule shown), Portal Templates, Video Scripts, CSM Training, Audit Logs, Security Alerts |
| Client record | Contract: upload PDF, paste link, Mark as signed, Mark as not signed, Remove; Re-sync Drive access ("Access is up to date"); lead requests card |
| CSM | My Clients, setup page, Training in order (lesson 2 locked until lesson 1 finished, progress 50% then complete) |
| Client portal | Invitation email and activation (password mismatch message), all sidebar pages, onboarding form (validation, file attach, submit, reopen prefilled, update, resend), Lead Replacement ("30 characters" rule, instant result Approved), Unresponsive Lead form |
| Team member | Invite email, sign-in, sees only allowed pages; typing /contract or /team goes to Home |
| Slack | "Send a test message" and both lead forms arrive in #reviews-team |
| Embeds | Results Tracking shows the sheet and calculator; Book a Call widget loads; Tools loads |
| Emails received | Client invitation, team invite, onboarding form submitted (twice), Drive "shared with you", password reset |
| Phone width 375 px | No sideways scrolling on the admin pages and the client pages listed above |

## Bug found and fixed

| Bug | Fix |
|---|---|
| Admin client page, Contract card: after Mark as signed and Remove, the next contract added by link showed "Signed on" with the old date until the page was reloaded (the form kept the old date) | The date is cleared when a contract is removed and the date field is rebuilt when the form changes. Deployed as `583bc0e` and retested: pass |

## Findings that need no code change

1. Emails to `zz.csm@motionz.ai` did not arrive. Not a bug: that address is not a real mailbox, and staging does not redirect emails. Emails to real addresses arrive.
2. Adding a staff member with a non-Google address shows a Drive warning. Expected: Drive only shares with Google accounts.
3. The CSM Training page says "Finish every lesson to unlock My Clients" because the staging setting "CSMs must finish training" is ON. Wording is correct. Turn the setting off in CSM Training if this is not wanted yet.
4. A client without leads sees an empty "Pick from your leads" list and types the lead name by hand.

## Open

| Item | State |
|---|---|
| GoHighLevel tag flow (tag `qualified` adds the lead, removing the tag or marking Lost removes it, an untagged contact is ignored) | **Not tested.** Do it by hand in a test contact, then check Admin → GHL Connect → Last events. Portal side is ready: rule is on, 3 clients connected, no real event has arrived since the rule was turned on. |
| Staff sign-in took 20+ seconds once for the tester, right after a password reset and a role change | **Not reproduced.** Three timed sign-ins afterwards took 0.5–1.5 s in total (login request 0.4–0.8 s, page 0.2–0.5 s, no call slower than 0.8 s). Most likely a cold start of the login function after a deploy or a long idle. Report it again if it happens. |
| Two GHL workflows in the client accounts that are no longer needed (Portal: onboarding form, Portal: CSM calls) | Turn them to Draft by hand. |

## Clean-up done

The throwaway client "ZZ Staging Renamed Roofing" was deleted permanently and its Drive folder moved to the bin. The two test training lessons were deleted (while they existed, the staging setting "CSMs must finish training" would have locked CSMs out of their clients).

## Left on staging by the tests

Two Slack test messages in #reviews-team, Heshan's +csm staff login back to Tech with a changed password.
