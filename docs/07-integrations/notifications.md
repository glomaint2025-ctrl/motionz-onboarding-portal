# Notifications

What exists today: **email only**. There is no web push, no SMS, no in-app notification centre and
no Slack alerting.

## Emails the portal sends

Sent through Resend (`RESEND_API_KEY`) or Brevo (`BREVO_API_KEY`); code in `src/lib/email/`.
Without a provider key, emails are printed to the server console (development only).

| Email | Sent when | To |
|---|---|---|
| Invitation | An admin, CSM or account owner invites someone | The invited person |
| Sign-in link | A sign-in link is issued for an existing client user | That user |
| Staff sign-in code | A staff member signs in (when codes are switched on) | That staff member |
| Password reset | Someone uses "Forgot password" | That person |
| Onboarding form received | GHL sends an `onboarding_form` event (see [ghl-workflows.md](./ghl-workflows.md)) | The list in **Admin → Settings & Integrations → Onboarding form notifications**, plus `MEDIA_BUYER_EMAIL`, plus the client's CSM when that box is ticked |
| Website change request | A client submits a website change request | Motionz staff |

## Not built

Web push (service worker, VAPID keys, `push_subscriptions` table), SMS, and a notification
dispatcher do not exist. Text messages to homeowners are handled inside GoHighLevel, not by the portal.
