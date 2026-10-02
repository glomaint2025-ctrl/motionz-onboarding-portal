import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';

export async function POST(
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

    let actorRole = session?.role || 'client';
    let actorEmail = session?.email || 'john@abcroofing.com';

    const body = await request.json();
    const { title, description, targetPageUrl, isUrgent } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'client.website_change_requested',
      resourceType: 'website_change_request',
      details: { title, description, targetPageUrl, isUrgent },
    });

    return NextResponse.json({
      success: true,
      message: 'Website change request submitted to Motionz CSM queue',
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
    return NextResponse.json(
      { error: 'Failed to submit website change request' },
      { status: 500 }
    );
  }
}
