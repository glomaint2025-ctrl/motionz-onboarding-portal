# Motionz Portal: what we need from you to go live

The portal currently runs on my own test accounts. To go live it must run on accounts that Motionz owns, so you keep control of your data, emails and files.

**How this works**

- There are 8 items. For each one, pick **Option A** (invite me and I set it up) or **Option B** (you do it yourself with the steps given).
- **Never send a password.** Option A always uses an invitation to my email, which you can remove afterwards.
- My email for invitations: **`<MY EMAIL>`**
- Total time for you: about 30–45 minutes with Option A.

| # | What | Why the portal needs it | Cost |
|---|---|---|---|
| 1 | Portal web address | Where clients and staff open the portal | Free (uses your domain) |
| 2 | Vercel account | Runs the portal | Free to start; Pro is about $20/month if needed |
| 3 | Supabase account | Stores all portal data and uploaded files | Free to start; Pro is about $25/month, recommended for backups |
| 4 | Resend account | Sends invitations, password resets and notifications | Free up to 3,000 emails/month |
| 5 | Google account (Drive) | Holds each client's folder, tracking sheet, calculator and contract | Free |
| 6 | Google Cloud key | Roof measurement tool | Pay per use; small. Needs a card on file |
| 7 | GoHighLevel | Sends leads, booked calls and lost leads to the portal | Nothing extra |
| 8 | Slack | Posts lead form requests to your channel | Free |

Prices are approximate; check each provider's site.

---

## 1. Portal web address

Decide the address clients will use, for example `portal.motionz.ai`.

- **You do:** tell me the address you want.
- **Later (2 minutes):** I send you one DNS record to add where your domain is managed (the same place you added the email records). Or invite me there.

## 2. Vercel (runs the portal)

**Option A**
1. Go to vercel.com and sign up with a Motionz email (the "Hobby" plan is fine to start).
2. Settings → Members → Invite → my email. On the free plan, if you cannot invite, tell me and use Option B.

**Option B**
1. Sign up at vercel.com.
2. Account Settings → Tokens → Create Token (name it "Motionz portal setup", expiry 7 days).
3. Send the token to me in a private message, and delete it after go-live.

## 3. Supabase (database and files)

**Option A**
1. Go to supabase.com and sign up with a Motionz email.
2. Create an organization called "Motionz".
3. Organization → Team → Invite → my email, role "Developer" or "Administrator".
4. I create the project and set up the database. Nothing else for you to do.

**Option B**
1. Sign up and create a project called "motionz-portal". Pick the region closest to your clients (for the US: East US). Save the database password somewhere safe.
2. Project Settings → API. Send me privately: the Project URL, the `anon` key and the `service_role` key.
3. I send you one SQL file. Open SQL Editor, paste it, press Run.

## 4. Resend (emails)

Emails are sent from `no-reply@mail.motionz.ai`. The domain is verified today inside my Resend account; for go-live it should be in yours.

**Option A**
1. Go to resend.com and sign up with a Motionz email.
2. Settings → Team → Invite → my email.
3. I add the domain and send you the DNS records to add (3–4 records, same as last time).

**Option B**
1. Sign up at resend.com.
2. Domains → Add Domain → `mail.motionz.ai`. Add the DNS records it shows where your domain is managed. Wait until it says "Verified".
3. API Keys → Create API Key (permission "Sending access"). Send the key to me privately.

## 5. Google account for Drive

Every client gets a Drive folder with their tracking sheet, their Money Leak Calculator and their contract. These must live in a Motionz Google account, not mine.

**You do (either option):** choose which Google account owns the client files, for example `admin@motionz.ai`. It must be a real Google account (Google Workspace or Gmail).

**Option A (a 15-minute screen-share with me, signed in as that account)**
1. Create a Drive folder called "Motionz Portal Clients".
2. Make sure the two templates are in that account's Drive: the Data Sheet template and the Money Leak Calculator.
3. Go to script.google.com → New project → paste the script I give you.
4. Project Settings → Script Properties → add the 4 values I give you.
5. Deploy → New deployment → Web app → Execute as "Me", access "Anyone" → Deploy. Approve the Google permission prompt.
6. Send me the Web app URL.

**Option B:** the same six steps by yourself; I send a written guide with the exact values.

**Good to know**
- When someone is added to the portal, Google emails them a "shared with you" notice from this account. Admins get all client folders, a CSM gets their own clients' folders, a client gets their own files.
- When someone is removed from the portal, their Drive access is removed too.
- **Google can only share with Google accounts.** Each staff email you add to the portal (for example `admin@motionz.ai`) must be a Google Workspace or Google account, otherwise that person cannot open client folders or sheets. Today `admin@motionz.ai` is not one. The same goes for clients: a client whose email is not a Google account sees the portal normally but cannot open their sheets or an uploaded contract.
- Keep the main folder's sharing on **Restricted** (not "Anyone with the link"), and tick **Editors can change permissions and share** if the script runs under a different account than the folder's owner.

## 6. Google Cloud key (roof measurement)

**Option A**
1. Go to console.cloud.google.com, signed in with a Motionz Google account.
2. Create a project called "Motionz Portal" and add a billing account (a card is required).
3. IAM & Admin → IAM → Grant access → my email, role "Editor".
4. I turn on the two services, create the key and lock it to the portal.

**Option B**
1. Create the project and add billing as above.
2. APIs & Services → Library → enable **Solar API** and **Geocoding API**.
3. APIs & Services → Credentials → Create credentials → API key.
4. Edit the key → API restrictions → restrict to those two APIs. Send the key to me privately.

## 7. GoHighLevel

The portal only receives from GHL; it never changes anything in GHL.

**You do**
1. Create an empty test sub-account (for example "Portal Test") and push the "Portal workflows" snapshot into it. This is the one you mentioned; I need it to test real leads.
2. Make sure my GHL user can see that sub-account.

**I do (with your OK, because it edits your live workflows on go-live day)**
- Point the three workflows at the live portal address instead of the test one, with a new secret:
  - `Portal: sync leads` (in each client sub-account, through the snapshot)
  - `Portal: CSM calls` (in Motionz Your Rejuvenation)
  - `Portal: onboarding form` can be switched off; the onboarding form is now inside the portal
- Add one trigger to `Portal: sync leads`: **Opportunity Status Changed = Lost**, so a lead marked Lost disappears from the portal.

**After go-live, for each client:** paste the client's GHL Location ID in Admin → GHL Connect.

## 8. Slack

Lead Replacement and Unresponsive Lead requests post to `#reviews-team` as "Motionz Portal". The connection was created from my Slack user for testing, so it would stop if my user is removed.

**You do (2 minutes)**
1. In Slack: Apps → search "Incoming WebHooks" → Add to Slack → choose the channel → Add.
2. Copy the Webhook URL.
3. In the portal: Admin → Settings & Integrations → Slack messages → paste → Save → "Send a test message".

---

## On go-live day, inside the portal

Sign in as admin and do these once:

1. **Change the admin password.** The current one is a shared test password.
2. **Admin → Staff:** add your real team (admins and CSMs, `@motionz.ai` emails only). Each CSM gets their booking calendar ID under Edit.
3. **Admin → Settings & Integrations → Notification emails:** who receives onboarding forms (media buyer), website requests (website team) and lead forms (review team).
4. **Admin → Settings & Integrations → Staff sign-in security:** choose whether staff get an emailed code at each sign-in.
5. **Admin → Portal Templates and Video Scripts:** check the wording is what you want new clients to see.
6. **Add your first real client** and confirm they receive the invitation and the Google share emails.

## What happens to the test data

The live portal starts empty: no test clients, no test leads, no test staff. Nothing from testing is carried over.

## Reply with

For items 2–6, tell me "A" or "B" for each, plus:
- the portal address you want (item 1)
- the Google account that will own the client files (item 5)
- whether the test sub-account is ready (item 7)
