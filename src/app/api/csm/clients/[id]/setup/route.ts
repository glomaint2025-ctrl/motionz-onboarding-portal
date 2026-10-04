import { NextResponse } from 'next/server';
import { getTenantById, getClientSetupSteps, updateClientSetupStep, logAuditEvent } from '@/lib/db';
import { requireAuth, handleAuthError, assertCsmAssigned } from '@/lib/auth/guard';
import { onboardingSubmissionRepository } from '@/lib/db/repositories';
import { validateText } from '@/lib/validation';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session } = await requireAuth(request, { roles: ['csm', 'admin'] });

    const tenant = await getTenantById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }
    await assertCsmAssigned(session, tenant.id);

    const steps = await getClientSetupSteps(tenant.id);
    const completedCount = steps.filter((s) => s.status === 'done').length;
    const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

    return NextResponse.json({
      success: true,
      tenant,
      steps,
      progressPercent,
      onboardingSubmissions: await onboardingSubmissionRepository.listByTenant(tenant.id, 10),
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to fetch setup steps.' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session } = await requireAuth(request, {
      roles: ['csm', 'admin'],
      capability: 'onboarding:update_status',
    });
    const actorEmail = session?.email || 'csm@motionz.ai';
    const actorRole = session?.role || 'csm';

    const tenant = await getTenantById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }
    await assertCsmAssigned(session, tenant.id);

    const body = await request.json();
    const { stepKey, status } = body;

    if (!stepKey) {
      return NextResponse.json({ error: 'Step key is required.' }, { status: 400 });
    }

    // Validate status values per authoritative spec: not_started, in_progress, done
    if (status && !['not_started', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json(
        { error: 'Choose a status: Not started, In progress or Done.' },
        { status: 400 }
      );
    }

    // Only fields that were sent are changed; text is trimmed and length-limited.
    // The client always sees "What it is", "Right now" and "Unlocks", so they cannot be blank.
    // Only "What we need from you" may be left empty.
    const text = (key: string, label: string, max: number, required = true) =>
      key in body ? { [key]: validateText(body[key], label, { max, required }) ?? '' } : {};
    let textUpdates: Record<string, string>;
    try {
      textUpdates = {
        ...text('what_it_is', 'What it is', 2000),
        ...text('right_now', 'Right now', 2000),
        ...text('we_need_from_you', 'What we need from you', 2000, false),
        ...text('unlocks', 'Unlocks', 2000),
      };
      if ('name' in body) textUpdates.name = validateText(body.name, 'Step name', { required: true, max: 120 })!;
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const updatedStep = await updateClientSetupStep(tenant.id, stepKey, {
      ...(status ? { status } : {}),
      ...textUpdates,
    });

    if (!updatedStep) {
      return NextResponse.json({ error: 'Step not found.' }, { status: 404 });
    }

    await logAuditEvent({
      tenantId: tenant.id,
      actorEmail,
      actorRole,
      action: 'step.updated',
      resourceType: 'client_setup_step',
      resourceId: updatedStep.id,
      details: { stepKey, status, changed: Object.keys(textUpdates) },
    });

    return NextResponse.json({ success: true, step: updatedStep });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to update step.' }, { status: 500 });
  }
}
