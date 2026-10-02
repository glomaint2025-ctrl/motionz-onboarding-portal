import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantById,
  getClientScriptPreference,
  setClientScriptPreference,
  logAuditEvent,
  DEMO_TENANT_UUID,
} from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';

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
    await assertPortalAccess(request, targetTenant, rawClientId);

    const pref = await getClientScriptPreference(tenantId);
    return NextResponse.json({
      // No saved preference yet: report that honestly (null) and expose the tenant's real
      // names so the page can personalise scripts without inventing anything.
      preference: pref || null,
      defaults: {
        custom_name: targetTenant?.primary_contact_name || '',
        custom_company: targetTenant?.name || '',
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

    const tenantId = targetTenant ? targetTenant.id : DEMO_TENANT_UUID;

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (!hasPermission(session.role, 'client:video_preference')) {
      return NextResponse.json({ error: 'You do not have permission to make this change. Ask the account owner.', code: 'FORBIDDEN' }, { status: 403 });
    }
    const actorRole: any = session.role;
    const actorEmail = session.email;

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
    if (
      error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
    ) {
      return handleAuthError(error);
    }
    return NextResponse.json(
      { error: 'Failed to update video preference' },
      { status: 500 }
    );
  }
}
