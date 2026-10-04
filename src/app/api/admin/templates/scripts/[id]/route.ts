import { NextResponse } from 'next/server';
import { scriptRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isValidScriptTemplateId, validateScriptTemplateUpdate } from '@/lib/validation/templates';

/**
 * PUT /api/admin/templates/scripts/[id]
 * Updates a master video script template (title, script content and/or category).
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

/**
 * DELETE /api/admin/templates/scripts/[id]
 * Removes a script from the library. Clients who had picked it simply have that pick cleared.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });

    const id = params?.id;
    if (!isValidScriptTemplateId(id)) {
      return NextResponse.json({ error: 'Invalid script template id.' }, { status: 400 });
    }

    const removed = await scriptRepository.deleteTemplate(id);
    if (!removed) {
      return NextResponse.json({ error: 'Script template not found.' }, { status: 404 });
    }

    await auditLogRepository.create({
      actor_email: session.email,
      actor_role: session.role,
      action: 'template.script_deleted',
      resource_type: 'script_template',
      resource_id: removed.id,
      // Keep the full text in the audit trail so a deleted script can be restored by hand.
      details: { title: removed.title, category: removed.category, script_content: removed.script_content },
    });

    return NextResponse.json({ success: true, id: removed.id });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to delete script template.' }, { status: 500 });
  }
}
