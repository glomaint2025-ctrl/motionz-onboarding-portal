import { NextRequest, NextResponse } from 'next/server';
import { handleAuthError } from '@/lib/auth/guard';
import { enforceRateLimit } from '@/lib/auth/security-utils';
import { userRepository, securityEventRepository } from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { requireCurrentUser } from '@/lib/account/profile';
import {
  AvatarValidationError,
  MAX_AVATAR_BYTES,
  getAvatarUrl,
  isAvatarPathOf,
  removeAvatar,
  uploadAvatar,
  validateAvatar,
} from '@/lib/storage/avatars';

export const dynamic = 'force-dynamic';

const TOO_LARGE = 'That picture is larger than 2 MB. Choose a smaller one.';
const UNAVAILABLE = 'Profile pictures are not available yet. Please try again later.';

/** POST /api/account/profile/avatar (multipart, field "file"): the signed-in person sets their own picture. */
export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;
  try {
    const { user } = await requireCurrentUser(request);

    const rateLimit = await enforceRateLimit(`account_avatar:${user.id}`, { maxRequests: 10, windowMs: 10 * 60 * 1000 });
    if (!rateLimit.allowed) {
      await securityEventRepository.create({
        event_type: 'rate_limit_exceeded',
        severity: 'low',
        tenant_id: user.tenant_id,
        details: { email: user.email, endpoint: '/api/account/profile/avatar', resetMs: rateLimit.resetMs },
      });
      return NextResponse.json(
        { error: 'You have changed your picture several times. Please wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)) } }
      );
    }

    // Refuse obviously oversized bodies before reading them (the multipart envelope adds a little).
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_AVATAR_BYTES + 64 * 1024) {
      return NextResponse.json({ error: TOO_LARGE }, { status: 400 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file') as any;
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Choose a picture to upload.' }, { status: 400 });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: TOO_LARGE }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let kind: { ext: string; contentType: string };
    try {
      kind = validateAvatar({ type: file.type, bytes });
    } catch (e: any) {
      if (e instanceof AvatarValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }

    const previousPath = user.avatar_path;
    uploadedPath = await uploadAvatar(user.id, { ...kind, bytes });

    const saved = await userRepository.setAvatarPath(user.id, uploadedPath);
    if (!saved) {
      // The database is not ready for pictures yet: leave nothing behind.
      await removeAvatar(uploadedPath);
      uploadedPath = null;
      return NextResponse.json({ error: UNAVAILABLE, code: 'AVATAR_UNAVAILABLE' }, { status: 503 });
    }
    const newPath = uploadedPath;
    uploadedPath = null;

    if (isAvatarPathOf(user.id, previousPath) && previousPath !== newPath) await removeAvatar(previousPath);

    await logAuditEvent({
      tenantId: user.tenant_id || undefined,
      actorEmail: user.email,
      actorRole: user.role,
      actorUserId: user.id,
      action: 'account.avatar_updated',
      resourceType: 'user',
      resourceId: user.id,
      details: { contentType: kind.contentType, size: bytes.byteLength, replaced: Boolean(previousPath) },
    });

    return NextResponse.json({ success: true, avatarUrl: await getAvatarUrl(user.id, newPath) });
  } catch (err: any) {
    if (uploadedPath) await removeAvatar(uploadedPath);
    if (err?.statusCode === 401 || err?.statusCode === 403) return handleAuthError(err);
    console.error('[account] Profile picture upload failed:', err?.message || err);
    return NextResponse.json({ error: 'Your picture could not be saved. Please try again.' }, { status: 500 });
  }
}

/** DELETE /api/account/profile/avatar: the signed-in person removes their own picture. */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireCurrentUser(request);

    const previousPath = user.avatar_path;
    if (previousPath) {
      await userRepository.setAvatarPath(user.id, null);
      if (isAvatarPathOf(user.id, previousPath)) await removeAvatar(previousPath);
      await logAuditEvent({
        tenantId: user.tenant_id || undefined,
        actorEmail: user.email,
        actorRole: user.role,
        actorUserId: user.id,
        action: 'account.avatar_removed',
        resourceType: 'user',
        resourceId: user.id,
      });
    }

    return NextResponse.json({ success: true, avatarUrl: null });
  } catch (err: any) {
    if (err?.statusCode === 401 || err?.statusCode === 403) return handleAuthError(err);
    console.error('[account] Profile picture removal failed:', err?.message || err);
    return NextResponse.json({ error: 'Your picture could not be removed. Please try again.' }, { status: 500 });
  }
}
