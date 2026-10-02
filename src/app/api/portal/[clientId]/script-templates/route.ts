import { NextRequest, NextResponse } from 'next/server';
import { getTenantById } from '@/lib/db';
import { scriptRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';

/**
 * GET /api/portal/[clientId]/script-templates
 * Master video script templates (raw, with {{client_name}} / {{company_name}} placeholders).
 * Interpolation happens client-side so the client can preview custom names live.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const rawClientId = params.clientId;
    const targetTenant = await getTenantById(rawClientId);

    if (!targetTenant && rawClientId !== 'demo') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Enforce active account, tenant suspension, and tenant isolation
    await assertPortalAccess(request, targetTenant, rawClientId);

    const templates = await scriptRepository.listTemplates();
    const scripts = templates.map((t) => ({
      id: t.id,
      title: t.title,
      script_content: t.script_content,
      sort_order: t.sort_order,
    }));

    return NextResponse.json(
      { scripts },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    if (
      error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
    ) {
      return handleAuthError(error);
    }
    return NextResponse.json({ error: 'Failed to retrieve video scripts' }, { status: 500 });
  }
}
