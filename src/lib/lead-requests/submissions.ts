/**
 * What happens around a saved lead form (server only): the duplicate check, the email to the lead
 * review team, the Slack message and the optional automation webhook.
 */
import {
  appSettingsRepository,
  auditLogRepository,
  csmAssignmentRepository,
  leadRequestRepository,
  userRepository,
} from '../db/repositories';
import type { Lead, LeadRequest, Tenant } from '../db/schema';
import { sendEmail, leadRequestEmail } from '../email';
import { leadFormRecipients, uniqueEmails, DUPLICATE_WINDOW_MS } from '../onboarding/submissions';
import { checkWebhookUrl } from './automation';
import { decisionLabel, detailLines, type LeadRequestType } from './definition';
import { leadRequestSlackText } from './slack';
import { postToSlack, savedSlackWebhookUrl } from './slack-send';

export const WEBHOOK_TIMEOUT_MS = 5000;

/** Key-order independent JSON: Postgres JSONB does not keep the order values were saved in. */
function stableJson(value: Record<string, unknown> | null | undefined): string {
  const source = value || {};
  return JSON.stringify(Object.keys(source).sort().map((key) => [key, source[key]]));
}

const digits = (phone: string) => phone.replace(/\D/g, '');

/** The same form for the same lead with the same answers, sent within the last 10 minutes, if any. */
export async function findRecentLeadRequestDuplicate(
  tenantId: string,
  wanted: { type: LeadRequestType; leadId: string | null; leadName: string; leadPhone: string; details: Record<string, unknown> }
): Promise<LeadRequest | undefined> {
  const { rows } = await leadRequestRepository.listByTenant(tenantId, { limit: 20 });
  const details = stableJson(wanted.details);
  return rows.find(
    (r) =>
      r.type === wanted.type &&
      Date.now() - new Date(r.created_at).getTime() < DUPLICATE_WINDOW_MS &&
      (wanted.leadId && r.lead_id
        ? r.lead_id === wanted.leadId
        : r.lead_name.trim().toLowerCase() === wanted.leadName.trim().toLowerCase() && digits(r.lead_phone) === digits(wanted.leadPhone)) &&
      stableJson(r.details) === details
  );
}

interface Recipient {
  to: string;
  portalUrl: string;
}

/**
 * Who is emailed about a lead form: the lead review team from Admin → Settings & Integrations, plus
 * the client's CSM when that box is ticked. If that is nobody, the assigned CSM; with no CSM either,
 * every admin (the same fallback website change requests use).
 */
export async function resolveLeadRequestRecipients(tenant: Pick<Tenant, 'id'>, baseUrl: string): Promise<Recipient[]> {
  const adminUrl = `${baseUrl}/admin/clients/${tenant.id}`;
  const csmUrl = `${baseUrl}/csm/clients/${tenant.id}/setup`;

  const assignment = await csmAssignmentRepository.findByTenant(tenant.id);
  const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;
  const csmEmail = csm?.email && csm.status !== 'suspended' ? csm.email.trim().toLowerCase() : '';

  let team: string[] = [];
  try {
    team = await leadFormRecipients(tenant);
  } catch (err: any) {
    // The fallback people are still emailed if the setting cannot be read.
    console.error('[lead-requests] Could not read the lead team list:', err?.message);
  }
  if (team.length === 0) {
    team = csmEmail ? [csmEmail] : uniqueEmails((await userRepository.listByRole('admin')).map((a) => a.email));
  }
  // A CSM cannot open the admin pages, so their button goes to their own page for this client.
  return team.map((to) => ({ to, portalUrl: to === csmEmail ? csmUrl : adminUrl }));
}

/** Emails a saved request to the lead review team. Returns how many emails were delivered. */
export async function notifyLeadRequest(params: {
  request: LeadRequest;
  tenant: Pick<Tenant, 'id' | 'name'>;
  baseUrl: string;
}): Promise<number> {
  const { request, tenant, baseUrl } = params;
  const recipients = await resolveLeadRequestRecipients(tenant, baseUrl);
  const results = await Promise.all(
    recipients.map(({ to, portalUrl }) =>
      sendEmail(
        leadRequestEmail({
          to,
          type: request.type,
          companyName: tenant.name,
          leadName: request.lead_name,
          leadPhone: request.lead_phone,
          outcome: decisionLabel(request.decision),
          outcomeReason: request.decision_reason || '',
          fields: detailLines(request.type, request.details),
          submittedBy: request.submitter_email || 'Someone',
          portalUrl,
        })
      ).catch(() => ({ delivered: false }))
    )
  );
  return results.filter((r) => r.delivered).length;
}

/** What the automation link receives for every saved lead form. */
export function leadRequestWebhookPayload(request: LeadRequest, tenant: Pick<Tenant, 'id' | 'name' | 'ghl_location_id'>, lead: Lead | null) {
  return {
    type: request.type,
    decision: request.decision,
    decision_reason: request.decision_reason,
    lead: {
      name: request.lead_name,
      phone: request.lead_phone,
      ...(lead?.ghl_contact_id ? { ghl_contact_id: lead.ghl_contact_id } : {}),
    },
    details: request.details,
    client: { id: tenant.id, name: tenant.name, ghl_location_id: tenant.ghl_location_id || null },
    submitted_by_email: request.submitter_email,
    submitted_at: request.created_at,
  };
}

/**
 * Sends a saved request to the automation link, when one is set. Never throws: a link that cannot
 * be reached, answers with an error or takes longer than 5 seconds is written to the audit log.
 * Returns 'off' when no link is set.
 */
export async function sendLeadRequestWebhook(params: {
  request: LeadRequest;
  tenant: Pick<Tenant, 'id' | 'name' | 'ghl_location_id'>;
  lead: Lead | null;
}): Promise<'off' | 'sent' | 'failed'> {
  const { request, tenant, lead } = params;
  let failure = '';
  try {
    const settings = await appSettingsRepository.get('automation');
    if (!settings.lead_request_webhook_url) return 'off';
    // Checked again here: a link saved some other way must still pass the same rules.
    const check = checkWebhookUrl(settings.lead_request_webhook_url);
    if (!check.ok) {
      failure = 'The saved automation link is not a public https link.';
    } else {
      const res = await fetch(check.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(leadRequestWebhookPayload(request, tenant, lead)),
        // Never follow a redirect: it could point somewhere the link check would have refused.
        redirect: 'error',
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (res.ok) return 'sent';
      failure = `The automation link answered with status ${res.status}.`;
    }
  } catch (err: any) {
    failure =
      err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'The automation link did not answer within 5 seconds.'
        : `The automation link could not be reached: ${String(err?.message || err).slice(0, 200)}`;
  }

  console.error('[lead-requests] Automation webhook failed:', failure);
  try {
    await auditLogRepository.create({
      tenant_id: tenant.id,
      actor_email: 'system',
      actor_role: 'system',
      action: 'lead_request.webhook_failed',
      resource_type: 'lead_request',
      resource_id: request.id,
      details: { reason: failure, type: request.type, leadName: request.lead_name },
    });
  } catch (err: any) {
    console.error('[lead-requests] Could not record the webhook failure:', err?.message);
  }
  return 'failed';
}

/**
 * Posts a saved request to the Slack channel set under Admin → Settings & Integrations, when one is
 * set. Never throws: a failure is written to the audit log and the request stays saved.
 * Returns 'off' when no Slack link is set.
 */
export async function sendLeadRequestSlack(params: {
  request: LeadRequest;
  tenant: Pick<Tenant, 'id' | 'name'>;
  baseUrl: string;
}): Promise<'off' | 'sent' | 'failed'> {
  const { request, tenant, baseUrl } = params;
  let failure = '';
  try {
    const url = await savedSlackWebhookUrl();
    if (!url) return 'off';
    const result = await postToSlack(url, leadRequestSlackText(request, tenant.name, `${baseUrl}/admin/clients/${tenant.id}`));
    if (result.ok) return 'sent';
    failure = result.error;
  } catch (err: any) {
    failure = `The Slack setting could not be read: ${String(err?.message || err).slice(0, 200)}`;
  }

  console.error('[lead-requests] Slack message failed:', failure);
  try {
    await auditLogRepository.create({
      tenant_id: tenant.id,
      actor_email: 'system',
      actor_role: 'system',
      action: 'lead_request.slack_failed',
      resource_type: 'lead_request',
      resource_id: request.id,
      details: { reason: failure, type: request.type, leadName: request.lead_name },
    });
  } catch (err: any) {
    console.error('[lead-requests] Could not record the Slack failure:', err?.message);
  }
  return 'failed';
}
