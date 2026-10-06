# GoHighLevel (GHL) integration

What exists today. The setup steps for each workflow are in [ghl-workflows.md](./ghl-workflows.md).

## How it works

- **One direction only: GHL → portal.** GHL workflows send a **Webhook** action to
  `POST /api/webhooks/ghl` (`src/app/api/webhooks/ghl/route.ts`). The portal **never calls the GHL
  API and never writes to GHL**: there are no API keys, tokens or OAuth, and nothing is polled.
- **Authentication:** the shared secret `GHL_WEBHOOK_SECRET`, sent as the Custom Data entry `secret`
  (the `x-motionz-webhook-secret` header is accepted too). A wrong or missing secret gets 401 and is
  recorded under **Admin → Security Events**.
- **Each client maps to one GHL sub-account** through the **GoHighLevel Location ID** saved on the
  client (**Admin → GHL Connect**). One Location ID can belong to only one live client.

## What is synced

| Event (`customData.event`) | Stored as | Matched to a client by |
|---|---|---|
| `lead` | A row in `leads` (name, email, phone, source, pipeline stage). One row per GHL contact; later events update it. | Location ID |
| `csm_call` | A row in `appointments` (time, status). One row per GHL appointment; later events update it. Shown as "Next CSM Call" on the client's Home. | The booking contact's email (a portal user's email, or the company's primary email) |
| `onboarding_form` | A row in `onboarding_submissions` with the answers, plus an email to the notification list. | The submitter's email; unmatched ones wait under **Admin → Settings & Integrations** |

`ContactCreate` / `ContactUpdate` in GHL's marketplace format are also accepted and stored as leads.
Every other event type is ignored.

## What is embedded, not synced

- The **booking calendar** ([booking.md](./booking.md)) and the **onboarding / A2P forms**
  ([forms.md](./forms.md)) are GHL pages shown in an iframe. The portal learns about a booking or a
  form submission only through the workflows above.

## Where to look when data does not arrive

**Admin → Audit Logs**, search "GoHighLevel":

- `ghl.webhook.lead` / `csm_call` / `onboarding_form`: the event was stored.
- `ghl.webhook.ignored`: received but not stored, with the reason (unknown Location ID, no client
  with that email, duplicate form, unused event type) and the Location ID or the email.
- `ghl.webhook.rejected`: received but malformed (for example no contact id).

Nothing in the log at all means GHL never sent it: check that the workflow is published and its
trigger filters match.

## What does not exist

No GHL REST API calls, no conversations or SMS, no revenue or pipeline totals pulled from GHL, no
`webhook_events` table, no per-client GHL credentials. See "What does NOT sync" in
[ghl-workflows.md](./ghl-workflows.md#what-does-not-sync).
