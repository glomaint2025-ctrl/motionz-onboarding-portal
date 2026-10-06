/**
 * "My profile": helpers shared by the /api/account/profile routes.
 * Every route acts on the signed-in person only; the person is always taken from the session,
 * never from anything the browser sends.
 */
import { NextRequest } from 'next/server';
import { requireAuth } from '../auth/guard';
import { SessionPayload } from '../auth/session';
import { userRepository } from '../db/repositories';
import { User } from '../db/schema';
import { AppError } from '../errors';
import { getSupabaseBrowserClient } from '../db/supabase-client';
import { getAvatarUrl } from '../storage/avatars';
import { VIEWER_ROLE_LABELS } from './role-labels';

/** Same cookie settings as sign-in, so a re-issued session behaves exactly like a fresh one. */
export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
});

/**
 * The signed-in, active person behind this request. Suspended people and suspended or archived
 * clients are refused by requireAuth, the same way every other route refuses them.
 */
export async function requireCurrentUser(request: Request | NextRequest): Promise<{ session: SessionPayload; user: User }> {
  const { session } = await requireAuth(request);
  // By id only: an email can change hands, an id cannot.
  const user = await userRepository.findById(session.userId);
  if (!user) {
    throw new AppError('Authentication required to access this resource.', 401, 'UNAUTHENTICATED');
  }
  return { session, user };
}

export async function presentProfile(user: User) {
  return {
    fullName: user.full_name || '',
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    roleLabel: VIEWER_ROLE_LABELS[user.role] || '',
    avatarUrl: await getAvatarUrl(user.id, user.avatar_path),
  };
}

/**
 * Checks a person's current password the same way sign-in does: against Supabase Auth when it is
 * configured. Without Supabase (tests / local mock store) the mock rule of the sign-in route applies.
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<'ok' | 'wrong' | 'unavailable'> {
  if (!password) return 'wrong';
  const supabaseAnon = getSupabaseBrowserClient();
  if (supabaseAnon) {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return error || !data.user ? 'wrong' : 'ok';
  }
  if (process.env.NODE_ENV === 'production') return 'unavailable';
  return password === 'WrongPassword123!' || password === 'wrong' ? 'wrong' : 'ok';
}
