import { NextRequest, NextResponse } from 'next/server';
import { handleAuthError } from '@/lib/auth/guard';
import { userRepository } from '@/lib/db/repositories';
import { logAuditEvent } from '@/lib/db';
import { validatePhone, validateText } from '@/lib/validation';
import { presentProfile, requireCurrentUser } from '@/lib/account/profile';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/** GET /api/account/profile: the signed-in person's own details. */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireCurrentUser(request);
    return NextResponse.json(await presentProfile(user), { headers: NO_STORE });
  } catch (err: any) {
    return handleAuthError(err);
  }
}

/**
 * PUT /api/account/profile { fullName, phone? }: the signed-in person changes their own name and phone.
 * An empty phone removes the saved number. Anything else in the body (ids, email, role) is ignored.
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireCurrentUser(request);

    const parsed = await request.json().catch(() => null);
    const body: Record<string, unknown> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

    let fullName: string;
    let phone: string | null | undefined;
    try {
      fullName = validateText(body.fullName, 'Your name', { required: true, max: 100 })!;
      if ('phone' in body) phone = validatePhone(body.phone) ?? null;
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const previousName = user.full_name;
    const changed: string[] = [];
    const updates: Record<string, unknown> = {};
    if (fullName !== previousName) {
      updates.full_name = fullName;
      changed.push('name');
    }
    if (phone !== undefined && (phone || '') !== (user.phone || '')) {
      updates.phone = phone;
      changed.push('phone');
    }

    let saved = user;
    if (changed.length > 0) {
      saved = await userRepository.update(user.id, updates as any);
      await logAuditEvent({
        tenantId: user.tenant_id || undefined,
        actorEmail: user.email,
        actorRole: user.role,
        actorUserId: user.id,
        action: 'account.profile_updated',
        resourceType: 'user',
        resourceId: user.id,
        details: { changed, ...(updates.full_name ? { previousName, name: fullName } : {}) },
      });
    }

    return NextResponse.json({ success: true, changed, profile: await presentProfile(saved) }, { headers: NO_STORE });
  } catch (err: any) {
    return handleAuthError(err);
  }
}
