import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { resolveBaseUrl } from '@/lib/auth/security-utils';
import { validateText } from '@/lib/validation';
import { csmAssignmentRepository, userRepository } from '@/lib/db/repositories';
import { sendEmail, websiteChangeRequestEmail } from '@/lib/email';
import type { User } from '@/lib/db/schema';
import {
  AttachmentValidationError,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  removeWebsiteRequestFiles,
  uploadWebsiteRequestFile,
  validateAttachment,
  type StoredAttachment,
} from '@/lib/storage';

export const runtime = 'nodejs';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const URL_MAX = 2000;
/** Upper bound for a whole multipart request: the files plus generous room for the text fields. */
const MULTIPART_MAX_BYTES = MAX_ATTACHMENTS * MAX_ATTACHMENT_BYTES + 1024 * 1024;

interface PendingAttachment {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

type FileLike = { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

function isFileLike(value: unknown): value is FileLike {
  return typeof value === 'object' && value !== null && typeof (value as any).arrayBuffer === 'function';
}

/** Reads and validates the uploaded files of a multipart request. Throws AttachmentValidationError. */
async function readAttachments(form: FormData): Promise<PendingAttachment[]> {
  const entries = [...form.getAll('files'), ...form.getAll('files[]')];
  if (entries.some((e) => !isFileLike(e))) {
    throw new AttachmentValidationError('Attachments must be uploaded as files.');
  }
  // Browsers send one empty, unnamed part for an empty file input.
  const files = (entries as unknown as FileLike[]).filter((f) => !(f.size === 0 && !f.name));
  if (files.length > MAX_ATTACHMENTS) {
    throw new AttachmentValidationError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
  }
  const pending: PendingAttachment[] = [];
  for (const file of files) {
    // Cheap checks (type, size) first, so oversized files are rejected before being read.
    validateAttachment({ name: file.name, type: file.type, size: file.size });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { name, contentType } = validateAttachment({ name: file.name, type: file.type, size: bytes.byteLength, bytes });
    pending.push({ name, contentType, bytes });
  }
  return pending;
}

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

    // Two body formats: JSON (text only) or multipart/form-data (text fields plus files[]).
    const isMultipart = (request.headers.get('content-type') || '').toLowerCase().includes('multipart/form-data');
    let body: Record<string, any> | null = null;
    let pending: PendingAttachment[] = [];
    if (isMultipart) {
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (declaredLength > MULTIPART_MAX_BYTES) {
        return NextResponse.json({ error: 'Attachments are too large. Each file can be up to 10 MB.' }, { status: 400 });
      }
      const form = await request.formData().catch(() => null);
      if (!form) {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
      }
      const field = (name: string) => {
        const value = form.get(name);
        return typeof value === 'string' ? value : undefined;
      };
      body = {
        title: field('title'),
        description: field('description'),
        targetPageUrl: field('targetPageUrl'),
        isUrgent: field('isUrgent') === 'true',
      };
      try {
        pending = await readAttachments(form);
      } catch (e: any) {
        if (e instanceof AttachmentValidationError) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
        throw e;
      }
    } else {
      body = await request.json().catch(() => null);
    }
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

    // Store the attachments before recording the request. If storage fails, nothing is recorded
    // and the client is told so.
    const attachments: StoredAttachment[] = [];
    try {
      for (const file of pending) {
        attachments.push(await uploadWebsiteRequestFile(tenantId, file));
      }
    } catch (err: any) {
      console.error('[website-update] Attachment upload failed:', err?.message);
      await removeWebsiteRequestFiles(attachments.map((a) => a.path));
      return NextResponse.json(
        { error: 'Your files could not be uploaded, so the request was not sent. Please try again, or send the request without attachments.' },
        { status: 502 }
      );
    }

    // The audit log entry is the system of record for the request. If it fails we report failure.
    const record = await logAuditEvent({
      tenantId,
      actorEmail: session.email,
      actorRole: session.role,
      actorUserId: session.userId,
      action: 'client.website_change_requested',
      resourceType: 'website_change_request',
      details: {
        title,
        description,
        targetPageUrl,
        isUrgent,
        // Names and storage paths only. Signed URLs are credentials and are never stored here.
        ...(attachments.length > 0
          ? { attachments: attachments.map(({ name, path, size, contentType }) => ({ name, path, size, contentType })) }
          : {}),
      },
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
              attachments: attachments.map(({ name, url, size }) => ({ name, url, size })),
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
      attachments: attachments.map(({ name, size }) => ({ name, size })),
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
