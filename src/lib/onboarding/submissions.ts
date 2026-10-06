/**
 * What happens when an onboarding form arrives, whichever way it came: from the portal's own form
 * or from the GoHighLevel webhook. One duplicate check and one notification path for both.
 */
import { appSettingsRepository, csmAssignmentRepository, onboardingSubmissionRepository, userRepository } from '../db/repositories';
import { sendEmail, onboardingSubmittedEmail } from '../email';
import type { OnboardingSubmission, Tenant } from '../db/schema';
import { answersAsText, isFileList } from './answers';

export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Key-order independent JSON: Postgres JSONB does not keep the order answers were sent in.
 * Uploaded files compare by name and size, because every upload gets a new storage path.
 */
function stableJson(value: Record<string, unknown> | null | undefined): string {
  const source = value || {};
  return JSON.stringify(
    Object.keys(source)
      .sort()
      .map((key) => {
        const item = source[key];
        return [key, isFileList(item) ? item.map((f) => [f.name, Number(f.size) || 0]) : item];
      })
  );
}

/** The same answers from the same person for the same client within the last 10 minutes, if any. */
export async function findRecentDuplicate(
  tenantId: string | null,
  submitterEmail: string | undefined,
  answers: Record<string, unknown>
): Promise<OnboardingSubmission | undefined> {
  const recent = await onboardingSubmissionRepository.listByTenant(tenantId, 5);
  const wanted = stableJson(answers);
  return recent.find(
    (r) =>
      r.submitter_email === submitterEmail &&
      Date.now() - new Date(r.submitted_at).getTime() < DUPLICATE_WINDOW_MS &&
      stableJson(r.answers) === wanted
  );
}

/**
 * Emails the onboarding notification list: the addresses on Admin → Settings & Integrations, the
 * MEDIA_BUYER_EMAIL address when set, and the client's CSM when that box is ticked.
 * Returns how many people were emailed.
 */
export async function notifyOnboardingSubmitted(params: {
  /** The client the submission belongs to; null when it could not be matched to one. */
  tenant: Tenant | null;
  submitterEmail?: string;
  answers: Record<string, unknown>;
  baseUrl: string;
}): Promise<number> {
  const { tenant, submitterEmail, baseUrl } = params;
  // Text only: uploaded files appear as their names, internal markers are left out.
  const answers = answersAsText(params.answers);

  const settings = await appSettingsRepository.get('notifications');
  const recipients = new Set(settings.onboarding_form_recipients.map((r) => r.toLowerCase()));
  if (process.env.MEDIA_BUYER_EMAIL) recipients.add(process.env.MEDIA_BUYER_EMAIL.toLowerCase());
  if (tenant && settings.notify_assigned_csm) {
    const assignment = await csmAssignmentRepository.findByTenant(tenant.id);
    const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;
    if (csm?.email) recipients.add(csm.email.toLowerCase());
  }

  const companyName = tenant?.name || answers['DBA Business Name'] || submitterEmail || 'Unknown client';
  await Promise.all(
    Array.from(recipients).map((to) =>
      sendEmail(
        onboardingSubmittedEmail({
          to,
          companyName,
          portalUrl: tenant ? `${baseUrl}/admin/clients/${tenant.id}` : `${baseUrl}/admin/integrations`,
          fields: tenant ? answers : { 'Submitted by': submitterEmail || '', ...answers },
          matched: Boolean(tenant),
        })
      )
    )
  );
  return recipients.size;
}
