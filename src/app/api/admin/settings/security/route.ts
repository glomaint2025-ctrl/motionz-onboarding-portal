import { NextResponse } from 'next/server';
import { appSettingsRepository, auditLogRepository } from '@/lib/db/repositories';
import { STAFF_LOGIN_CODE_MODES, StaffLoginCodeMode } from '@/lib/db/repositories/app-settings.repository';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { isEmailConfigured } from '@/lib/email';

/** Admin security settings: emailed one-time sign-in code for staff. */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const security = await appSettingsRepository.get('security');
    return NextResponse.json({ success: true, security, emailConfigured: isEmailConfigured() });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load security settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));
    const mode = body?.staff_login_code as StaffLoginCodeMode;

    if (typeof mode !== 'string' || !STAFF_LOGIN_CODE_MODES.includes(mode)) {
      return NextResponse.json({ error: 'Choose Off, CSMs only or All staff.' }, { status: 400 });
    }
    // Admins are included in "All staff": without working email nobody could sign in to undo it.
    if (mode === 'all_staff' && !isEmailConfigured()) {
      return NextResponse.json(
        { error: 'Email delivery is not configured, so sign-in codes cannot be sent. Set up email before requiring a code for all staff.' },
        { status: 400 }
      );
    }

    const previous = await appSettingsRepository.get('security');
    const value = { ...previous, staff_login_code: mode };
    await appSettingsRepository.set('security', value, session!.email);
    await auditLogRepository.create({
      actor_email: session!.email,
      actor_role: 'admin',
      action: 'settings.security_updated',
      resource_type: 'app_settings',
      resource_id: 'security',
      details: { staff_login_code: mode, previous: previous.staff_login_code },
    });

    return NextResponse.json({ success: true, security: value, emailConfigured: isEmailConfigured() });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save security settings.' }, { status: 500 });
  }
}
