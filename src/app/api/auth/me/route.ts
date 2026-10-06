import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/guard';
import { userRepository } from '@/lib/db/repositories/users.repository';
import { getAvatarUrl } from '@/lib/storage/avatars';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 * Who is signed in: their name, email and role. Used by the header so it shows the real person.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const user = (await userRepository.findById(session.userId)) || (await userRepository.findByEmail(session.email));

    // A deleted or disabled staff member is signed out here, so an open tab does not keep showing the app.
    if ((session.role === 'admin' || session.role === 'csm') && (!user || user.status === 'suspended')) {
      const gone = NextResponse.json(
        { error: 'Your staff access has ended. Please sign in again.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
      gone.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
      return gone;
    }

    return NextResponse.json(
      {
        email: session.email,
        role: session.role,
        fullName: user?.full_name || '',
        // Short-lived signed link to their profile picture; null when they have none.
        avatarUrl: user ? await getAvatarUrl(user.id, user.avatar_path) : null,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch {
    return NextResponse.json({ error: 'Could not load your account details.' }, { status: 500 });
  }
}
