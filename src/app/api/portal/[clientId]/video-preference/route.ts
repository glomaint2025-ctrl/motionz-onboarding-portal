import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantById,
  getClientScriptPreference,
  setClientScriptPreference,
  logAuditEvent,
} from '@/lib/db';
import { verifySession } from '@/lib/auth/session';
import { assertTenantAccess, assertPermission } from '@/lib/auth/permissions';

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

    const tenantId = targetTenant ? targetTenant.id : 'tenant-demo-abc-roofing';

    const pref = await getClientScriptPreference(tenantId);
    return NextResponse.json({
      preference: pref || {
        tenant_id: tenantId,
        video_preference: 'ai_video',
        custom_name: targetTenant?.primary_contact_name || 'John Smith',
        custom_company: targetTenant?.name || 'ABC Roofing',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve video preference' },
      { status: 500 }
    );
  }
}

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

    let actorRole: any = 'client';
    let actorEmail = 'john@abcroofing.com';

    const sessionCookie = request.cookies.get('motionz_session');
    if (sessionCookie) {
      const session = verifySession(sessionCookie.value);
      if (session) {
        assertTenantAccess(
          { role: session.role, tenantId: session.tenantId },
          tenantId
        );
        assertPermission(session.role, 'client:video_preference');
        actorRole = session.role;
        actorEmail = session.email;
      }
    }

    const body = await request.json();
    const { video_preference, custom_name, custom_company } = body;

    if (video_preference !== 'ai_video' && video_preference !== 'self_filmed') {
      return NextResponse.json(
        { error: 'Preference must be either "ai_video" or "self_filmed"' },
        { status: 400 }
      );
    }

    const updated = await setClientScriptPreference(
      tenantId,
      video_preference,
      custom_name,
      custom_company
    );

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'client.video_preference_updated',
      resourceType: 'script_preference',
      resourceId: updated.id,
      details: { video_preference, custom_name, custom_company },
    });

    return NextResponse.json({ success: true, preference: updated });
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to update video preference' },
      { status: 500 }
    );
  }
}
