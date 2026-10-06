import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertModuleEnabled } from '@/lib/auth/modules';
import { isOnboardingFilePath } from '@/lib/onboarding/answers';
import { getOnboardingFileDownload } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/**
 * GET /api/portal/[clientId]/onboarding-files?path=<tenantId>/<folder>/<name>
 * Opens one file uploaded with the onboarding form: sends the browser to a signed link that works
 * for a few minutes. Only for someone who can open this client's Setup Progress (the client, a
 * team member with that section, an admin, the assigned CSM), and only for this client's files.
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

    const tenantId = targetTenant ? targetTenant.id : DEMO_TENANT_UUID;

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);
    // Files are never part of the public demo preview.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    await assertModuleEnabled(session, tenantId, 'onboarding');

    const path = new URL(request.url).searchParams.get('path') || '';
    // The first part of the path is the client the file belongs to.
    if (!isOnboardingFilePath(path) || !path.startsWith(`${tenantId}/`)) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }

    const download = await getOnboardingFileDownload(path);
    if (!download) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
    if (download.kind === 'redirect') {
      return NextResponse.redirect(download.url, { status: 302, headers: NO_STORE });
    }
    // Mock mode (tests / local): there is no storage service to link to, so send the file itself.
    return new NextResponse(Buffer.from(download.bytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': download.contentType,
        'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    if (
      error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
    ) {
      return handleAuthError(error);
    }
    console.error('[onboarding-files] Failed to open a file:', error?.message);
    return NextResponse.json({ error: 'This file could not be opened. Please try again.' }, { status: 500 });
  }
}
