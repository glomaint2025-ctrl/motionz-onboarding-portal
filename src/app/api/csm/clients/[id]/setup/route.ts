import { NextResponse } from 'next/server';
import { getTenantById, getClientSetupSteps, updateClientSetupStep, logAuditEvent } from '@/lib/db';
import { requireAuth, handleAuthError, assertCsmAssigned } from '@/lib/auth/guard';

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
    const { stepKey, status, what_it_is, right_now, we_need_from_you, unlocks } = body;

    if (!stepKey) {
      return NextResponse.json({ error: 'Step key is required.' }, { status: 400 });
    }

    // Validate status values per authoritative spec: not_started, in_progress, done
    if (status && !['not_started', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be not_started, in_progress, or done.' },
        { status: 400 }
      );
    }

    const updatedStep = await updateClientSetupStep(tenant.id, stepKey, {
      status,
      what_it_is,
      right_now,
      we_need_from_you,
      unlocks,
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
      details: { stepKey, status, rightNow: right_now },
    });

    return NextResponse.json({ success: true, step: updatedStep });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to update step.' }, { status: 500 });
  }
}
