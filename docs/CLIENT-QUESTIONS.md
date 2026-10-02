# Open Questions for the Client (Motionz)

These are the only items we cannot decide ourselves. Everything else in the questionnaire is built.
Each question says what we built in the meantime, so nothing is blocked while we wait.

## Needs an answer

| # | Topic | Question | What the portal does today |
|---|---|---|---|
| 1 | Onboarding notifications (5.2) | Who should be emailed when a client submits the onboarding form (e.g. your media buyer)? Email only, or should that person also get a portal login? | Admin can enter any list of emails in **Settings & Integrations**; the assigned CSM can also be emailed. Answers are saved on the client's page. |
| 2 | Facebook campaign launch (5.3) | What does "trigger the Facebook campaign launch process" mean for you: the email to the media buyer, a GHL task/workflow, a Slack message, or something else? | The notification email (with all form answers) is the trigger. Anything else can be added in the same GHL workflow. |
| 3 | Skool access (5.3) | Should Skool access be automatic (needs Skool's Zapier plugin and which group/email), or is a "Join Skool" button plus manual approval OK? | "Join Skool" buttons on the client home, onboarding and Tools pages. |
| 4 | Price & payment on the dashboard (2.2) | Do you want each client's package, price and payment status shown on their home page? If yes, typed in by your team, or taken from somewhere (Stripe)? | Not shown (P1.6 says payments don't matter for the portal). |
| 5 | Roof measurement (P1.5) | We recommend Google's Solar API (10,000 free lookups/month, then about $10 per 1,000). Please create a Google Cloud project with billing, enable **Geocoding API** and **Solar API**, and send an API key. Or tell us if you prefer another provider. | Fully built; shows "Coming soon" until the key is added. Squares for Sales has no public API, so it can only be a link. |
| 6 | Signed contracts | Where does each client's signed contract come from: a GHL document, a PDF you upload, or an e-sign link? Should client team members see it, or only the owner? | Admin attaches a contract (title, https link, signed date) per client. Only the account owner sees it. |
| 7 | Orders & shipping | What physical items do you ship to clients (signs, door hangers, product)? If nothing ships, we will hide the Orders page. | Admin can add orders and move them through Ordered → Packaged → Shipped → Delivered (or Issue). |
| 8 | Sending domain | Please let us add 3–4 DNS records to motionz.ai (or a subdomain) so portal emails come from your domain. Until then emails can only be delivered to our test inbox. | Emails are sent through Resend from a test sender. |
| 9 | Follow-up days (1.4) | Is a simple "Day 1–7" follow-up counter on each lead helpful, with a flag after Day 7 for leads still in an early stage? | Shown on the Leads page. |
| 10 | Website change requests | The original brief had a "website change request" form on the client home page. Still wanted? Who should receive them? | Kept; requests email the client's CSM (or all admins if no CSM). |

## Needs your access / action (not decisions)

| # | Item | Why |
|---|---|---|
| A | Add the three GHL workflows (see `docs/07-integrations/ghl-workflows.md`), ideally in your client snapshot | So leads, CSM calls and onboarding forms flow into the portal |
| B | Each client's GHL **Location ID** entered in the portal (Admin → Clients) | Routes each sub-account's leads to the right client |
| C | Real CSM and admin accounts (Admin → Staff) | Only seed/test staff exist today |
