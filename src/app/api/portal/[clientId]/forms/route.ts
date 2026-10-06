import { NextRequest, NextResponse } from 'next/server';
import { getTenantById } from '@/lib/db';
import { resolveFormSettings } from '@/lib/db/repositories/app-settings.repository';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';

/**
 * GET /api/portal/[clientId]/forms
 * The GoHighLevel form ids the portal shows (only the Texting registration form), plus the email to
 * pre-fill. The onboarding form and the two lead forms are built into the portal, so they are not here.
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
    const session = await assertPortalAccess(request, targetTenant, rawClientId);

    const forms = await resolveFormSettings();
    const isClient = session?.role === 'client' || session?.role === 'client_member';

    return NextResponse.json(
      {
        forms,
        // Clients and their team fill forms in as themselves; staff viewing the portal use the client's email.
        prefillEmail: (isClient ? session?.email : targetTenant?.primary_email) || '',
      },
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
    return NextResponse.json({ error: 'Failed to retrieve the forms' }, { status: 500 });
  }
}
