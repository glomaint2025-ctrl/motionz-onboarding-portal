import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { onboardingSubmissionRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertModuleEnabled } from '@/lib/auth/modules';
import { resolveBaseUrl, enforceRateLimit } from '@/lib/auth/security-utils';
import {
  ONBOARDING_FORM_FIELDS,
  MAX_FILES_PER_FIELD,
  MAX_TOTAL_UPLOAD_BYTES,
  SOURCE_KEY,
  SOURCE_PORTAL,
  type OnboardingFileRef,
  type OnboardingFormValues,
} from '@/lib/onboarding/form-definition';
import { validateOnboardingValues, firstErrorMessage } from '@/lib/onboarding/form-validation';
import { findRecentDuplicate, notifyOnboardingSubmitted } from '@/lib/onboarding/submissions';
import { isFileList } from '@/lib/onboarding/answers';
import {
  OnboardingFileError,
  newOnboardingFileFolder,
  removeOnboardingFiles,
  uploadOnboardingFile,
  validateOnboardingFile,
} from '@/lib/storage';

export const runtime = 'nodejs';

/** Upper bound for the whole request: the files plus generous room for the written answers. */
const REQUEST_MAX_BYTES = MAX_TOTAL_UPLOAD_BYTES + 512 * 1024;
const TOO_LARGE = 'Your files are larger than 4 MB in total. Remove a file, or send large files to your CSM on Slack.';
const ONE_HOUR = 60 * 60 * 1000;

const FILE_FIELDS = ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'file');

interface PendingFile {
  fieldKey: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

type FileLike = { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

function isFileLike(value: unknown): value is FileLike {
  return typeof value === 'object' && value !== null && typeof (value as any).arrayBuffer === 'function';
}

/**
 * Reads and validates the uploaded files. `kept` holds, per upload question, how many files of the
 * previous submission the client is keeping (they count towards the limit per question).
 * Returns the files to store and one message per upload question that has a problem.
 */
async function readFiles(
  form: FormData,
  kept: Record<string, OnboardingFileRef[]>
): Promise<{ pending: PendingFile[]; errors: Record<string, string> }> {
  const pending: PendingFile[] = [];
  const errors: Record<string, string> = {};
  const chosen: Record<string, FileLike[]> = {};
  let total = 0;

  for (const field of FILE_FIELDS) {
    const entries = form.getAll(field.key);
    if (entries.some((e) => !isFileLike(e))) {
      errors[field.key] = 'Files must be uploaded as files.';
      continue;
    }
    // Browsers send one empty, unnamed part for an empty file input.
    const files = (entries as unknown as FileLike[]).filter((f) => !(f.size === 0 && !f.name));
    if (files.length + (kept[field.key]?.length || 0) > MAX_FILES_PER_FIELD) {
      errors[field.key] = `You can send up to ${MAX_FILES_PER_FIELD} files here.`;
      continue;
    }
    chosen[field.key] = files;
    total += files.reduce((sum, f) => sum + (f.size || 0), 0);
  }

  if (total > MAX_TOTAL_UPLOAD_BYTES) {
    for (const field of FILE_FIELDS) {
      if (chosen[field.key]?.length) errors[field.key] = TOO_LARGE;
    }
    return { pending: [], errors };
  }

  const usedNames = new Set<string>();
  for (const field of FILE_FIELDS) {
    if (errors[field.key]) continue;
    try {
      for (const file of chosen[field.key] || []) {
        // Cheap checks (type, size) first, so a wrong file is refused before it is read.
        validateOnboardingFile({ name: file.name, type: file.type, size: file.size });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const checked = validateOnboardingFile({ name: file.name, type: file.type, size: bytes.byteLength, bytes });
        // All files of one submission share a folder, so two files cannot have the same name.
        let name = checked.name;
        for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = `${n}-${checked.name}`;
        usedNames.add(name.toLowerCase());
        pending.push({ fieldKey: field.key, name, contentType: checked.contentType, bytes });
      }
    } catch (e: any) {
      if (!(e instanceof OnboardingFileError)) throw e;
      errors[field.key] = e.message;
    }
  }
  return { pending, errors };
}

/**
 * POST /api/portal/[clientId]/onboarding-form  (multipart/form-data)
 *
 * The portal's own onboarding form. One part per question, named by the question key from
 * src/lib/onboarding/form-definition.ts (tick-box questions repeat the part; upload questions
 * carry the files). `<key>__keep` parts name files of the previous submission to carry over.
 *
 * Saves the answers as a new onboarding submission for this client, records it in the audit log
 * and emails the onboarding notification list, exactly like a form that arrives from GoHighLevel.
 */
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
    await assertModuleEnabled(session, tenantId, 'onboarding');

    const rateLimit = await enforceRateLimit(`onboarding_form:${session.userId}`, { maxRequests: 10, windowMs: ONE_HOUR });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'You have sent this form many times in the last hour. Please wait a while and try again.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)) } }
      );
    }

    if (!(request.headers.get('content-type') || '').toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (Number(request.headers.get('content-length') || 0) > REQUEST_MAX_BYTES) {
      return NextResponse.json({ error: TOO_LARGE }, { status: 400 });
    }
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    // ---- Written answers ----
    const values: OnboardingFormValues = {};
    for (const field of ONBOARDING_FORM_FIELDS) {
      if (field.type === 'file') continue;
      values[field.key] = form.getAll(field.key).filter((v): v is string => typeof v === 'string');
    }
    const { answers: textAnswers, errors } = validateOnboardingValues(values);

    // ---- Files kept from the newest earlier submission (only ones that really are in it) ----
    const [previous] = await onboardingSubmissionRepository.listByTenant(tenantId, 1);
    const kept: Record<string, OnboardingFileRef[]> = {};
    for (const field of FILE_FIELDS) {
      const wanted = new Set(form.getAll(`${field.key}__keep`).filter((v): v is string => typeof v === 'string'));
      const earlier = previous?.tenant_id === tenantId ? previous.answers?.[field.label] : undefined;
      kept[field.key] =
        wanted.size > 0 && isFileList(earlier)
          ? earlier
              .filter((f) => wanted.has(f.path) && f.path.startsWith(`${tenantId}/`))
              .map(({ name, path, size }) => ({ name, path, size: Number(size) || 0 }))
          : [];
    }

    // ---- New files ----
    const { pending, errors: fileErrors } = await readFiles(form, kept);
    Object.assign(errors, fileErrors);

    const problem = firstErrorMessage(errors);
    if (problem) {
      return NextResponse.json({ error: problem, fields: errors }, { status: 400 });
    }

    // What this submission will hold, with the new files by name and size only: enough to tell
    // whether the very same form was just sent (double click, retry after a slow reply).
    const preview: Record<string, unknown> = { ...textAnswers, [SOURCE_KEY]: SOURCE_PORTAL };
    for (const field of FILE_FIELDS) {
      const files = [
        ...kept[field.key],
        ...pending.filter((p) => p.fieldKey === field.key).map((p) => ({ name: p.name, path: `${tenantId}/pending/${p.name}`, size: p.bytes.byteLength })),
      ];
      if (files.length > 0) preview[field.label] = files;
    }
    const duplicate = await findRecentDuplicate(tenantId, session.email, preview);
    if (duplicate) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        submissionId: duplicate.id,
        message: 'We already have these answers. Nothing was sent twice.',
      });
    }

    // ---- Store the files, then the submission. If either fails nothing is kept. ----
    const folder = newOnboardingFileFolder();
    const uploaded: { fieldKey: string; file: OnboardingFileRef }[] = [];
    try {
      for (const file of pending) {
        uploaded.push({ fieldKey: file.fieldKey, file: await uploadOnboardingFile(tenantId, folder, file) });
      }
    } catch (err: any) {
      console.error('[onboarding-form] File upload failed:', err?.message);
      await removeOnboardingFiles(uploaded.map((u) => u.file.path));
      return NextResponse.json(
        { error: 'Your files could not be uploaded, so the form was not sent. Please try again, or send it without files.' },
        { status: 502 }
      );
    }

    const answers: Record<string, unknown> = { ...textAnswers };
    for (const field of FILE_FIELDS) {
      const files = [...kept[field.key], ...uploaded.filter((u) => u.fieldKey === field.key).map((u) => u.file)];
      if (files.length > 0) answers[field.label] = files;
    }
    answers[SOURCE_KEY] = SOURCE_PORTAL;

    let submission;
    try {
      submission = await onboardingSubmissionRepository.create({
        tenant_id: tenantId,
        submitter_email: session.email,
        answers,
      });
    } catch (err) {
      await removeOnboardingFiles(uploaded.map((u) => u.file.path));
      throw err;
    }

    // Tell the notification list. A delivery problem does not undo the saved answers.
    let notified = 0;
    try {
      notified = await notifyOnboardingSubmitted({
        tenant: targetTenant,
        submitterEmail: session.email,
        answers,
        baseUrl: resolveBaseUrl(request),
      });
    } catch (err: any) {
      console.error('[onboarding-form] Failed to notify staff:', err?.message);
    }

    await logAuditEvent({
      tenantId,
      actorEmail: session.email,
      actorRole: session.role,
      actorUserId: session.userId,
      action: 'onboarding.form_submitted',
      resourceType: 'onboarding_submission',
      resourceId: submission.id,
      details: { questionsAnswered: Object.keys(textAnswers).length, files: uploaded.length, notified },
    });

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      submittedAt: submission.submitted_at,
      message: 'Thanks — your answers were sent to your Motionz team.',
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
    console.error('[onboarding-form] Failed to save the form:', error?.message);
    return NextResponse.json({ error: 'Your answers could not be saved. Please try again.' }, { status: 500 });
  }
}
