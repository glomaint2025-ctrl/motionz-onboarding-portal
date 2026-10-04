import { NextResponse } from 'next/server';
import { scriptRepository, auditLogRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { validateScriptTemplateCreate } from '@/lib/validation/templates';

/**
 * POST /api/admin/templates/scripts
 * Adds a script to the library (title, script content and category are required).
 */
export async function POST(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const validation = validateScriptTemplateCreate(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const script = await scriptRepository.createTemplate(validation.value);

    await auditLogRepository.create({
      actor_email: session.email,
      actor_role: session.role,
      action: 'template.script_created',
      resource_type: 'script_template',
      resource_id: script.id,
      details: { title: script.title, category: script.category },
    });

    return NextResponse.json({ success: true, script }, { status: 201 });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to create script template.' }, { status: 500 });
  }
}
