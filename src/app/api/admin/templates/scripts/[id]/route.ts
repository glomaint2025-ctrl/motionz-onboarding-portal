import { NextResponse } from 'next/server';
import { scriptRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isValidScriptTemplateId, validateScriptTemplateUpdate } from '@/lib/validation/templates';

/**
 * PUT /api/admin/templates/scripts/[id]
 * Updates a master video script template (title and/or script content).
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });

    const id = params?.id;
    if (!isValidScriptTemplateId(id)) {
      return NextResponse.json({ error: 'Invalid script template id.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const validation = validateScriptTemplateUpdate(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const script = await scriptRepository.updateTemplate(id, validation.value);
    if (!script) {
      return NextResponse.json({ error: 'Script template not found.' }, { status: 404 });
    }

    await auditLogRepository.create({
      actor_email: session.email,
      actor_role: session.role,
      action: 'template.script_updated',
      resource_type: 'script_template',
      resource_id: script.id,
      details: { updates: validation.value },
    });

    return NextResponse.json({ success: true, script });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to update script template.' }, { status: 500 });
  }
}
