import { NextResponse } from 'next/server';
import { portalTemplateRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isValidStepKey, validateTemplateStepUpdate } from '@/lib/validation/templates';

/**
 * PUT /api/admin/templates/steps/[stepKey]
 * Updates the default template's copy for one setup step. Affects newly provisioned clients only;
 * existing clients keep their own client_setup_steps.
 */
export async function PUT(request: Request, { params }: { params: { stepKey: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });

    const stepKey = params?.stepKey;
    if (!isValidStepKey(stepKey)) {
      return NextResponse.json({ error: 'Invalid step key.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const validation = validateTemplateStepUpdate(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const step = await portalTemplateRepository.updateStep(stepKey, validation.value);
    if (!step) {
      return NextResponse.json({ error: 'Template step not found.' }, { status: 404 });
    }

    await auditLogRepository.create({
      actor_email: session.email,
      actor_role: session.role,
      action: 'template.step_updated',
      resource_type: 'template_step',
      resource_id: step.id,
      details: { step_key: stepKey, template_id: step.template_id, updates: validation.value },
    });

    return NextResponse.json({ success: true, step });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to update template step.' }, { status: 500 });
  }
}
