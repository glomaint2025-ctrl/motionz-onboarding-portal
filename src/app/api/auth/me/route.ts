import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/guard';
import { userRepository } from '@/lib/db/repositories/users.repository';

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

    return NextResponse.json(
      {
        email: session.email,
        role: session.role,
        fullName: user?.full_name || '',
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch {
    return NextResponse.json({ error: 'Could not load your account details.' }, { status: 500 });
  }
}
