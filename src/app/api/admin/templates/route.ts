import { NextResponse } from 'next/server';
import { portalTemplateRepository, scriptRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

/**
 * GET /api/admin/templates
 * Default portal template, its baseline setup steps, and the master video script templates.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const [{ template, steps }, scripts] = await Promise.all([
      portalTemplateRepository.getDefaultTemplate(),
      scriptRepository.listTemplates(),
    ]);

    return NextResponse.json({ success: true, template: template || null, steps, scripts });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to load templates.' }, { status: 500 });
  }
}
