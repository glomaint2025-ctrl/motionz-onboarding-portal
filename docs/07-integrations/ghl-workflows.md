# GoHighLevel Workflows → Portal

The portal never writes to GoHighLevel. GHL **pushes** changes to the portal with standard workflow
**Webhook** actions, so no GHL API keys are needed. Lead stages are changed only in GHL (client answer 1.5).

- **Webhook URL:** `https://<portal-domain>/api/webhooks/ghl` (staging: `https://motionz-onboarding-portal.vercel.app/api/webhooks/ghl`)
- **Secret:** the value of `GHL_WEBHOOK_SECRET` in Vercel. Ask the developer for it; never paste it into documents or chat.

Every webhook action needs these **Custom Data** entries (GHL's standard Webhook action cannot set headers, so the secret travels in the body):

| Key | Value |
|---|---|
| `secret` | the `GHL_WEBHOOK_SECRET` value |
| `event` | `lead`, `csm_call` or `onboarding_form` (see below) |

Requests with a missing or wrong secret are rejected with 401. Events the portal cannot place (unknown sub-account, unknown email) return 200 and are ignored, so GHL does not retry them forever.

---

## 1. Leads: in every client sub-account (put it in the snapshot)

Shows each client's leads and their pipeline stage on the client's **Leads** page.

1. In the client's sub-account: **Automation → Workflows → Create Workflow → Start from scratch**. Name it `Portal: sync leads`.
2. **Triggers:** add **Opportunity Created** and **Pipeline Stage Changed** (no filters, or filter to the "Motionz AI" pipeline).
3. **Action:** **Webhook**, method `POST`, URL as above.
4. **Custom Data:**
   - `secret` = the secret
   - `event` = `lead`
   - `stage` = insert the opportunity's **Pipeline Stage** merge field from the value picker
5. **Save → Publish.**

Add this workflow to the **snapshot** used for new clients, so every new sub-account sends leads automatically.

**Routing:** by the sub-account's **Location ID**. An admin pastes it into **Admin → Clients → (client) → GoHighLevel Location ID** (it is the id in the sub-account URL after `/location/`).

## 2. CSM calls: in Motionz's own sub-account (the one with the CSM booking calendar)

Shows "Your next call with your CSM" on the client's home page (client answers 2.1–2.3).

1. Workflow `Portal: CSM calls`.
2. **Trigger:** **Customer Booked Appointment** and **Appointment Status** (filter: calendar = the CSM booking calendar, id `SRn2ONyB295xnnPR5JwR`).
3. **Action:** **Webhook** `POST` to the URL above.
4. **Custom Data:** `secret` = the secret, `event` = `csm_call`.
5. Publish.

**Routing:** by the booking contact's **email**, matched to the client's portal users or the client's primary email. The portal's booking page pre-fills the client's email, so this normally matches.

## 3. Onboarding form: in the sub-account that owns form `wyM27h1ZCiwGoyXE03oC`

Saves the answers to the client's portal and emails the notification list (client answers 5.2/5.3).

1. Workflow `Portal: onboarding form`.
2. **Trigger:** **Form Submitted**, filter: form = the onboarding form.
3. **Action:** **Webhook** `POST` to the URL above, Custom Data `secret` = the secret, `event` = `onboarding_form`.
4. Optional, in the same workflow (handled in GHL, not the portal): the Facebook campaign launch steps and the Skool invite, once the client confirms what they want (see the client questions list).
5. Publish.

**Routing:** by the submitter's **email**. The portal pre-fills the email on the embedded form. Submissions that match no client appear in **Admin → Settings & Integrations → Unmatched onboarding submissions**, where an admin links them to the right client.

**Who is emailed:** the addresses in **Admin → Settings & Integrations → Onboarding form notifications** (e.g. the media buyer), plus the client's CSM if that box is ticked. They do not need portal accounts.

---

## Testing a workflow

GHL workflows have a **Test Workflow** button. After running it:
- **Leads:** the lead appears on that client's Leads page.
- **CSM call:** the date appears on the client's home page.
- **Onboarding form:** the answers appear on Admin → Clients → (client) and the notification email arrives.

Every received event is also recorded in **Admin → Audit Logs** (`ghl.webhook.*`).
