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
import { getAvatarUrl } from '../storage/avatars';
import { staffRoleLabel } from './role-labels';
import { resolveStaffTitle } from '../db/repositories/app-settings.repository';
import { getSupabaseBrowserClient } from '../db/supabase-client';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Checks a person's current password the same way sign-in does (staff and clients alike): against
 * Supabase Auth when it is configured. Nothing else happens here: no sign-in is logged, no session
 * is issued and no account is created. Without Supabase (tests / local mock store) the mock rule
 * of the sign-in route applies.
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
    // An admin with the title "tech" reads "Tech"; the role itself is unchanged.
    roleLabel: staffRoleLabel(user.role, user.role === 'admin' ? await resolveStaffTitle(user.id) : null),
    avatarUrl: await getAvatarUrl(user.id, user.avatar_path),
  };
}
