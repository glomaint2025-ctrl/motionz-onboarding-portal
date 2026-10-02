import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, updateTenantProfile, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertPermission } from '@/lib/auth/permissions';

export async function PATCH(
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

    let actorRole: any = 'client';
    let actorEmail = 'john@abcroofing.com';

    if (session) {
      assertPermission(session.role, 'profile:update');
      actorRole = session.role;
      actorEmail = session.email;
    }

    const body = await request.json();
    const { name, phone, primary_contact_name, primary_email } = body;

    const updated = await updateTenantProfile(tenantId, {
      name,
      phone,
      primary_contact_name,
      primary_email,
    });

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'tenant.profile_updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      details: { name, phone, primary_contact_name, primary_email },
    });

    return NextResponse.json({ success: true, tenant: updated });
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
      { error: 'Failed to update tenant profile' },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;

