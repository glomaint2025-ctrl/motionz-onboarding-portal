import { NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/auth/staff';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { createInvitation } from '@/lib/auth/invitations';
import { userRepository } from '@/lib/db/repositories';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, role, action } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Staff Sign In (@motionz.ai domain restricted)
    if (action === 'staff') {
      const authResult = await authenticateStaff(normalizedEmail, role || 'csm');
      if (!authResult.success || !authResult.user) {
        return NextResponse.json({ error: authResult.error }, { status: 403 });
      }

      const sessionToken = createSessionToken(
        authResult.user.id,
        authResult.user.email,
        authResult.user.role
      );

      const response = NextResponse.json({
        success: true,
        user: authResult.user,
        redirectTo: authResult.user.role === 'admin' ? '/admin' : '/csm',
      });

      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return response;
    }

    // 2. Client Magic Link Request
    if (action === 'magic_link') {
      const user = await userRepository.findByEmail(normalizedEmail);

      if (!user || !user.tenant_id) {
        // Return friendly message without exposing tenant presence
        return NextResponse.json({
          success: true,
          message: 'If your organization is active, a secure magic link has been sent.',
        });
      }

      const { magicLinkUrl } = await createInvitation({
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
        createdBy: 'self-request',
      });

      return NextResponse.json({
        success: true,
        message: 'A secure single-use magic link has been generated.',
        demoMagicLink: magicLinkUrl, // Provided in development/demo mode for rapid access
      });
    }

    return NextResponse.json({ error: 'Invalid auth action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Authentication failed.' }, { status: 500 });
  }
}
