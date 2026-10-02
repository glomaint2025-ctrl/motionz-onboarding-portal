import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

/** Active CSMs that a client can be assigned to. */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const csms = (await userRepository.listByRole('csm')).map((u) => ({ id: u.id, name: u.full_name, email: u.email }));
    return NextResponse.json({ success: true, csms });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to list CSMs.' }, { status: 500 });
  }
}
