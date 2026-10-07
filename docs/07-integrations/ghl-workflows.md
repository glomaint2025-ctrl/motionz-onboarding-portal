# GoHighLevel Workflows → Portal

The portal never writes to GoHighLevel. GHL **pushes** changes to the portal with standard workflow
**Webhook** actions, so no GHL API keys are needed. Lead stages are changed only in GHL (client answer 1.5).

- **Webhook URL:** `https://<portal-domain>/api/webhooks/ghl` (staging: `https://motionz-onboarding-portal.vercel.app/api/webhooks/ghl`)
- **Secret:** the value of `GHL_WEBHOOK_SECRET` in Vercel. Ask the developer for it; never paste it into documents or chat.

Every webhook action needs these **Custom Data** entries (GHL's standard Webhook action cannot set headers, so the secret travels in the body):

| Key | Value |
|---|---|
| `secret` | the `GHL_WEBHOOK_SECRET` value |
| `event` | `lead`, `lead_lost`, `lead_unqualified`, `csm_call` or `onboarding_form` (see below) |

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

### Removing a lead: mark the opportunity Lost

A lead whose opportunity is marked **Lost** (or **Abandoned**) in GoHighLevel disappears from the
client's **Leads** page in the portal. This is how the reviews team removes a lead: they do not
delete anything, they set the opportunity's status to Lost.

Set it up once, in the same `Portal: sync leads` workflow:

1. Open `Portal: sync leads` in the client's sub-account.
2. **Add Trigger → Opportunity Status Changed.** Add the filter **Status = Lost**. If Abandoned
   opportunities should also be removed, add a second **Opportunity Status Changed** trigger with
   **Status = Abandoned**.
3. This trigger must send a different `event` from the other two, so give it its own branch: after
   the triggers add an **If / Else** on "Opportunity status is Lost (or Abandoned)". In that branch
   add a **Webhook** action, method `POST`, the same URL as above, with **Custom Data**:
   - `secret` = the secret
   - `event` = `lead_lost`

   The other branch keeps the existing Webhook action (`event` = `lead`, `stage` = the Pipeline
   Stage merge field). If your GoHighLevel plan has no If / Else, make a second workflow
   `Portal: remove lost leads` with only this trigger and this Webhook action; the result is the same.
4. **Save → Publish.**
5. **Update the snapshot** so new sub-accounts get it too.

What the portal does with it:

- The lead is removed from that client's Leads page and counts. Audit Logs: "Lead removed (marked
  lost in GoHighLevel)" with the lead's name and the client.
- Lead Replacement and Unresponsive Lead requests the client already sent about that lead stay under
  "Your requests" and on the staff "Lead requests" card: each keeps its own copy of the lead's name
  and phone number.
- If the portal never had that lead, nothing happens (Audit Logs: "GoHighLevel event ignored: Lead
  marked lost, but it is not in the portal.").
- **Re-opening:** if the same contact later gets a new open opportunity, or the opportunity is set
  back to Open and its stage changes, the normal `lead` event creates the lead again.

The portal also treats an ordinary `lead` event as "lost" when it carries an opportunity status of
`lost` or `abandoned` (Custom Data `status`, or the standard `status` / opportunity status fields),
or when the pipeline stage is named exactly **Lost** or **Abandoned**. A stage that only contains
the word, such as "Lost Contact Attempt", is a normal stage and the lead stays.

### Option: only tagged contacts count as leads

By default a contact counts as a lead **as soon as its opportunity is created**. If the team wants
to decide by hand who counts, the portal can wait for a tag instead: a contact becomes a lead only
once it carries a chosen tag in GoHighLevel, for example **Qualified**. One setting covers every client.

**What the client sees:** a contact appears on the client's **Leads** page the moment it is tagged,
with its current pipeline stage if GoHighLevel includes one in the event, otherwise as **New**. Until
then the client sees nothing of that contact. Clients are not told about the tag.

Set it up in this order (GoHighLevel first, so nothing is missed):

1. **In `Portal: sync leads`** (each client sub-account, and the snapshot): **Add Trigger → Contact
   Tag**, filter **Tag Added = Qualified**. Keep **Opportunity Created** and **Pipeline Stage
   Changed**. All three triggers go to the **same Webhook action** with `event` = `lead` (and
   `stage` = the Pipeline Stage merge field, as before). **Save → Publish.**
   - Keep the two opportunity triggers so stage changes keep flowing. The portal ignores them for
     contacts that are not tagged yet, and uses them for contacts that already are leads.
   - GoHighLevel's Webhook action normally sends the contact's tags by itself (the `tags` field of
     its standard data), so nothing should be needed in Custom Data. **Check this on the first
     test** (not yet confirmed against a live workflow): if a tagged contact is answered with
     "not tagged", add a Custom Data entry `tags` = the contact's **Tags** merge field.
2. **Optional, to remove a lead when the tag is taken off:** a second small workflow
   `Portal: lead tag removed` with the trigger **Contact Tag**, filter **Tag Removed = Qualified**,
   and one **Webhook** action (`POST`, the same URL) with Custom Data `secret` = the secret and
   `event` = `lead_unqualified`. **Save → Publish.** Without this workflow a lead stays in the portal
   after its tag is removed.
3. **In the portal:** **Admin → GHL Connect → "When does a contact count as a lead?"** → choose
   **Only when the contact has this tag**, type `Qualified`, **Save**. The name must match the tag in
   GoHighLevel; capital letters and spaces around it do not matter.
4. **Update the snapshot** so new sub-accounts get the new trigger (and the second workflow).

What the portal does with it:

- **Tagged contact** (`lead` event whose tags include the tag): the lead is created or updated as usual.
- **Untagged contact that is not a lead yet:** nothing is stored. GoHighLevel gets the answer
  `ignored: Contact is not tagged "Qualified" yet.` This is normal and is **not** written to the
  Audit Logs, because every untagged contact in every sub-account would fill them.
- **A contact that already is a lead** keeps updating (stage, name, phone) even when a later event
  no longer carries the tag. A lead is never removed just because the tag is missing from an event.
- **`lead_unqualified`:** the lead is removed. Audit Logs: "Lead removed (tag taken off in
  GoHighLevel)" with the lead's name and the client. If the portal does not have that lead, the event
  is ignored and recorded. While no tag is set in the portal this event does nothing.
- **Lost / Abandoned** works exactly as described above and always wins, tagged or not.
- **Leads already in the portal stay** when the tag rule is switched on. They are not checked again.
- **Switching back:** choose "As soon as an opportunity is created (default)" and save. Contacts
  that were ignored while the rule was on appear with their next stage change.

The portal reads the tags from `tags` (a comma-separated list such as `hot, Qualified`, or a list of
names), from `contact.tags`, and from Custom Data `tags`.

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

## 3. Onboarding form: NO LONGER NEEDED (since 7 Oct 2026)

**The onboarding form is now built into the portal.** Clients fill it in on **Setup Progress → Open
onboarding form**, and the portal saves the answers and sends the notification emails itself. The
workflow `Portal: onboarding form` is not needed any more: set it to **Draft** (or delete it). New
sub-accounts and snapshots do not need it.

**What stops happening in GoHighLevel — check this before switching the workflow off:**

- The GHL form "Onboarding Rejuvenation | Forms" (`wyM27h1ZCiwGoyXE03oC`) is no longer shown to
  clients, so it receives **no new submissions**.
- **The contact is not created or updated by this form any more.** The answers (business name,
  phones, address, the custom fields the form filled) are saved in the portal only; nothing is
  written to the GHL contact. The portal never writes to GHL.
- **Any GHL automation that started from that form submission no longer starts.** That includes
  anything added under step 4 below (Facebook campaign launch steps, the Skool invite) and any other
  workflow with the trigger **Form Submitted = the onboarding form**: tags, pipeline moves,
  internal notifications, follow-up messages. Each of these must be **triggered another way**, for
  example by hand when the "Onboarding form submitted" email arrives, or from a different GHL
  trigger (a tag added by the team, an opportunity stage, the contract being signed).
- The notification email itself is **not** affected: the portal sends it to the same list
  (**Admin → Settings & Integrations → Onboarding form notifications**, plus the client's CSM when
  that box is ticked).

If the old workflow is left published and someone submits the GHL form directly (an old link or
bookmark), the portal still accepts it: the `onboarding_form` event below keeps working and the
answers appear next to the ones sent from the portal.

### The old setup (kept for reference)

Saved the answers to the client's portal and emailed the notification list (client answers 5.2/5.3).

1. Workflow `Portal: onboarding form`.
2. **Trigger:** **Form Submitted**, filter: form = the onboarding form.
3. **Action:** **Webhook** `POST` to the URL above, Custom Data `secret` = the secret, `event` = `onboarding_form`.
4. Optional, in the same workflow (handled in GHL, not the portal): the Facebook campaign launch steps and the Skool invite, once the client confirms what they want (see the client questions list).
5. Publish.

**Routing:** by the submitter's **email**. Submissions that match no client appear in **Admin → Settings & Integrations → Unmatched onboarding submissions**, where an admin links them to the right client.

**Who is emailed:** the addresses in **Admin → Settings & Integrations → Onboarding form notifications** (e.g. the media buyer), plus the client's CSM if that box is ticked. They do not need portal accounts.

---

## Testing a workflow

GHL workflows have a **Test Workflow** button. After running it:
- **Leads:** the lead appears on that client's Leads page.
- **Lost lead:** mark a test opportunity Lost; within about a minute the lead is gone from that client's Leads page and Audit Logs shows "Lead removed (marked lost in GoHighLevel)".
- **Lead tag (only when a tag is set under Admin → GHL Connect):** create a test opportunity without the tag: it does not appear. Add the tag to the contact: within about a minute it appears on that client's Leads page. With the optional second workflow, removing the tag removes the lead again.
- **CSM call:** the date appears on the client's home page.
- **Onboarding form (old workflow only, see section 3):** the answers appear on Admin → Clients → (client) and the notification email arrives.

Every received event is also recorded in **Admin → Audit Logs** (`ghl.webhook.*`): stored events by type, and events that were not stored as `ghl.webhook.ignored` (could not be placed) or `ghl.webhook.rejected` (malformed), each with the reason and the Location ID or email.

---

## What does NOT sync

The portal only stores what a workflow sends it. It never reads from GHL and never writes to GHL.

- **Deleting outright in GHL is not detected.** A contact or opportunity that is *deleted* in GHL sends nothing, so the lead stays in the portal. To remove a lead from the portal, mark its opportunity **Lost** (see "Removing a lead: mark the opportunity Lost" above); that is detected. An appointment deleted in GHL also stays (a *cancelled* one is updated and no longer shown as the next call; a deleted one sends nothing).
- **A lead marked Lost before the Lost trigger was published stays.** Only status changes made after the trigger is live reach the portal.
- **Contact edits arrive late.** A changed name, email or phone reaches the portal only with that lead's next stage change, because the workflow fires on Opportunity Created and Pipeline Stage Changed, not on contact edits.
- **Older leads are not imported.** Leads that existed before the workflow was published appear only once their stage changes.
- **With a lead tag set, untagged contacts are not stored at all**, and these ignored events are not listed in the Audit Logs. A contact tagged later appears only when GoHighLevel sends its next event: straight away if the workflow has the **Contact Tag (Tag Added)** trigger, otherwise not until its next stage change.
- **Contacts tagged before the Contact Tag trigger was published are not picked up.** They appear with their next stage change (or take the tag off and add it again).
- **Removing the tag does not remove the lead by itself.** That needs the optional `lead_unqualified` workflow (see "Option: only tagged contacts count as leads"); without it, mark the opportunity Lost.
- **Changing or switching on the tag does not re-check existing leads.** Leads already in the portal stay until they are marked Lost or their tag-removed event arrives.
- **A booking under a different email is ignored.** A CSM call is matched by the booking email. If it matches no portal user and no client's primary email, nothing is shown to the client; the booking email and start time are recorded under **Admin → Audit Logs** ("GoHighLevel event ignored: No client matches this contact email.").
- **A sub-account with no Location ID in the portal is ignored.** Its leads are recorded in the Audit Logs as ignored (with the Location ID) until an admin connects it; they are not replayed afterwards.
- **The portal never writes to GHL.** Nothing changed in the portal (client details, team, setup steps) is sent to GHL, and lead stages cannot be changed from the portal.
