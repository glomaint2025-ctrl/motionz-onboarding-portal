import { NextResponse } from 'next/server';
import { getTenantById, getClientSetupSteps, updateClientSetupStep, logAuditEvent } from '@/lib/db';
import { requireAuth, handleAuthError, assertCsmAssigned } from '@/lib/auth/guard';
import { onboardingSubmissionRepository, contractRepository } from '@/lib/db/repositories';
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

    const [steps, contracts] = await Promise.all([getClientSetupSteps(tenant.id), contractRepository.listByTenant(tenant.id)]);
    const completedCount = steps.filter((s) => s.status === 'done').length;
    const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

    return NextResponse.json({
      success: true,
      tenant,
      steps,
      progressPercent,
      // Staff-only reminder. Only an admin can attach the contract (Admin → Clients → the client → Contract).
      hasContract: contracts.length > 0,
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
        { error: 'Choose a status: Not started, In progress or Done.', field: 'status' },
        { status: 400 }
      );
    }

    // Only fields that were sent are changed; text is trimmed and length-limited.
    // The client always sees "What it is", "Right now" and "Unlocks", so they cannot be blank.
    // Only "What we need from you" may be left empty.
    // A validation error names its field, so the form can mark the right input.
    const fields: [key: string, label: string, max: number, required: boolean][] = [
      ['what_it_is', 'What it is', 2000, true],
      ['right_now', 'Right now', 2000, true],
      ['we_need_from_you', 'What we need from you', 2000, false],
      ['unlocks', 'Unlocks', 2000, true],
      ['name', 'Step name', 120, true],
    ];
    const textUpdates: Record<string, string> = {};
    for (const [key, label, max, required] of fields) {
      if (!(key in body)) continue;
      try {
        textUpdates[key] = validateText(body[key], label, { max, required }) ?? '';
      } catch (e: any) {
        return NextResponse.json({ error: e.message, field: key }, { status: 400 });
      }
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
