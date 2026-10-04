import { validatePhone, validateText } from '@/lib/validation';
import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, updateTenantProfile, logAuditEvent, DEMO_TENANT_UUID } from '@/lib/db';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';
import { publicTenant } from '../../public-fields';

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

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (!hasPermission(session.role, 'profile:update')) {
      return NextResponse.json({ error: 'You do not have permission to make this change. Ask the account owner.', code: 'FORBIDDEN' }, { status: 403 });
    }
    const actorRole: any = session.role;
    const actorEmail = session.email;

    const parsed = await request.json().catch(() => null);
    const body: Record<string, unknown> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    // The business name is always required. A contact name sent blank is an error (never silently
    // ignored), and a phone sent blank clears the saved number.
    const changes: { name?: string; phone?: string | null; primary_contact_name?: string } = {};
    try {
      changes.name = validateText(body.name, 'Business name', { required: true, max: 255 });
      if ('primary_contact_name' in body) {
        changes.primary_contact_name = validateText(body.primary_contact_name, 'Contact name', { required: true, max: 255 });
      }
      if ('phone' in body) {
        changes.phone = validatePhone(body.phone) ?? null;
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // The primary email identifies the client (invites, onboarding form matching); only admins change it.
    const { name, phone, primary_contact_name } = changes;

    const updated = await updateTenantProfile(tenantId, changes as any);
    if (!updated) {
      return NextResponse.json({ error: 'Your profile could not be saved. Please try again.' }, { status: 500 });
    }

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'tenant.profile_updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      details: { name, phone, primary_contact_name },
    });

    return NextResponse.json({ success: true, tenant: publicTenant(updated) });
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

