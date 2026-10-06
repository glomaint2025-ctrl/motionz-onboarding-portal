# Motionz portal: manual end-to-end test cases

Test on **staging**: https://motionz-onboarding-portal.vercel.app (Chrome). Write **Pass** or what you saw next to each case.
"A > B > C" means click A, then B, then C. "Left menu" is the side menu (on a phone: bottom bar, then **More**).

---

## 0. Accounts and passwords

Open **My PC > C: > Gloma > motionz-onboarding-portal > .env.local** with Notepad (right-click > Open with > Notepad). Do not share this file.

| Role | Email | Password |
|---|---|---|
| Admin | admin@motionz.ai | see **docs/HANDOVER.md**, line "Staging admin" |
| CSM | heshantharushka2002+csm@gmail.com | `.env.local` line `TEST_CSM_PASSWORD=` |
| Client owner (Zydeco Roof Revival) | heshantharushka2002@gmail.com | `.env.local` line `TEST_CLIENT_PASSWORD=` |
| Team member (Sam) | heshantharushka2002+team@gmail.com | `.env.local` line `TEST_MEMBER_PASSWORD=` |

If a password does not work: sign-in page > **Forgot password?** > the email arrives in your Gmail. All test emails (also +csm, +team, +anything) arrive in **heshantharushka2002@gmail.com**. In Gmail search: `from:no-reply@mail.motionz.ai`.

Tips: use a normal window for one account and an **Incognito window** (Ctrl+Shift+N) for a second account at the same time.

---

## 1. Sign-in and passwords

| # | Steps | Expected |
|---|---|---|
| 1.1 | Open the site > click **Sign in** with both fields empty | Browser says "Please fill out this field" |
| 1.2 | Email `admin@motionz.ai`, password `wrong123` > **Sign in** | "Incorrect password. Please try again." |
| 1.3 | Admin email + right password > **Sign in** | Lands on **Dashboard** |
| 1.4 | Click the eye icon in the password field | Password becomes visible / hidden |
| 1.5 | Signed out, open `.../admin/clients` directly > sign in as admin | After sign-in you land on **Clients** (back where you came from) |
| 1.6 | Top-right initials > **Sign out** | Back on the sign-in page |
| 1.7 | Sign in as CSM | Lands on **My Clients** |
| 1.8 | Sign in as client owner | Lands on client **Home** |
| 1.9 | Sign-in page > **Forgot password?** > type `nobody@example.com` > send | Neutral message (does not say the email is unknown) |
| 1.10 | **Forgot password?** > `heshantharushka2002+team@gmail.com` > send > open the Gmail "Reset your Motionz portal password" > click the button | "Choose a new password" page |
| 1.11 | Type `short` in both boxes > Save | "at least 8 characters" error |
| 1.12 | Type two different passwords > Save | "Passwords do not match" |
| 1.13 | Type the same new password twice > Save | "Password updated" > sign in works with it. **Update `TEST_MEMBER_PASSWORD` in .env.local** |
| 1.14 | Open the same reset link from Gmail again | Refused: the link works only once |
| 1.15 | Open `.../this-page-does-not-exist` | Branded "Page not found" + **Go to my home page** |

---

## 2. Admin: Dashboard (sign in as admin)

| # | Steps | Expected |
|---|---|---|
| 2.1 | Left menu > **Dashboard** | Tiles: Active clients, Still in setup, GHL Connect x / y, Security events (7 days), New clients (30 days). Numbers match the Clients page |
| 2.2 | Click each tile | Opens the matching page (Clients, GHL Connect, Security Alerts…) |
| 2.3 | Cards "Stuck in setup" and "No CSM assigned" | Plain sentences, no errors |

## 3. Admin: Clients list

| # | Steps | Expected |
|---|---|---|
| 3.1 | Left menu > **Clients** | Tiles Total / Active / Onboarding / Archived; table: Company, CSM, Status, Setup progress, GoHighLevel, Actions |
| 3.2 | Search box: `zydeco` | Only Zydeco shows |
| 3.3 | Search: `xyz123` | "No clients match your search or filters." |
| 3.4 | **Status** dropdown: try All, Active, Onboarding, Suspended, Archived | List changes correctly each time |
| 3.5 | **CSM** dropdown > pick a CSM | Only that CSM's clients |
| 3.6 | **Clear Filters** | Everything back |
| 3.7 | On a row click **…** | Menu: Manage client, Suspend, Archive. Fully visible on screen |
| 3.8 | **Open portal** on a row | Client portal opens in a **new tab** with bar "Viewing as staff · <client>" (no "Back to Admin" link); the Clients list is still open in the first tab |

## 4. Admin: Add client (uses a NEW test client; do not use Zydeco)

Left menu > **Clients** > **Add client**.

| # | Steps | Expected |
|---|---|---|
| 4.1 | Click **Add client** with everything empty | Company name, Contact name, Contact email: "Please fill out this field" |
| 4.2 | Contact email `test@` | Browser refuses (incomplete email) |
| 4.3 | Contact email `someone@motionz.ai` (other fields filled) | "@motionz.ai addresses are for Motionz staff only…" |
| 4.4 | Business phone `call me 123` | "Enter a valid phone number, for example +1 555 234 5678." |
| 4.5 | Fill: Company `TC Roofing Test`, Contact `TC Owner`, Email `heshantharushka2002+tc1@gmail.com`, Phone `+1 337 555 0101`; **Assigned CSM** > use keyboard ↓ and Enter to pick **Heshan (Test CSM)**; leave all 9 sections ticked > **Add client** | Waits a few seconds, then dialog "TC Roofing Test is ready. We emailed the invitation to …" the line "Tracking sheet and calculator created." and only a **Done** button (no green boxes, no link) |
| 4.6 | Gmail: subject "[You're invited to the TC Roofing Test Motionz portal]" | Email with **Activate my access** button |
| 4.7 | Google Drive folder https://drive.google.com/drive/folders/1rfpLmUMN5AJqjN2oND5eQGeoH1KPmCGZ | New folder "TC Roofing Test" holding "TC Roofing Test - Tracking" and "TC Roofing Test - Money Leak Calculator", both shared with the client email as editor |
| 4.8 | **Done** | Back on Clients; TC Roofing Test listed, Onboarding, 0% |

## 5. Admin: Client detail (Clients > **…** on TC Roofing Test > **Manage client**)

| # | Steps | Expected |
|---|---|---|
| 5.1 | Clear **Company name** > **Save changes** | Refused, field required |
| 5.2 | Business phone `12` > Save | Phone error, field marked |
| 5.3 | Fix phone > untick **Roof Measurement** > Save | "Your changes were saved." Reload: still unticked |
| 5.4 | **Open portal** (opens in a new tab) > left menu / Tools | Roof Measurement is gone; opening `.../roof-measurement` sends you to Home |
| 5.5 | Back in the first tab: tick Roof Measurement again > Save | Saved |
| 5.6 | **Assigned CSM** > Thomas > Save > reload | Shows Thomas. Change back to Heshan (Test CSM) > Save |
| 5.7 | **Contract**: Title `Test agreement`, Document link `http://example.com/a.pdf` > **Attach contract** | "Document link must be a full https:// link." |
| 5.8 | Link `https://example.com/a.pdf`, leave Signed on empty > Attach | Listed as "Not signed yet · Open" |
| 5.9 | **Remove** > confirm **Remove contract** | "No contract attached yet." |
| 5.10 | **Client team** > **Invitations waiting** > **Send again** > confirm | One sentence "We emailed a new invitation…". Gmail gets a new invite; the old link no longer works |
| 5.11 | **Invite** button > email `heshantharushka2002+tc2@gmail.com` > send | "We emailed the invitation to …" |
| 5.12 | On that waiting invite > **Cancel invite** > confirm | It disappears; its Gmail link shows "This link isn't working" |
| 5.13 | **Company details > Google files** | Links **Open tracking sheet**, **Open calculator**, **Open Drive folder**, each opens the right file in a new tab; no setup button |
| 5.14 | Change **Company name** to `TC Roofing Test 2` > Save | "Your changes were saved." In Drive the folder and both files now start with "TC Roofing Test 2"; the three links still open the same files. Change the name back > Save |
| 5.15 | On a client added before per-client folders (e.g. Zydeco): **Google files** | **Open tracking sheet** plus "Still missing: calculator, Drive folder." and a **Finish Google files setup** button |
| 5.16 | Press **Finish Google files setup** | "Setting up…" then "Google files are set up."; all three links show, the button is gone. In Drive the old tracking sheet has **moved** into the new client folder (not copied) and a calculator copy is next to it |

To bring **every** older client up to date in one go instead of pressing the button on each one, a developer can run `npx tsx scripts/setup-google-files.ts --dry-run` (only lists what is missing) and then the same command without `--dry-run`. See docs/07-integrations/google-sheets.md.

## 6. Admin: GHL Connect

| # | Steps | Expected |
|---|---|---|
| 6.1 | Left menu > **GHL Connect** | "x / y connected"; Not connected and Connected lists |
| 6.2 | TC Roofing Test > **Set Location ID** > `bad id!` > Save | "The GoHighLevel Location ID looks wrong…" |
| 6.3 | **Cancel** | Editor closes, nothing saved |
| 6.4 | Zydeco row shows Location ID `TG1QAGQkANvoJ3UdmZRZ` and "Last lead received" | Matches GHL |

## 7. Admin: Staff

| # | Steps | Expected |
|---|---|---|
| 7.1 | Left menu > **Staff** > **Add staff member** empty | Fields required |
| 7.2 | Name `X`, email `someone@gmail.com` > Add | "Staff accounts must use an @motionz.ai email address." |
| 7.3 | Email `heshantharushka2002+csm@gmail.com` (already exists) | "An account with this email already exists." |
| 7.4 | **Default booking calendar ID**: `bad!` > Save default | Error about the id |
| 7.5 | Put back `SRn2ONyB295xnnPR5JwR` > Save default | Saved |
| 7.6 | **Edit** on Heshan (Test CSM) > Booking calendar ID `bad id!` > Save | Error; then clear it > Save > "Saved." |
| 7.7 | **Edit** > change name to `Heshan (Test CSM) 2` > Save, then change back | Saved both times |
| 7.8 | **Team** table | Columns **User** (name, email, and for CSMs "N assigned clients · Default calendar"), **Role**, **Status** (Active / Disabled), **Actions**. No sideways scrolling at 1024px; on a phone each person is a stacked card |
| 7.9 | Your own row (Motionz Admin) | A "You" tag next to the role; **Edit** only, no Delete button |
| 7.10 | A row that shows **Disabled** (e.g. Test CSM Two) > **Enable** | "… was enabled."; the status becomes Active and the Enable button is gone (there is no Disable button any more) |
| 7.11 | **Delete** on a CSM who has clients | Dialog "Delete <name>? …"; pressing **Delete** shows inside the dialog "<name> still looks after N clients. Give those clients to another CSM first…"; nobody is deleted |
| 7.12 | Add a throwaway staff member, then **Delete** > **Delete** | "<name> was deleted."; the row is gone; signing in with that email says it is not a staff account; Audit log shows "Staff member deleted" and their older entries are still there |
| 7.13 | **Add a staff member** form at 1024px and wider | Name, email, Role and the **Add staff member** button sit on one row; the button is the same height as the boxes and level with them |

## 8. Admin: Portal Templates

| # | Steps | Expected |
|---|---|---|
| 8.1 | Left menu > **Portal Templates** | 4 steps: Google Sheet, GoHighLevel / A2P Verified, Domain email & website, Phone system & A2P texting |
| 8.2 | Step 1 **Edit** > clear Step name > Save step | "Fill in every field before saving…" |
| 8.3 | Put the name back > change Right now text > Save > then change it back | "Saved … New clients will get this wording." |

## 9. Admin: Video Scripts library

| # | Steps | Expected |
|---|---|---|
| 9.1 | Left menu > **Video Scripts** | AI Video (3), Pain Point (5), Testimonials (5), Trustworthy (5), Bonus (5) |
| 9.2 | **Add script** > empty > Add | Fields required |
| 9.3 | Title `TEST script`, Category Pain Point, Script `Hi I'm {{client_name}} from {{company_name}}` > Add | "Added … Clients can see it now." Preview shows Jane Doe / Summit Roof Pros |
| 9.4 | **Edit** on TEST script > change text > Save | Saved |
| 9.5 | **Delete script** on TEST script > **Yes, delete** | Deleted; Pain Point back to (5) |

## 10. Admin: Settings & Integrations

| # | Steps | Expected |
|---|---|---|
| 10.1 | Left menu > **Settings & Integrations** > Notification emails `heshantharushka2002@gmail.com, bad` > Save | "Invalid email address: bad" |
| 10.2 | Put back `heshantharushka2002@gmail.com`, **Also email the CSM** ticked > Save | Saved |
| 10.3 | Staff sign-in security > **CSMs only** > Save > sign out > sign in as CSM | "Check your email" step |
| 10.4 | Type `000000` > Verify | "That code is not correct. You have 4 tries left." |
| 10.5 | Gmail "Your Motionz sign-in code" > type the code > Verify | Lands on My Clients |
| 10.6 | Sign in as admin > Settings > **Off** > Save | Saved (admin signs in without a code) |
| 10.7 | "Onboarding forms without a client" | "Nothing to review." or a list with **Link** |
| 10.8 | "Connected services" | Email, Client tracking sheets, GoHighLevel webhooks all **Connected** |

### 10b. GoHighLevel forms (same page, card "GoHighLevel forms")

Use a real form link from GoHighLevel (Sites > Forms > the form > Integrate/Share > copy link). Write down
the two IDs shown at the start so you can put them back at the end.

| # | Steps | Expected |
|---|---|---|
| 10.9 | Look at the card | Four rows: Onboarding form, Texting registration form, Lead replacement form, Unresponsive lead form. The first two say **Showing on Setup Progress** with a Form ID and a **Preview** link; the last two say **Not set — hidden from clients** (until a link is saved). **Save form links** is greyed out |
| 10.10 | Click **Preview** on Onboarding form | The GHL form opens in a new tab |
| 10.11 | Lead replacement form: type `hello` > **Save form links** | Under the box: "That does not look like a GoHighLevel form link or ID…". Nothing is saved |
| 10.12 | Clear the Onboarding form box > Save | Under the box: "This form is always shown to clients, so it cannot be left empty." Put the ID back |
| 10.13 | Lead replacement form: paste a full form link (`https://api.leadconnectorhq.com/widget/form/…`) | "Form ID: … (not saved yet)" appears under the box, with **Preview** |
| 10.14 | Unresponsive lead form: paste the whole `<iframe …>` embed code of a form > **Save form links** | "Form links saved. Clients see the change straight away." Both rows now say **Showing on Leads** and each box shows only the ID |
| 10.15 | Reload the page (F5) | The saved IDs are still there |
| 10.16 | Left menu > **Audit Logs** | Newest entry is the forms change by you (details list the forms that changed) |
| 10.17 | Clear the Unresponsive lead form box > Save | Saved; that row says **Not set — hidden from clients** |
| 10.18 | After 13.26 to 13.30 below: clear Lead replacement form too > Save | Both Leads rows say **Not set — hidden from clients** |

## 11. Admin: Audit Logs and Security Alerts

| # | Steps | Expected |
|---|---|---|
| 11.1 | Left menu > **Audit Logs** > click Today, Yesterday, This week, Last 7 days, Last 30 days | Counts change; grouped by day |
| 11.2 | **Custom** > pick two dates | Only that range |
| 11.3 | Search `client added` | Your TC Roofing Test entries |
| 11.4 | **Show raw** on an entry | Raw details open |
| 11.5 | Left menu > **Security Alerts** > Severity **Medium** | Wrong passwords / wrong codes from your tests |
| 11.6 | Search `wrong password` | Matching events |

---

## 12. CSM (sign in as CSM)

| # | Steps | Expected |
|---|---|---|
| 12.1 | **My Clients** | Only clients assigned to Heshan (Test CSM); tiles show numbers once (no duplicate %) |
| 12.2 | Search `zydeco`, then the **Show** filter | Works |
| 12.3 | Zydeco > **Update setup** | Onboarding answers + 4 steps |
| 12.4 | **Edit step** on step 2 > clear Right now > Save step | "\"Right now\" cannot be empty…" |
| 12.5 | Type text, Status **In progress** > Save | Saved; progress unchanged; client Home shows it as current step |
| 12.6 | **Open portal** | Opens in a **new tab**; staff bar "Viewing as staff · <client>" (no "Back to CSM" link); hero says "Welcome, Heshan." (client's name, not the CSM's) |
| 12.7 | Type `.../admin/clients` in the address bar | Sent to My Clients |
| 12.8 | Sign out | |

---

## 13. Client owner (sign in as the client owner, Zydeco)

| # | Steps | Expected |
|---|---|---|
| 13.1 | **Home** | Tag "STEP n OF 4 · …", "Welcome, Heshan.", % ring, Current step, tiles Total Leads / Next CSM Call / Results Tracking / Contract, Website Change Request, Your CSM |
| 13.2 | Website request: **Send to website team** with everything empty | Title and Description required |
| 13.3 | Title `TEST`, Page URL `not a url`, Description `TEST` > Send | "Enter a valid page URL…" |
| 13.4 | Clear Page URL > Send | "Your request was recorded and emailed to your Motionz team." Gmail: "Website change request: Zydeco Roof Revival" (to the CSM) |
| 13.5 | **📎 Attach** > pick a small image > Send (Title + Description filled) | Sent; the Gmail email lists the file with a link that downloads it |
| 13.6 | Attach a 4th file or a file over 4 MB or a .exe/.zip | Refused with a plain message |
| 13.7 | Left menu > **Setup Progress** | "n of 4 steps done", filters All steps / Still to do / Done (counts), 4 step cards |
| 13.8 | Click **Still to do**, then **Done**, then **All steps** | Lists change; empty filter shows a plain sentence |
| 13.9 | **Open onboarding form** | Pop-up GHL form, your email already filled; clicking outside does NOT close it; **×** or Esc closes it |
| 13.10 | Step 2 **Open texting form** | Texting form pop-up with your email filled |
| 13.11 | Left menu > **Leads** | Total leads, New this week, "By stage" chips, table (Name, Phone, Email, Source, Stage, Follow-up, Added) |
| 13.12 | Search a lead name; click a stage chip | List filters; "x of y match" |
| 13.13 | Left menu > **Results Tracking** | Your tracking sheet + **Money Leak Calculator**, both load; **Open in new tab** works for both. The calculator is the client's **own copy** (file name "<Client> - Money Leak Calculator", opened on the calculator tab), not a sheet shared with other clients. A client without a copy yet sees "Your calculator is being set up." |
| 13.14 | Left menu > **Contract** | "No contract yet" (or the attached one) |
| 13.15 | Left menu > **Tools & Resources** | Join Slack, Join Skool (open in new tab), Measure a roof, View scripts |
| 13.16 | Left menu > **Video Scripts** > **AI Video** | 3 scripts with your name/company, **Copy script** |
| 13.17 | **Self-Filmed** > in Pain Point click **Use this one**, then tab Testimonials > Use this one, Trustworthy > Use this one | "Ready to record" with 3 picks |
| 13.18 | Reload the page (F5) | Same choices still there |
| 13.19 | Left menu > **Roof Measurement** > Measure with empty box | Required |
| 13.20 | Address `zzqx nowhere 99999` | "We could not find that address." |
| 13.21 | Address `1600 Amphitheatre Parkway, Mountain View, CA 94043` | Roof area, squares, pitch, facets table, Recent measurements |
| 13.22 | Left menu > **Book a Call** | "Pick a time to talk with Heshan (Test CSM)…", calendar with your name/email filled, **Open in new tab** |
| 13.23 | Left menu > **Company Profile** > clear Business name > Save | Required |
| 13.24 | Phone `abc` > Save | "Enter a valid phone number…" |
| 13.25 | Fix phone > Save > reload (F5) | "Your changes were saved."; reload shows the NEW phone |

### 13b. Lead forms on the Leads page (needs 10.13 and 10.14 done first)

| # | Steps | Expected |
|---|---|---|
| 13.26 | With **both** lead form links saved by the admin: left menu > **Leads** | Under the page intro: "Need help with a lead?" with **Request a lead replacement** and **Report an unresponsive lead** |
| 13.27 | Click **Request a lead replacement** | Pop-up with the GHL form, your email already filled; "Loading the form..." shows first; clicking outside does NOT close it; **Open in new tab** opens the same form; **Close**, **×** or Esc closes it |
| 13.28 | Click **Report an unresponsive lead** | The other form opens the same way |
| 13.29 | Admin clears the Unresponsive lead form link (10.17) > reload Leads | Only **Request a lead replacement** is left |
| 13.30 | Admin clears both links (10.18) > reload Leads | The "Need help with a lead?" row is gone completely (no empty box) |
| 13.31 | Admin points Onboarding form at another form link > as the client open **Setup Progress** > **Open onboarding form** | The pop-up shows the NEW form. Put the original link back afterwards |
| 13.32 | As admin or CSM open the client's portal ("Viewing as staff") > **Leads** (with a lead form link saved) | The same buttons show; the form opens with the **client's** email filled |
| 13.33 | Phone width (375px) > **Leads** | The buttons wrap under "Need help with a lead?"; nothing is cut off; the pop-up fits the screen |

### 13c. Your own onboarding answers on Setup Progress

| # | Steps | Expected |
|---|---|---|
| 13.34 | As a client who has **never** sent the onboarding form: left menu > **Setup Progress** > look at the "Tell us about your business" card | Button says **Open onboarding form**; under it a grey line "Not submitted yet." with a small **Refresh**. No **View your answers** button |
| 13.35 | **Open onboarding form** > fill it in (answers start with `TEST`) > Submit > close the pop-up with **×** > wait about 10 seconds > **Refresh** | The card shows "Submitted <date, time>"; the form button now says **Update your answers**; a line says "Sending the form again replaces nothing — your CSM sees the newest answers first." |
| 13.36 | Click **View your answers** | The answers open inside the same card (question in small grey text, your answer under it), "Sent from <your email>". The button turns into **Hide your answers**; clicking it closes them. The answers match what Admin sees under **Onboarding form answers** (17.5) |
| 13.37 | **Update your answers** > change one answer > Submit > close > **Refresh** > **View your answers** | Two pills at the top: "Latest · <date, time>" and the older one. Clicking each shows that set of answers; nothing was overwritten |
| 13.38 | Phone width (375px) on **Setup Progress**, answers open | Buttons wrap under the title, long answers and links wrap, no sideways scrolling |
| 13.39 | As a team member **without** Setup Progress, open `/api/portal/<client>/onboarding-answers` in the browser | Refused (403) — no answers shown. Signed out: 401 |

## 14. Team (still as the client owner)

| # | Steps | Expected |
|---|---|---|
| 14.1 | Left menu > **Team** > **Invite someone** > **Clear all** pages > Send invite | "Choose at least one page this person can see." |
| 14.2 | Email `abc@` | Browser refuses |
| 14.3 | Name `TC Member`, email `heshantharushka2002+tc3@gmail.com`, phone `+1 337 555 0103`, tick only **Leads** > Send invite | "We emailed the invite to …" (no link) |
| 14.4 | **Done** > Pending invites > **Send again** > confirm | "Invite sent again" sentence |
| 14.5 | **Cancel invite** > confirm | Gone; "The invite for … was cancelled." |
| 14.6 | Sam's row > **Change access** > tick **Book a Call** too > Save | "Saved what Sam Team-Test can see." |
| 14.7 | **Turn access off** > reason `test` > confirm | "Sam Team-Test can no longer sign in."; status "Access off" |
| 14.8 | Incognito: sign in as Sam | "Your access to this portal has been turned off…" (the reason "test" is NOT shown) |
| 14.9 | Back as owner > **Turn access on** > confirm | "Sam Team-Test can sign in again." |

## 15. Team member (Incognito, sign in as Sam)

| # | Steps | Expected |
|---|---|---|
| 15.1 | Look at the menu | Only the pages the owner ticked (e.g. Home, Leads, Results Tracking, Video Scripts, Book a Call) + Company Profile |
| 15.2 | Address bar: `.../portal/<same id>/contract` then `/team` then `/onboarding` | Each sends you to Home |
| 15.3 | **Company Profile** | Read-only, "Only the account owner can change these details." |
| 15.4 | Home | "Welcome, Sam."; no contract or setup tiles unless allowed |

## 16. Suspend / reactivate / archive / unarchive (as admin, on TC Roofing Test)

Before this: accept the TC Roofing Test invite from Gmail (case 4.6) and set a password, so there is an owner to lock out.

| # | Steps | Expected |
|---|---|---|
| 16.1 | Clients > **…** > Manage client > **Suspend client** > reason `Subscription paused (test)` > confirm | Page shows "This client is suspended…", reason, who, when |
| 16.2 | Incognito: sign in as the TC owner | "Your company's portal has been suspended: Subscription paused (test)" |
| 16.3 | **Reactivate** > confirm | Active; TC owner can sign in again |
| 16.4 | **Archive** > confirm | Listed as Archived; TC owner sign-in refused ("Portal archived") |
| 16.5 | Clients > Status **Archived** > **…** > **Unarchive** > confirm | Active again; TC owner can sign in |
| 16.6 | When finished, tell Claude to delete TC Roofing Test (`scripts/clear-test-clients.mjs --only=<id> --apply --yes-this-is-staging`) and trash its Drive sheet | |

---

## 17. Live GoHighLevel sync (staging)

GHL: top-left **sub-account switcher**. Only use the sub-account with Location ID **TG1QAGQkANvoJ3UdmZRZ** (check the address bar `/location/TG1QAGQkANvoJ3UdmZRZ/`) and, for 17.4–17.5 only, **Motionz Your Rejuvenation**.

| # | Steps | Expected |
|---|---|---|
| 17.1 | Zydeco sub-account > **Automation > Workflows** | "Sync leads" / "Portal: sync leads" is **Published** |
| 17.2 | **Contacts** > Add contact `Portal Test 2`, email `heshantharushka2002+ghl2@gmail.com` > **Opportunities** > add an opportunity for it in the pipeline | Within ~1 min: portal (owner) **Leads** shows Portal Test 2 with that stage; Admin > **GHL Connect** "Last lead received" updates |
| 17.3 | In GHL drag the opportunity to another stage | Portal Leads shows the new stage, still ONE row |
| 17.4 | Portal (owner) > **Book a Call** > book any free time | ~1 min: Home **Next CSM Call** shows it. GHL (Motionz Your Rejuvenation) > Calendars > Appointments shows it; Automation > Workflows > Portal: CSM calls > Execution Logs has a run |
| 17.5 | Portal (owner) > **Setup Progress > Open onboarding form** > fill, every answer starts with `TEST` > Submit | Gmail: 2 emails "Onboarding form submitted: Zydeco Roof Revival" (you + CSM). Admin > Clients > Zydeco > Manage client > **Onboarding form answers** shows them. CSM setup page shows them |
| 17.6 | Admin > **Audit Logs** > Today | "New lead received from GoHighLevel", "Call booking received…", "Onboarding form received…", all Client: Zydeco Roof Revival |
| 17.7 | Clean up: GHL delete the test opportunity + contact; cancel the test booking if wanted | Tell Claude to remove the test lead from the portal |

## 18. Phone check

On your phone (or Chrome > F12 > phone icon > iPhone): sign in as owner, admin and CSM and open every page above.
Expected: no sideways scrolling, bottom bar works (**More** opens the rest), tables turn into cards, the **…** menu and dialogs stay on screen.

## 19. Emails you should have received (Gmail, `from:no-reply@mail.motionz.ai`)

Client invitation · team invitation (+ sent again) · password reset · staff sign-in code · website change request (with and without attachment) · onboarding form submitted (you + CSM). Each: correct name, buttons open the **staging** site, nothing broken.
