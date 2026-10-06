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

Requests with a missing or wrong secret are rejected with 401 and recorded under **Admin → Security Events**. Events the portal cannot place (unknown sub-account, unknown email) return 200 and are ignored, so GHL does not retry them forever; each one is recorded under **Admin → Audit Logs** as "GoHighLevel event ignored" with the reason.

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

**Routing:** by the sub-account's **Location ID**. An admin pastes it under **Admin → GHL Connect** (it is the id in the sub-account URL after `/location/`). A Location ID can be connected to only one live client; saving one that another client already uses is refused.

## 2. CSM calls: in Motionz's own sub-account (the one with the CSM booking calendar)

Shows "Your next call with your CSM" on the client's home page (client answers 2.1–2.3).

1. Workflow `Portal: CSM calls`.
2. **Trigger:** **Customer Booked Appointment** and **Appointment Status** (filter: calendar = the CSM booking calendar, id `SRn2ONyB295xnnPR5JwR`).
3. **Action:** **Webhook** `POST` to the URL above.
4. **Custom Data:** `secret` = the secret, `event` = `csm_call`.
5. Publish.

**Routing:** by the booking contact's **email**, matched to the client's portal users or the client's primary email. The portal's booking page pre-fills the client's email, so this normally matches.

### When a CSM gets their own booking calendar

Each client's **Book a Call** page shows their assigned CSM's calendar. A CSM with no calendar of their own uses the default calendar (`SRn2ONyB295xnnPR5JwR` unless changed under **Admin → Staff → Default booking calendar**). No code change is needed to add one. Do both steps:

1. **In the portal:** **Admin → Staff → Edit** (the CSM) → paste the calendar id into **Booking calendar ID (GoHighLevel)** and save. The id is the last part of the calendar's booking link: GHL → Calendars → the CSM's calendar → `…/widget/booking/<id>`. Leave the field empty to go back to the default calendar.
2. **In GHL:** open the `Portal: CSM calls` workflow and add the new calendar to the **calendar filter of both triggers** (Customer Booked Appointment and Appointment Status), then publish. Without this, clients can still book on the new calendar but those bookings never reach the portal, so "Your next call with your CSM" stays empty for that CSM's clients.

The same applies if the default calendar is changed: the new default must also be in the workflow's trigger filters.

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

Every received event is also recorded in **Admin → Audit Logs** (`ghl.webhook.*`): stored events by type, and events that were not stored as `ghl.webhook.ignored` (could not be placed) or `ghl.webhook.rejected` (malformed), each with the reason and the Location ID or email.

---

## What does NOT sync

The portal only stores what a workflow sends it. It never reads from GHL and never writes to GHL.

- **Deletions in GHL are not mirrored.** A lead, contact or opportunity deleted in GHL stays in the portal. An appointment deleted in GHL also stays (a *cancelled* one is updated and no longer shown as the next call; a deleted one sends nothing).
- **Contact edits arrive late.** A changed name, email or phone reaches the portal only with that lead's next stage change, because the workflow fires on Opportunity Created and Pipeline Stage Changed, not on contact edits.
- **Older leads are not imported.** Leads that existed before the workflow was published appear only once their stage changes.
- **A booking under a different email is ignored.** A CSM call is matched by the booking email. If it matches no portal user and no client's primary email, nothing is shown to the client; the booking email and start time are recorded under **Admin → Audit Logs** ("GoHighLevel event ignored: No client matches this contact email.").
- **A sub-account with no Location ID in the portal is ignored.** Its leads are recorded in the Audit Logs as ignored (with the Location ID) until an admin connects it; they are not replayed afterwards.
- **The portal never writes to GHL.** Nothing changed in the portal (client details, team, setup steps) is sent to GHL, and lead stages cannot be changed from the portal.
