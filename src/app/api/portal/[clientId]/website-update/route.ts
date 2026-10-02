import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { resolveBaseUrl } from '@/lib/auth/security-utils';
import { validateText } from '@/lib/validation';
import { csmAssignmentRepository, userRepository } from '@/lib/db/repositories';
import { sendEmail, websiteChangeRequestEmail } from '@/lib/email';
import type { User } from '@/lib/db/schema';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const URL_MAX = 2000;

function validateOptionalUrl(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;
  if (raw.length > URL_MAX) throw new Error('Page URL is too long.');
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('Enter a valid page URL, for example https://yourcompany.com/services.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
    throw new Error('Enter a valid page URL, for example https://yourcompany.com/services.');
  }
  return parsed.toString();
}

/**
 * Staff who should act on a website change request: the client's assigned CSM,
 * or every active admin when no CSM is assigned yet.
 */
async function resolveRecipients(tenantId: string): Promise<{ user: User; isCsm: boolean }[]> {
  const assignment = await csmAssignmentRepository.findByTenant(tenantId);
  if (assignment) {
    const csm = await userRepository.findById(assignment.csm_user_id);
    if (csm && csm.email && csm.status !== 'suspended') return [{ user: csm, isCsm: true }];
  }
  const admins = await userRepository.listByRole('admin');
  return admins.filter((a) => a.email).map((user) => ({ user, isCsm: false }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const rawClientId = params.clientId;
    const targetTenant = await getTenantById(rawClientId);

    if (!targetTenant && rawClientId !== 'demo') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = targetTenant ? targetTenant.id : DEMO_TENANT_UUID;

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    let title: string;
    let description: string;
    let targetPageUrl: string | undefined;
    try {
      title = validateText(body.title, 'Title', { required: true, max: TITLE_MAX }) as string;
      description = validateText(body.description, 'Description', { required: true, max: DESCRIPTION_MAX }) as string;
      targetPageUrl = validateOptionalUrl(body.targetPageUrl);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const isUrgent = body.isUrgent === true;

    // The audit log entry is the system of record for the request. If it fails we report failure.
    const record = await logAuditEvent({
      tenantId,
      actorEmail: session.email,
      actorRole: session.role,
      actorUserId: session.userId,
      action: 'client.website_change_requested',
      resourceType: 'website_change_request',
      details: { title, description, targetPageUrl, isUrgent },
    });

    // Notify the people who will act on it. Delivery problems do not undo the recorded request,
    // but the response states honestly whether anyone was emailed.
    const baseUrl = resolveBaseUrl(request);
    const companyName = targetTenant?.name || 'Demo Portal';
    let notified = 0;
    try {
      const recipients = await resolveRecipients(tenantId);
      const results = await Promise.all(
        recipients.map(({ user, isCsm }) =>
          sendEmail(
            websiteChangeRequestEmail({
              to: user.email,
              toName: user.full_name || undefined,
              companyName,
              requestedBy: session.email,
              title,
              description,
              targetPageUrl,
              isUrgent,
              portalUrl: isCsm ? `${baseUrl}/csm/clients/${tenantId}/setup` : `${baseUrl}/admin/clients/${tenantId}`,
            })
          ).catch(() => ({ delivered: false }))
        )
      );
      notified = results.filter((r) => r.delivered).length;
    } catch (err: any) {
      console.error('[website-update] Failed to notify staff:', err?.message);
    }

    return NextResponse.json({
      success: true,
      requestId: record?.id,
      notified,
      message:
        notified > 0
          ? 'Your request was recorded and emailed to your Motionz team.'
          : 'Your request was recorded. Email notification could not be sent, so your Motionz team will see it in your account activity.',
    });
  } catch (error: any) {
    if (
      error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
    ) {
      return handleAuthError(error);
    }
    return NextResponse.json(
      { error: 'Failed to submit website change request' },
      { status: 500 }
    );
  }
}
