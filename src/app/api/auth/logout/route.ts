import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { auditLogRepository, securityEventRepository } from '@/lib/db/repositories';

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

    if (sessionCookie) {
      const token = sessionCookie.split('=')[1];
      const payload = verifySession(token);
      if (payload) {
        await auditLogRepository.create({
          tenant_id: payload.tenantId,
          actor_email: payload.email,
          actor_role: payload.role,
          action: 'auth.logout',
          resource_type: 'session',
          details: { userId: payload.userId },
        });

        await securityEventRepository.create({
          event_type: 'auth_logout',
          severity: 'low',
          tenant_id: payload.tenantId,
          details: { email: payload.email, role: payload.role, timestamp: new Date().toISOString() },
        });
      }
    }

    const response = NextResponse.json({
      success: true,
      message: 'Signed out successfully.',
      redirectTo: '/auth/login',
    });

    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to process logout request.' },
      { status: 500 }
    );
  }
}
