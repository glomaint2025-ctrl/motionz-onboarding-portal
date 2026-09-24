import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getTeamMembers, listTeamMemberInvitations, logAuditEvent } from '@/lib/db';
import { verifySession } from '@/lib/auth/session';
import { assertTenantAccess, assertPermission } from '@/lib/auth/permissions';
import { createInvitation } from '@/lib/auth/invitations';

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

    const sessionCookie = request.cookies.get('motionz_session');
    if (sessionCookie) {
      const session = verifySession(sessionCookie.value);
      if (session) {
        assertTenantAccess(
          { role: session.role, tenantId: session.tenantId },
          tenantId
        );
      }
    }

    const [members, invitations] = await Promise.all([
      getTeamMembers(tenantId),
      listTeamMemberInvitations(tenantId),
    ]);

    return NextResponse.json({ members, invitations });
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to retrieve team members' },
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
        assertPermission(session.role, 'team:invite');
        actorRole = session.role;
        actorEmail = session.email;
      }
    }

    const body = await request.json();
    const { email, phone } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    if (!phone || String(phone).trim().length < 7) {
      return NextResponse.json(
        { error: 'A valid phone number is required for team member invitations' },
        { status: 400 }
      );
    }

    const assignedRole = body.role === 'client' ? 'client' : 'client_member';

    const inviteResult = await createInvitation({
      tenantId,
      email: String(email).trim().toLowerCase(),
      role: assignedRole,
      phone: String(phone).trim(),
      createdBy: actorEmail,
      expiresInHours: 72,
    });

    await logAuditEvent({
      tenantId,
      actorEmail,
      actorRole,
      action: 'team.invite_sent',
      resourceType: 'user_invitation',
      resourceId: inviteResult.invitation.id,
      details: { email: String(email).trim().toLowerCase(), role: assignedRole, phone: String(phone).trim() },
    });

    return NextResponse.json({
      success: true,
      invitation: inviteResult.invitation,
      magicLinkUrl: inviteResult.magicLinkUrl,
    });
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to invite team member' },
      { status: 500 }
    );
  }
}
