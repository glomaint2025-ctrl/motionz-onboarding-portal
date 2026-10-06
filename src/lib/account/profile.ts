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
import { VIEWER_ROLE_LABELS } from './role-labels';

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
