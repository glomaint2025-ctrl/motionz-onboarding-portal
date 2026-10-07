# Motionz portal: manual end-to-end test cases

Test on **staging**: https://motionz-onboarding-portal.vercel.app (Chrome). Write **Pass** or what you saw next to each case.
"A > B > C" means click A, then B, then C. "Left menu" is the side menu (on a phone: bottom bar, then **More**).

---

## 0. Accounts and passwords

Open **My PC > C: > Gloma > motionz-onboarding-portal > .env.local** with Notepad (right-click > Open with > Notepad). Do not share this file.

| Role | Email | Password |
|---|---|---|
| CSM Manager (the role that used to be called Admin; its sign-in is still admin@motionz.ai) | admin@motionz.ai | see **docs/HANDOVER.md**, line "Staging admin" |
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
| 1.3 | CSM Manager email + right password > **Sign in** | Lands on **Dashboard** |
| 1.4 | Click the eye icon in the password field | Password becomes visible / hidden |
| 1.5 | Signed out, open `.../admin/clients` directly > sign in as a CSM Manager | After sign-in you land on **Clients** (back where you came from) |
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

## 2. CSM Manager: Dashboard (sign in as the CSM Manager, admin@motionz.ai)

| # | Steps | Expected |
|---|---|---|
| 2.1 | Left menu > **Dashboard** | Tiles: Active clients, Still in setup, GHL Connect x / y, Security events (7 days), New clients (30 days). Numbers match the Clients page |
| 2.2 | Click each tile | Opens the matching page (Clients, GHL Connect, Security Alerts…) |
| 2.3 | Card "No CSM assigned" (the "Stuck in setup" card was removed at the client's request, 7 Oct) | Plain sentence, no errors |
| 2.4 | Card "No contract attached", next to "No CSM assigned" | Lists every live client with no contract (archived clients are not listed), or "Every client has a contract attached." Clicking a name opens that client's page |
| 2.5 | Attach a contract to one listed client (5.8) > back to **Dashboard** | That client is no longer in the card |
| 2.6 | Card "Lead requests to handle", next to "No contract attached" (do 13.26 to 13.44 first) | Lists each client that has open lead replacement or unresponsive lead requests, with "n open" beside the name and a yellow "n open" total at the top; or "No open lead replacement or unresponsive lead requests." Clicking a name opens that client's page |
| 2.7 | Mark every request of one listed client done (13.47) > back to **Dashboard** | That client is no longer in the card and the total went down |

## 3. CSM Manager: Clients list

| # | Steps | Expected |
|---|---|---|
| 3.1 | Left menu > **Clients** | Tiles Total / Active / Onboarding / Archived; table: Company, CSM, Status, Setup progress, GoHighLevel, Actions |
| 3.2 | Search box: `zydeco` | Only Zydeco shows |
| 3.3 | Search: `xyz123` | "No clients match your search or filters." |
| 3.4 | **Status** dropdown: try All, Active, Onboarding, Suspended, Archived | List changes correctly each time |
| 3.5 | **CSM** dropdown > pick a CSM | Only that CSM's clients |
| 3.6 | **Clear Filters** | Everything back |
| 3.7 | On a row click **…** | Menu: Manage client, Suspend, Archive, Delete permanently. Fully visible on screen |
| 3.8 | **Open portal** on a row | Client portal opens in a **new tab** with bar "Viewing as staff · <client>" (no "Back to Admin" link); the Clients list is still open in the first tab |
| 3.9 | Look under the company name of a client with no contract (e.g. TC Roofing Test before 5.8) | Small grey "No contract" under the name. Clients with a contract, and archived clients, do not show it. At 1024px wide the table still fits with no sideways scrolling |

## 4. CSM Manager: Add client (uses a NEW test client; do not use Zydeco)

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

## 5. CSM Manager: Client detail (Clients > **…** on TC Roofing Test > **Manage client**)

| # | Steps | Expected |
|---|---|---|
| 5.1 | Clear **Company name** > **Save changes** | Refused, field required |
| 5.2 | Business phone `12` > Save | Phone error, field marked |
| 5.3 | Fix phone > untick **Roof Measurement** > Save | "Your changes were saved." Reload: still unticked |
| 5.4 | **Open portal** (opens in a new tab) > left menu / Tools | Roof Measurement is gone; opening `.../roof-measurement` sends you to Home |
| 5.5 | Back in the first tab: tick Roof Measurement again > Save | Saved |
| 5.6 | **Assigned CSM** > Thomas > Save > reload | Shows Thomas. Change back to Heshan (Test CSM) > Save |
| 5.7 | **Contract** card: under "How do you want to attach the contract?" choose **Paste a link**. Title `Test agreement`, Document link `http://example.com/a.pdf` > **Attach contract** | "Document link must be a full https:// link." |
| 5.8 | Link `https://example.com/a.pdf`, leave Signed on empty > Attach | Listed as "Not signed yet · Link · Open" |
| 5.9 | **Remove** > confirm **Remove contract** | The blue notice comes back at the top of the Contract card: "No contract attached yet. Upload the signed contract or paste its link below so TC Roofing Test can see it on their Contract page." |
| 5.9a | Attach the contract again (5.8) | The notice is gone as soon as the contract is listed. Sign in as the TC owner: the Contract page shows the contract and no reminder anywhere |
| 5.9b | Choose **Upload a file** (the default). Look at the form | A **Contract file** picker with "PDF, DOCX, PNG or JPG, up to 4 MB." and, under the form, "The file is saved in this client's Google Drive folder. It is never public…". The button reads **Upload contract** |
| 5.9c | Title `Signed agreement`, pick a `.txt` or `.xlsx` file > **Upload contract** | "Upload a PDF, DOCX, PNG or JPG file." Nothing is added |
| 5.9d | Pick a PDF larger than 4 MB > **Upload contract** | "That file is larger than 4 MB. Upload a smaller file, or paste a link instead." |
| 5.9e | Rename any picture to `fake.pdf`, pick it > **Upload contract** | ""fake.pdf" does not look like a valid .pdf file." |
| 5.9f | Pick a real PDF under 4 MB, Signed on = today > **Upload contract** | "Uploading…" then a notice "Contract uploaded to TC Roofing Test's Google Drive folder. Only Motionz staff and the account owner can open it." Listed as "Signed … · Uploaded file in Google Drive · Open". **Open** shows the PDF in Google Drive. In Drive the file is inside the client's folder; its Share dialog lists the owner's email as **Viewer** and General access is **Restricted** |
| 5.9g | Sign in as the TC owner > **Contract** | The contract with **Open document** and under it "Opens in Google Drive. Sign in to Google with <owner email> to view it." Signed in to Google with that email the PDF opens; in a browser signed in to another Google account Google says you need access |
| 5.9h | A contract attached as a link (5.8), on the owner's Contract page | **Open document** with no Google Drive line under it |
| 5.9i | As a CSM Manager: **Remove** the uploaded contract > the dialog | It adds "The uploaded file is moved to the bin in Google Drive." Confirm: the row is gone; in Drive the file is in the bin; the owner's Contract page no longer lists it |
| 5.9j | On a client with **no Drive folder yet** (Google files row shows a set-up button): upload a PDF | "This client has no Google Drive folder yet. Press "Set up Google files" under Company details first, then upload the contract again." Nothing is added. **Paste a link** still works for that client |
| 5.10 | **Client team** > **Invitations waiting** > **Send again** > confirm | One sentence "We emailed a new invitation…". Gmail gets a new invite; the old link no longer works |
| 5.11 | **Invite** button > email `heshantharushka2002+tc2@gmail.com` > send | "We emailed the invitation to …" |
| 5.12 | On that waiting invite > **Cancel invite** > confirm | It disappears; its Gmail link shows "This link isn't working" |
| 5.13 | **Company details > Google files** | Links **Open tracking sheet**, **Open calculator**, **Open Drive folder**, each opens the right file in a new tab; no setup button |
| 5.14 | Change **Company name** to `TC Roofing Test 2` > Save | "Your changes were saved." In Drive the folder and both files now start with "TC Roofing Test 2"; the three links still open the same files. Change the name back > Save |
| 5.15 | On a client added before per-client folders (e.g. Zydeco): **Google files** | **Open tracking sheet** plus "Still missing: calculator, Drive folder." and a **Finish Google files setup** button |
| 5.16 | Press **Finish Google files setup** | "Setting up…" then "Google files are set up."; all three links show, the button is gone. In Drive the old tracking sheet has **moved** into the new client folder (not copied) and a calculator copy is next to it |

To bring **every** older client up to date in one go instead of pressing the button on each one, a developer can run `npx tsx scripts/setup-google-files.ts --dry-run` (only lists what is missing) and then the same command without `--dry-run`. See docs/07-integrations/google-sheets.md.

### 5b. Google Drive access follows the portal (needs the updated Google script, see docs/07-integrations/google-sheets.md)

Use **TC Roofing Test** (it has a Drive folder). Keep the client's Drive folder open in another tab, signed in as the Google account that owns the script, and check **Share** on the folder, the tracking sheet and the calculator after each step. Use test addresses that are real Google accounts (the `heshantharushka2002+…@gmail.com` ones are); each person who is given access gets Google's own "shared with you" email.

| # | Steps | Expected |
|---|---|---|
| 5.17 | **Company details > Google files** | Next to the links there is a **Re-sync Drive access** button (only when the client has a Drive folder) |
| 5.18 | Press **Re-sync Drive access** | "Checking who can open this client's Google files…" then "Access is up to date. …" or "Added n, removed n. …". Press again: "Access is up to date." |
| 5.19 | In Drive: the **parent folder** > Share | Every active CSM Manager is an **Editor**. General access: **Restricted** |
| 5.20 | In Drive: the **client folder** > Share | The assigned CSM is an Editor (CSM Managers show too, passed down from the parent folder). The client owner and team are **not** on the folder |
| 5.21 | In Drive: the **tracking sheet** and the **calculator** > Share | The client owner is an Editor; so is every active team member who may see Results Tracking. General access: **Restricted** on both |
| 5.22 | **Assigned CSM** > another CSM > Save | Saved. In Drive the new CSM is on the client folder and the previous one is gone. Change it back > Save: it swaps back |
| 5.23 | **Client team**: untick **Results Tracking** for a team member > save | In Drive that member is no longer on the tracking sheet or calculator. Tick it again > save: they are back |
| 5.24 | **Client team**: disable a team member, then enable them | Disabled: gone from both sheets. Enabled: back on both |
| 5.25 | Invite a new team member with Results Tracking ticked; before they accept, look in Drive | Not shared with them yet. After they open the invite and set a password: they are an Editor on both sheets, and they receive Google's "shared with you" emails |
| 5.26 | In Drive, share the tracking sheet by hand with some other Google address > back in the portal press **Re-sync Drive access** | "Removed 1. …" and that address is gone from the sheet (client files are kept exactly in step with the portal) |
| 5.27 | **Audit Logs** | One "Google Drive access updated" entry for each step above that changed something; none for a re-sync that found nothing to change |
| 5.28 | Only while the Google script has **not** been updated yet: press **Re-sync Drive access** | Red text "The Google script needs updating before Drive access can be managed." Nothing changes in Drive, and saving the client, changing the CSM or the team still works |

While doing section 16 (suspend / reactivate / archive / unarchive) check Drive again: while the client is suspended or archived the owner and team are **off** both sheets and the contract, the CSM and the CSM Managers still have access; after reactivating or unarchiving the owner and team are back.

## 6. CSM Manager: GHL Connect

| # | Steps | Expected |
|---|---|---|
| 6.1 | Left menu > **GHL Connect** | "x / y connected"; Not connected and Connected lists |
| 6.2 | TC Roofing Test > **Set Location ID** > `bad id!` > Save | "The GoHighLevel Location ID looks wrong…" |
| 6.3 | **Cancel** | Editor closes, nothing saved |
| 6.4 | Zydeco row shows Location ID `TG1QAGQkANvoJ3UdmZRZ` and "Last lead received" | Matches GHL |

## 7. CSM Manager: Staff

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
| 7.14 | Drive access (needs the updated Google script): add a throwaway **CSM Manager**, then look at the parent Drive folder > Share | The new CSM Manager is an Editor on the parent folder (and receives Google's "shared with you" email if the address is a Google account; otherwise the add still succeeds) |
| 7.15 | **Edit** that CSM Manager > change Role to CSM > Save | They are no longer on the parent folder. Change back to CSM Manager: they are on it again |
| 7.16 | **Delete** the throwaway CSM Manager | Gone from the parent folder. Anyone you shared the parent folder with by hand, who is not portal staff, is still there |
| 7.17 | Disable, then enable, a CSM who has clients (a disabled row shows **Enable**; disabling is done from the database on staging) | Disabled: gone from the folder of every client they look after. Enabled: back on each |

## 8. CSM Manager: Portal Templates

| # | Steps | Expected |
|---|---|---|
| 8.1 | Left menu > **Portal Templates** | 4 steps: Google Sheet, GoHighLevel / A2P Verified, Domain email & website, Phone system & A2P texting |
| 8.2 | Step 1 **Edit** > clear Step name > Save step | "Fill in every field before saving…" |
| 8.3 | Put the name back > change Right now text > Save > then change it back | "Saved … New clients will get this wording." |

## 9. CSM Manager: Video Scripts library

| # | Steps | Expected |
|---|---|---|
| 9.1 | Left menu > **Video Scripts** | AI Video (3), Pain Point (5), Testimonials (5), Trustworthy (5), Bonus (5) |
| 9.2 | **Add script** > empty > Add | Fields required |
| 9.3 | Title `TEST script`, Category Pain Point, Script `Hi I'm {{client_name}} from {{company_name}}` > Add | "Added … Clients can see it now." Preview shows Jane Doe / Summit Roof Pros |
| 9.4 | **Edit** on TEST script > change text > Save | Saved |
| 9.5 | **Delete script** on TEST script > **Yes, delete** | Deleted; Pain Point back to (5) |

## 10. CSM Manager: Settings & Integrations

| # | Steps | Expected |
|---|---|---|
| 10.1 | Left menu > **Settings & Integrations** > card **Notification emails** > **Onboarding form** box: `heshantharushka2002@gmail.com, bad` > **Save notification settings** | "Invalid email address: bad" in red under that box and at the top of the page; nothing saved |
| 10.2 | Put back `heshantharushka2002@gmail.com`, **Also email the CSM** ticked > Save | "Notification settings saved." |
| 10.2a | The card has three boxes: **Onboarding form**, **Website change requests**, **Lead forms**, each "(separate with commas)" with a grey help line | Lead forms help says "Your lead team. Used by the Lead Replacement and Unresponsive Lead forms." Under the tick box: it applies to onboarding and lead forms; website requests always go to the CSM |
| 10.2b | **Website change requests** box: `nope` > Save. Then **Lead forms** box: `also bad` > Save | Each time the red "Invalid email address: …" is under the box with the mistake, the other boxes are not marked, nothing saved |
| 10.2c | Website change requests `heshantharushka2002+web@gmail.com`, Lead forms `heshantharushka2002+leads@gmail.com` > Save > reload the page | Saved; all three boxes keep their addresses. Audit Logs: "Notification settings updated" naming the lists that changed |
| 10.2d | Sign in as the Zydeco owner > Home > **Website Change Request** > send one | Gmail: the request arrives at `+web` AND at the client's CSM (one email each). Nothing arrives at `+leads` |
| 10.2e | As a CSM Manager, empty the Website change requests box > Save > send another request as the owner | Only the CSM gets it (same as before this setting existed) |
| 10.3 | Staff sign-in security > **CSMs only** > Save > sign out > sign in as CSM | "Check your email" step |
| 10.4 | Type `000000` > Verify | "That code is not correct. You have 4 tries left." |
| 10.5 | Gmail "Your Motionz sign-in code" > type the code > Verify | Lands on My Clients |
| 10.6 | Sign in as a CSM Manager > Settings > **Off** > Save | Saved (the CSM Manager signs in without a code) |
| 10.7 | "Onboarding forms without a client" | "Nothing to review." or a list with **Link** |
| 10.8 | "Connected services" | Email, Client tracking sheets, GoHighLevel webhooks all **Connected** |

### 10b. GoHighLevel forms (same page, card "GoHighLevel forms")

Only the Texting registration form is a GoHighLevel form now. Use a real form link from GoHighLevel
(Sites > Forms > the form > Integrate/Share > copy link). Write down the ID shown at the start so you
can put it back at the end.

| # | Steps | Expected |
|---|---|---|
| 10.9 | Look at the card | A grey line at the top: "The onboarding form (client → Setup Progress) and the two lead forms, Lead Replacement and Unresponsive Lead (client → Leads), are built into the portal. Their answers are saved here, not in GoHighLevel." **One** row: Texting registration form (there is **no** Onboarding form, Lead replacement form or Unresponsive lead form row). It says **Showing on Setup Progress** with a Form ID and a **Preview** link. **Save form links** is greyed out |
| 10.10 | Click **Preview** on Texting registration form | The GHL form opens in a new tab |
| 10.11 | Texting registration form: type `hello` > **Save form links** | Under the box: "That does not look like a GoHighLevel form link or ID…". Nothing is saved |
| 10.12 | Clear the Texting registration form box > Save | Under the box: "This form is always shown to clients, so it cannot be left empty." Put the ID back |
| 10.13 | Paste a full form link of another form (`https://api.leadconnectorhq.com/widget/form/…`) | "Form ID: … (not saved yet)" appears under the box, with **Preview** |
| 10.14 | **Save form links** | "Form links saved. Clients see the change straight away." The box shows only the ID |
| 10.15 | Reload the page (F5) | The saved ID is still there |
| 10.16 | Left menu > **Audit Logs** | Newest entry is "GoHighLevel form links updated" by you (details name the Texting registration form) |
| 10.17 | Paste the whole `<iframe …>` embed code of the **original** texting form > Save | Saved; the box shows the original ID again |
| 10.18 | As the client: **Setup Progress** > **Open texting form** | The original form opens |

### 10c. Automations — HIDDEN for now (7 Oct: the card is not shown until the client asks for it; skip 10.19–10.26)

In GoHighLevel: Automation > Workflows > create a workflow > trigger **Inbound Webhook** > copy its URL.
For a quick test without GoHighLevel you can use a throw-away link from https://webhook.site.

| # | Steps | Expected |
|---|---|---|
| 10.19 | Look at the card | Title "Automations (optional)", sub-line "Paste a GoHighLevel Inbound Webhook link. The portal sends every lead form submission to it so you can build your own automation." Badge **Off**, an empty box "Lead forms: Inbound Webhook link", **Save automation link** greyed out |
| 10.20 | Type `hello` > **Save automation link** | Red under the box: "That does not look like a link…". Nothing saved |
| 10.21 | Type `http://example.com/hook` > Save | "The link must start with https://." |
| 10.22 | Try `https://localhost/hook`, then `https://127.0.0.1/hook`, then `https://192.168.1.5/hook` > Save each | Each time: "That address is not allowed. Use the public https link GoHighLevel gives you." Nothing saved |
| 10.23 | Paste the real Inbound Webhook link > Save | "Saved. Every new lead form submission is now sent to this link." Badge **On**. Reload (F5): the link is still there |
| 10.24 | **Audit Logs** | "Automation link updated" by you. The details show only the host name of the link, not the whole link |
| 10.25 | As the client send a Lead Replacement request (13.31) and an Unresponsive Lead (13.40) | In GoHighLevel (workflow > Inbound Webhook trigger > "Fetch sample requests") or on webhook.site: one request each, with `type`, `decision`, `decision_reason`, `lead` (name, phone, and `ghl_contact_id` when the lead was picked from the list), `details`, `client` (id, name, `ghl_location_id`), `submitted_by_email`, `submitted_at` |
| 10.26 | Change the saved link to one that does not answer (for example `https://example.invalid-domain-xyz.com/hook`) > as the client send another request | The client still sees the normal result screen and the email still arrives. **Audit Logs**: "Lead form could not be sent to the automation link" with the reason |
| 10.27 | Empty the box > Save | "Saved. Lead form submissions are no longer sent anywhere." Badge **Off**. A new client request calls nothing and adds no "could not be sent" entry |
| 10.28 | Sign in as a CSM and open `/admin/integrations` | You are sent to My Clients; a CSM cannot see or change this |

### 10d. Slack messages (lead forms)

You need a Slack Incoming Webhook link for a test channel: in Slack open **Apps** > search
**Incoming Webhooks** > **Add to Slack** > choose the channel > copy the **Webhook URL**.

| # | Steps | Expected |
|---|---|---|
| 10.29 | CSM Manager workspace > **Settings & Integrations** > card **Slack messages** | Sub-line "When a client sends a Lead Replacement or Unresponsive Lead form, post a message to a Slack channel." Badge **Off**, an empty box "Slack webhook link", the four steps to get the link under it, **Save** greyed out. No "Send a test message" and no "Remove" yet |
| 10.30 | Type `hello` > **Save** | Red under the box: "That does not look like a link…". Nothing saved |
| 10.31 | Type `http://hooks.slack.com/services/T0/B0/x` > Save | "The link must start with https://." |
| 10.32 | Type `https://example.com/services/T0/B0/x` > Save | "That is not a Slack webhook link. It must start with https://hooks.slack.com/services/." |
| 10.33 | Paste the real Webhook URL > **Save** | "Saved. New lead forms are now posted to this Slack channel." Badge **On**. The box now shows `https://hooks.slack.com/services/T…/B…/••••` (the real link is hidden). **Send a test message** and **Remove** appear |
| 10.34 | Reload the page (F5) | Still **On**, the box still shows the hidden version. The real link is nowhere on the page (also not in the browser's Network tab) |
| 10.35 | **Send a test message** | "Test message sent. Check the Slack channel." The channel shows "Test message from the Motionz portal" |
| 10.36 | **Audit Logs** | "Slack webhook link updated" by you. The details say Set / Off only, never the link |
| 10.37 | As the client send a Lead Replacement request (13.31) | Slack shows, in bold, "Lead replacement request — Approved", then Client, Lead (name · phone), Reason, Appointment, What happened, Submitted by, and a link that opens the client's admin page |
| 10.38 | As the client send a request whose What happened contains `<!channel> & <b>bold</b>` | The Slack message shows those characters as plain text. Nobody is notified by @channel and nothing turns into a link |
| 10.39 | As the client send an Unresponsive Lead (13.40) | Slack shows "Unresponsive lead", Client, Lead, "Days since the lead was sent", "How they tried to reach them", Submitted by and the link |
| 10.40 | Send the same request again within 10 minutes (13.37); send an Unresponsive Lead with Days `2` | No Slack message for either (a duplicate and a refused form are not posted) |
| 10.41 | In Slack, remove the Incoming Webhook (or archive the channel) > **Send a test message** | Red: "Slack answered with an error (…)" with Slack's own short reason. As the client send another request: the client still sees the normal result and the email still arrives; **Audit Logs** has "Lead form could not be posted to Slack" with the reason |
| 10.42 | Click in the box without typing anything new | **Save** stays greyed out (the hidden link cannot be saved over the real one) |
| 10.43 | **Remove** | "Removed. Lead forms are no longer posted to Slack." Badge **Off**, empty box. A new client request posts nothing and adds no "could not be posted" entry |
| 10.44 | Sign in as a CSM and open `/admin/integrations` | You are sent to My Clients; a CSM cannot see or change this |

## 11. CSM Manager: Audit Logs and Security Alerts

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
| 12.3a | **My Clients**: a client with no contract | Small grey "No contract" under the company name; not shown for clients that have one |
| 12.3b | **Update setup** on a client with no contract | Blue notice near the top: "This client has no contract attached yet. Ask a CSM Manager to attach it (Clients → <client> → Contract)." After a CSM Manager attaches one and you reload, the notice is gone. The CSM has no way to attach it themselves |
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
| 13.9 | **Open onboarding form** | A full page opens inside the portal (`…/onboarding/form`), **not** a pop-up and not a GoHighLevel form: title "Onboarding form", **← Back to Setup Progress**, five numbered sections. Full cases in 13c |
| 13.10 | Step 2 **Open texting form** | Texting form pop-up with your email filled |
| 13.11 | Left menu > **Leads** | Total leads, New this week, "By stage" chips, table (Name, Phone, Email, Source, Stage, Follow-up, Added) |
| 13.12 | Search a lead name; click a stage chip | List filters; "x of y match" |
| 13.13 | Left menu > **Results Tracking** | Your tracking sheet + **Money Leak Calculator**, both load; **Open in new tab** works for both. The calculator is the client's **own copy** (file name "<Client> - Money Leak Calculator", opened on the calculator tab), not a sheet shared with other clients. A client without a copy yet sees "Your calculator is being set up." Under each sheet: "Not loading? Sign in to Google with the email you use for this portal, or open it in a new tab." |
| 13.14 | Left menu > **Contract** | "No contract yet" (or the attached one). An uploaded contract shows "Opens in Google Drive. Sign in to Google with <your email> to view it." under **Open document**; a pasted link does not (see 5.9g, 5.9h) |
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
| 13.25b | Click **My profile** (link under the Company Profile heading) > look at **Sign-in email** | Your email is shown as plain text with "This is the email you sign in with. To change it, ask your Motionz contact." There is no box to type in and no **Change email** button (staff see "…ask a Motionz admin.") |

### 13b. Lead forms on the Leads page (built into the portal; no CSM Manager setup needed)

Before you start: CSM Manager workspace > Settings & Integrations > **Lead forms** box has `heshantharushka2002+leads@gmail.com`
and "Also email the CSM" is ticked (10.2c). The forms need the database table from
`supabase/migrations/20261007000004_lead_requests.sql` (see `docs/HANDOVER.md`).

| # | Steps | Expected |
|---|---|---|
| 13.26 | Left menu > **Leads** | Under the page intro: "Need help with a lead?" with **Request a lead replacement** and **Report an unresponsive lead**. They are always there (no CSM Manager setting). Each lead row has two small links at the end: **Replace** and **Not responding**. Under the leads table: a card **Your requests** ("You have not sent any requests yet…" the first time) |
| 13.27 | Click **Request a lead replacement** | A full page "Lead replacement" opens (not a pop-up) with "← Back to Leads", the intro "Submit a lead you think should be replaced. It is checked against the replacement rules straight away and approved requests go to our marketing team.", a rules box (**Replaceable:** … / **Not replaceable:** … / "Every request is checked against these rules straight away…"), and the line "Submitting as *your name* · *your company*". There are **no** boxes for your own name, company or client id |
| 13.28 | In the rules box click **Unresponsive Lead form** | The Unresponsive lead page opens. Its rules box says "**Before you submit:** you should have called **twice a day** … Submit the lead from **day 4** …" and its **Lead Replacement form** link goes back |
| 13.29 | On Lead replacement click **Submit request** with everything empty | Nothing is sent. "Some answers need a second look. We have marked them for you." Red under each box: "Enter the lead's name.", "Enter the lead's phone number.", "Choose a reason.", "Choose an answer.", "Please answer this question." The cursor is in the first one |
| 13.30 | Phone `call me`; What happened `didn't qualify` > **Submit request** | "Enter a valid phone number…" and "Please give more detail (at least 30 characters). Say exactly what happened." Under the big box, before typing, the grey help reads: Vague reasons like "didn't qualify" with no detail are not approved. Say which part didn't qualify and how you know. |
| 13.31 | Click **Pick from your leads** > type part of a lead's name > click the lead. Reason **Wrong contact information**, appointment **No, an appointment was never booked**, What happened: `TEST Called three times, the number belongs to a different person who never filled in a form.` > **Submit request** | Picking fills the name and phone and shows "Picked: *name*" with **Clear**. After sending: a green **Approved** badge and "This matches the replacement rules. It has been sent to our marketing team.", with **Submit another** and **Back to Leads** |
| 13.32 | Gmail (`+leads`) and the CSM's inbox | One email each: subject "Lead replacement request (Approved): *lead name* — *client*". Body has the lead name and phone, the reason, the appointment answer, what happened, "Outcome: Approved", the reason text and who sent it. The button opens the client in the portal (admin page for the team address, the CSM's own page for the CSM) |
| 13.33 | Open the **Did you get to an appointment with this homeowner?** dropdown | Exactly three options, in this order: "No, an appointment was never booked" · "No, it was booked but cancelled / no-show before the inspection" · "Yes, I was at the appointment" |
| 13.34 | Open the **Reason for replacement** dropdown | Exactly seven options, in this order: "No longer wants the inspection" · "Wrong contact information" · "Wrong roof material / doesn't qualify" · "Not the homeowner" · "Outside service area" · "Appointment didn't match qualification parameters" · "Other" |
| 13.35 | **Submit another** > type a name and phone by hand. Reason **Wrong contact information**, appointment **Yes, I was at the appointment**, 30+ characters > submit | Yellow **Needs review** badge: "Our team will look at this one and get back to you." (the two answers do not fit together). Email subject says "(Needs review)" |
| 13.36 | Again: reason **Other**, any appointment answer | Yellow **Needs review** badge with the same sentence |
| 13.36a | Again, once for each of the other reasons with any appointment answer (see the table below) | Green **Approved**: "This matches the replacement rules. It has been sent to our marketing team." The form never answers "Not replaceable" by itself |
| 13.37 | Send exactly the same request as 13.36 again within 10 minutes | The same result screen with "We already had this request, so nothing was sent twice." No second email, no second row under Your requests |
| 13.38 | **Back to Leads** > on any lead row click **Replace** | The Lead replacement page opens with that lead already picked (name and phone filled). **Not responding** does the same on the other form, and "Days since lead was sent" is filled from the day the lead was added |
| 13.39 | **Report an unresponsive lead**: name, phone, Days `2`, How have you tried: `TEST rang twice a day, texts delivered, no replies.` > **Submit lead** | Nothing is sent. Red under Days: "Submit this lead from day 4. Keep calling twice a day until then." No email, nothing new under Your requests |
| 13.40 | Change Days to `5` > **Submit lead** | Blue **Sent to the marketing team** badge with a line about the marketing team's follow-ups. Email subject "Unresponsive lead: *lead name* — *client*" with the days and what you tried |
| 13.41 | Days `4.5` or empty > submit; then How have you tried `called` > submit | "Enter a whole number of days, from 0 to 365."; "Please give more detail (at least 20 characters)." |
| 13.42 | **Back to Leads** > card **Your requests** | Every request you sent, newest first: lead name, "Lead replacement" or "Unresponsive lead", the date, the outcome badge and the reason. With more than 20 a **Show more** button loads the next 20 |
| 13.43 | Sign in as another client (TC Roofing Test) > **Leads** | Their Your requests does not show Zydeco's requests |
| 13.44 | As a CSM Manager or the client's CSM open the client's portal ("Viewing as staff") > **Leads** > send a request | It works; the email says it was sent by the member of staff, and the staff list (13.45) shows them as the sender |
| 13.45 | As a team member who does not have **Leads** ticked (15.x) | No Leads in the menu; opening `/portal/<client>/leads/replacement` directly sends you back to the portal home page, never the form |
| 13.46 | Phone width (375px) > **Leads**, both forms, the result screen | Buttons wrap under "Need help with a lead?"; each lead card has **Replace · Not responding** on its own line at the bottom; the forms are one column; the dropdown options wrap; nothing is cut off and nothing scrolls sideways |
| 13.46a | A CSM Manager points Texting registration form at another form link > as the client open **Setup Progress** > **Open texting form** | The pop-up shows the NEW form. Put the original link back afterwards |

**The instant result, for every combination** (A = Approved, R = Needs review):

| Reason for replacement | Never booked | Booked but cancelled / no-show | I was at the appointment |
|---|---|---|---|
| No longer wants the inspection | A | A | A |
| Wrong contact information | A | A | **R** |
| Wrong roof material / doesn't qualify | A | A | A |
| Not the homeowner | A | A | A |
| Outside service area | A | A | A |
| Appointment didn't match qualification parameters | A | A | A |
| Other | **R** | **R** | **R** |

"Not replaceable" is only ever set by staff (13.54 to 13.58). Requests sent before 7 Oct with the
earlier options (for example "I inspected the roof and they didn't buy") still show their original
wording under Your requests and on the staff card.

### 13b-2. Staff: handling lead requests

| # | Steps | Expected |
|---|---|---|
| 13.47 | As a CSM Manager: Clients > the client > card **Lead requests** (under the onboarding answers) | Every request, newest first: the form type, lead name and phone (the phone is a link), the outcome badge, **Open** or **Done**, the reason, the client's answers in full, "Sent by *email* · *date and time*", and a **Mark done** button. A yellow "n open" badge at the top of the card |
| 13.48 | **Mark done** on one | It turns to **Done** (slightly faded) with "marked done by *you* *time*" and the button becomes **Reopen**. The "n open" badge goes down. Audit Logs: "Lead request marked done or reopened" |
| 13.49 | **Reopen** | Back to **Open** |
| 13.50 | As the client's CSM: My Clients > the client > setup page > card **Lead requests** | The same list with the same buttons; marking done works |
| 13.51 | As a CSM who is **not** assigned to this client, open `/csm/clients/<that client id>/setup` | "This client is not assigned to you."; no lead requests are shown |
| 13.52 | As the client: **Leads** > Your requests after staff marked one done | The outcome badge and reason are unchanged (Open/Done is staff-only) |
| 13.54 | As a CSM Manager: the client's **Lead requests** card > on a **Lead replacement** request click **Change outcome** | A small form opens under that request: **Outcome** (Approved / Not replaceable / Needs review, the current one chosen), "Note for the client (optional)", **Save outcome** and **Cancel**. An **Unresponsive lead** request has no Change outcome button |
| 13.55 | Choose **Not replaceable**, note `TEST We spoke to the homeowner and they still want the inspection.` > **Save outcome** | The badge turns red **Not replaceable** and the line under it is your note. The request stays **Open**. Audit Logs: "Lead request outcome changed by staff" with the old and new outcome and the note |
| 13.56 | As the client: **Leads** > Your requests | That request now shows **Not replaceable** and your note |
| 13.57 | **Change outcome** again > **Approved**, leave the note empty > Save | Green **Approved** with "This matches the replacement rules. It has been sent to our marketing team." (Not replaceable with no note reads "Our team looked at this request. It does not match the replacement rules."; Needs review reads "Our team will look at this one and get back to you.") |
| 13.58 | As the client's CSM do 13.54 to 13.55 on the setup page; as a CSM who is not assigned, the card is not shown (13.51) | The assigned CSM can change the outcome; nobody else can |
| 13.53 | CSM Manager workspace > Settings: empty the **Lead forms** box and untick "Also email the CSM" > Save > as the client send a request | The client's CSM still gets the email. For a client with no CSM, every CSM Manager gets it. Put the settings back afterwards |

### 13c. The onboarding form (built into the portal) and your answers on Setup Progress

The form is a page of the portal now. Nothing is sent to GoHighLevel. Have ready: a small PDF, a small
CSV, a `.exe` or `.mp4` file, and a file larger than 4 MB.

| # | Steps | Expected |
|---|---|---|
| 13.34 | As a client who has **never** sent the onboarding form: left menu > **Setup Progress** > look at the "Tell us about your business" card | Button says **Open onboarding form**; under it a grey line "Not submitted yet." with a small **Refresh**. No **View your answers** button |
| 13.35 | **Open onboarding form** | The form page opens. A row of five section buttons (1. Business details … 5. Sales refinement) stays at the top while you scroll and jumps to a section when clicked. Each card says "Section n of 5" with its sub-line. Required questions have a red `*` |
| 13.36 | Look at the first section **before typing** | **Pre-filled:** Full Name (your name), DBA Business Name (the company name), Business Email and Business Phone (from Company Profile), Country = United States. Everything else is empty with a grey example inside |
| 13.37 | Scroll to the bottom > **Send my answers** with the required boxes empty | Nothing is sent. "Some answers need a second look. We have marked them for you." The page scrolls to the **first** empty required question and puts the cursor in it; each one shows "Please answer this question." in red; the section buttons with problems say "(check)" |
| 13.38 | Business Email `abc` and Business Phone `call me` > **Send my answers** | "Enter a valid email address…" and "Enter a valid phone number…" under those boxes. Type a correct value: the red message under that box goes away |
| 13.39 | Type a few answers starting with `TEST`, tick two boxes under "Which of these increase your pricing?", pick **Yes** for the deposit > press **F5** | The page reloads with everything you typed still there and the line "We brought back the answers you had started on this device but not sent yet." **Start again** empties it back to the pre-filled values |
| 13.40 | "Upload Useful Video / Materials for Marketing": choose the `.exe` or `.mp4` > Send | Red message under the upload: "… is not an allowed file type. Send PDF, PNG, JPG, WEBP, CSV, XLSX, DOCX or TXT files." The help line says videos go to your CSM on Slack. **Remove** takes the file off the list |
| 13.41 | Choose the file larger than 4 MB > Send | "Your files are larger than 4 MB in total. Remove a file, or send large files to your CSM on Slack." Remove it |
| 13.42 | Choose 6 small files on one upload question > Send | "You can send up to 5 files here." Remove one |
| 13.43 | Fill every required question (answers start with `TEST`), attach the small PDF to the marketing upload and the CSV to "Upload A List Of Old Leads to Reactivate" > **Send my answers** | Button shows "Sending..." and cannot be clicked twice. Then: "Thanks — your answers were sent to your Motionz team." with **Back to Setup Progress** |
| 13.44 | **Back to Setup Progress** | The card shows "Submitted <date, time>"; the button now says **Update your answers**; a line says "Sending the form again replaces nothing — your CSM sees the newest answers first." |
| 13.45 | Click **View your answers** | The answers open inside the same card in the order of the form (question in small grey text, your answer under it), "Sent from <your email>". The two uploads show the **file names as links** with their size; clicking one downloads that file. The button turns into **Hide your answers** |
| 13.46 | Gmail | "Onboarding form submitted: <client>" to every address in Settings > Notification emails, plus the client's CSM when **Also email the CSM** is ticked. The email lists the answers (uploads by file name) and **Open client in portal** opens the client on staging |
| 13.47 | As a **CSM Manager**: Clients > the client > Manage client > **Onboarding form answers**. As the **CSM**: My Clients > the client > **Update setup** | Both show the same answers, "Submitted <date, time> by <client email>", and the file links download the files |
| 13.48 | As a CSM Manager: **Audit Logs** > Today | "Onboarding form sent from the portal", Client: the client, by the client's email |
| 13.49 | As the client: **Update your answers** | The form opens with **your last answers filled in** and the line "We filled in the answers you sent on <date, time>…". The files you sent are listed as "· sent before" with **Remove** |
| 13.50 | Change one answer > **Send updated answers** > Back to Setup Progress > **View your answers** | Two pills at the top: "Latest · <date, time>" and the older one. Clicking each shows that set of answers; nothing was overwritten. The newest one still lists the files you kept |
| 13.51 | **Update your answers** > change nothing > **Send updated answers** (within 10 minutes of 13.50) | "Thanks…" with "We already have these answers. Nothing was sent twice." No new pill on Setup Progress and no new email |
| 13.52 | As a CSM Manager or the CSM open the client's portal ("Viewing as staff") > Setup Progress > **Update your answers** > send | Works; the new set says "Submitted … by <your staff email>" |
| 13.53 | Phone width (375px): open the form, type, tick, upload, send; then Setup Progress with answers open | No sideways scrolling; the section buttons scroll sideways inside their own row; long questions and file names wrap; buttons stay on screen |
| 13.54 | As a team member **without** Setup Progress: type `…/portal/<client>/onboarding/form` in the address bar; then open `/api/portal/<client>/onboarding-answers` | Sent to Home; the address answers 403 (no answers shown). Signed out: 401 |
| 13.55 | Copy a file link from 13.45 > sign in as a **different client** (Incognito) > paste it | Refused (403). Signed out: sent to sign-in / 401 |

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

## 16. Suspend / reactivate / archive / unarchive (as a CSM Manager, on TC Roofing Test)

Before this: accept the TC Roofing Test invite from Gmail (case 4.6) and set a password, so there is an owner to lock out.

| # | Steps | Expected |
|---|---|---|
| 16.1 | Clients > **…** > Manage client > **Suspend client** > reason `Subscription paused (test)` > confirm | Page shows "This client is suspended…", reason, who, when |
| 16.2 | Incognito: sign in as the TC owner | "Your company's portal has been suspended: Subscription paused (test)" |
| 16.3 | **Reactivate** > confirm | Active; TC owner can sign in again |
| 16.4 | **Archive** > confirm | Listed as Archived; TC owner sign-in refused ("Portal archived") |
| 16.5 | Clients > Status **Archived** > **…** > **Unarchive** > confirm | Active again; TC owner can sign in |
| 16.6 | Open TC Roofing Test > scroll to the very bottom | A red-edged **Danger zone** block with **Delete permanently**. It is not next to Suspend / Archive at the top |
| 16.7 | **Delete permanently** | Dialog "Delete client permanently": what is deleted, what is kept (Audit Logs history, the Google Drive folder), the hint "If they might come back, archive them instead.", and a box to type the client's name. The red button is greyed out. Clicking outside the dialog does not close it |
| 16.8 | Type a wrong name, then `tc roofing test` (lower case) | Wrong name: button stays greyed out. Right name in any letter case: the button can be clicked |
| 16.9 | **Cancel**. On the Clients list: **…** on the same row > **Delete permanently** | The same dialog opens from the list |
| 16.10 | Type the name > **Delete permanently** | Button shows "Deleting...", then you are on the Clients list with a green message "TC Roofing Test was deleted. Their Google Drive folder was kept. Delete it in Drive if you no longer need it." The client is no longer in the list under any Status filter |
| 16.11 | Incognito: sign in as the TC owner | "Incorrect email or password." A tab where the owner was still signed in shows "This portal no longer exists…" on the next click |
| 16.12 | **Audit Logs** > Today | "Client deleted permanently" by you, with Client: TC Roofing Test. The older entries about TC Roofing Test are still there |
| 16.13 | In Drive: the TC Roofing Test folder > Share | The folder and its files are still there. The owner, the team and the CSM are no longer on it (CSM Managers still reach it through the parent folder) |
| 16.14 | Sign in as a CSM > My Clients > open a client | There is no Delete permanently button for a CSM; only CSM Managers can delete |
| 16.15 | Add a throwaway client > **Archive** it > Status **Archived** > **…** > **Delete permanently** > type the name > confirm | An archived client can be deleted the same way |

### 16b. The Admin role is now called "CSM Manager" (name only)

| # | Steps | Expected |
|---|---|---|
| 16.20 | Sign in with admin@motionz.ai | Same sign-in and same address (`/admin`). Next to the logo the tag says **CSM Manager**; the header sub-title says **CSM Manager workspace** |
| 16.21 | **My profile** | "You are signed in as CSM Manager." Under Sign-in email: "To change it, ask another CSM Manager." (a CSM sees "ask a CSM Manager") |
| 16.22 | **Staff** | Role badge **CSM Manager**; the Role dropdown offers **CSM** and **CSM Manager**; the intro says "CSM Managers see everything" |
| 16.23 | **Audit Logs** | Entries made by you show "(CSM Manager)" after your email |
| 16.24 | Staff > add a staff member with Role **CSM Manager**, with a throwaway @motionz.ai address | The welcome email says "you have been added as a CSM Manager" |

---

## 17. Live GoHighLevel sync (staging)

GHL: top-left **sub-account switcher**. Only use the sub-account with Location ID **TG1QAGQkANvoJ3UdmZRZ** (check the address bar `/location/TG1QAGQkANvoJ3UdmZRZ/`) and, for 17.4–17.5 only, **Motionz Your Rejuvenation**.

| # | Steps | Expected |
|---|---|---|
| 17.1 | Zydeco sub-account > **Automation > Workflows** | "Sync leads" / "Portal: sync leads" is **Published** |
| 17.2 | **Contacts** > Add contact `Portal Test 2`, email `heshantharushka2002+ghl2@gmail.com` > **Opportunities** > add an opportunity for it in the pipeline | Within ~1 min: portal (owner) **Leads** shows Portal Test 2 with that stage; CSM Manager workspace > **GHL Connect** "Last lead received" updates |
| 17.3 | In GHL drag the opportunity to another stage | Portal Leads shows the new stage, still ONE row |
| 17.4 | Portal (owner) > **Book a Call** > book any free time | ~1 min: Home **Next CSM Call** shows it. GHL (Motionz Your Rejuvenation) > Calendars > Appointments shows it; Automation > Workflows > Portal: CSM calls > Execution Logs has a run |
| 17.5 | The onboarding form no longer goes through GoHighLevel: it is tested in 13c (13.43 to 13.48). In GHL (Motionz Your Rejuvenation) > Contacts, after sending the form in the portal | **No** contact is created or updated by it, and the workflow `Portal: onboarding form` has no new run |
| 17.6 | CSM Manager workspace > **Audit Logs** > Today | "New lead received from GoHighLevel", "Call booking received…", and "Onboarding form sent from the portal" (not "…received from GoHighLevel"), all Client: Zydeco Roof Revival |
| 17.6a | **Only in an approved test sub-account** (Zydeco is a real client now: do not test there) whose `Portal: sync leads` workflow has the **Opportunity Status Changed = Lost** trigger (see `docs/07-integrations/ghl-workflows.md`, "Removing a lead: mark the opportunity Lost"): open the test opportunity > set its status to **Lost** | Within ~1 min the lead is gone from the client's portal **Leads** page and the lead count drops by one. Audit Logs: "Lead removed (marked lost in GoHighLevel)" with the lead's name and the client. A lead request sent earlier about that lead is still under Your requests with its name and phone |
| 17.6b | In the same test sub-account: move another opportunity to a stage whose name only contains the word (for example "Lost Contact Attempt") | The lead stays in the portal and shows that stage |
| 17.6c | Set the lost opportunity back to **Open** and move it to another stage (or add a new opportunity for the same contact) | The lead is back on the Leads page |
| 17.7 | Clean up: GHL delete the test opportunity + contact; cancel the test booking if wanted | Mark the test opportunity **Lost** first so it leaves the portal (deleting it outright is not detected) |

## 18. Phone check

On your phone (or Chrome > F12 > phone icon > iPhone): sign in as owner, CSM Manager and CSM and open every page above.
Expected: no sideways scrolling, bottom bar works (**More** opens the rest), tables turn into cards, the **…** menu and dialogs stay on screen.

## 19. Emails you should have received (Gmail, `from:no-reply@mail.motionz.ai`)

Client invitation · team invitation (+ sent again) · password reset · staff sign-in code · website change request (with and without attachment) · onboarding form submitted (you + CSM) · lead replacement request (Approved, Needs review) · unresponsive lead. Each: correct name, buttons open the **staging** site, nothing broken.
