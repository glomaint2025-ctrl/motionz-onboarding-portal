import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, logAuditEvent } from '@/lib/db';
import { verifySession } from '@/lib/auth/session';
import { assertTenantAccess } from '@/lib/auth/permissions';

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

    const tenantId = targetTenant ? targetTenant.id : 'tenant-demo-abc-roofing';

    let actorRole = 'client';
    let actorEmail = 'john@abcroofing.com';

    const sessionCookie = request.cookies.get('motionz_session');
    if (sessionCookie) {
      const session = verifySession(sessionCookie.value);
      if (session) {
        assertTenantAccess(
          { role: session.role, tenantId: session.tenantId },
          tenantId
        );
        actorRole = session.role;
        actorEmail = session.email;
      }
    }

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
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to submit website change request' },
      { status: 500 }
    );
  }
}
