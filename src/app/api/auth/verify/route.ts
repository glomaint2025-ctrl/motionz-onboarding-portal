import { NextResponse } from 'next/server';
import { verifyInvitationToken } from '@/lib/auth/invitations';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const result = await verifyInvitationToken(token);

    if (!result.success || !result.user) {
      return NextResponse.json({ error: result.error || 'Invalid token.' }, { status: 400 });
    }

    const sessionToken = createSessionToken(
      result.user.id,
      result.user.email,
      result.user.role,
      result.tenantId
    );

    const response = NextResponse.json({
      success: true,
      user: result.user,
      redirectTo: `/portal/${result.tenantId || 'demo'}`,
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Verification failed.' }, { status: 500 });
  }
}
