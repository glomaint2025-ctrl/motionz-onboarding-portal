import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { userRepository, tenantRepository, passwordResetRepository, auditLogRepository, securityEventRepository } from '@/lib/db/repositories';
import { getSupabaseServiceClient } from '@/lib/db/supabase-client';
import { enforceRateLimit } from '@/lib/auth/security-utils';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'global';

    const rateLimit = enforceRateLimit(`reset_pw:${ip}`, { maxRequests: 10, windowMs: 10 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { token, password } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetRecord = await passwordResetRepository.findByTokenHash(tokenHash);

    if (!resetRecord) {
      return NextResponse.json({ error: 'This password reset link is invalid or has expired.' }, { status: 400 });
    }

    if (resetRecord.used_at) {
      return NextResponse.json({ error: 'This password reset link has already been used. Please request a new one.' }, { status: 400 });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This password reset link has expired (60-minute window exceeded).' }, { status: 400 });
    }

    const user = await userRepository.findByEmail(resetRecord.email);
    if (!user) {
      return NextResponse.json({ error: 'Associated user account not found.' }, { status: 404 });
    }

    // 1. Mark token as used
    await passwordResetRepository.markUsed(resetRecord.id);

    // 2. Synchronize to Supabase Auth if configured
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      try {
        await supabase.auth.admin.updateUserById(user.id, { password });
      } catch (err) {
        console.error('[AUTH] Supabase Auth password update error:', err);
      }
    }

    // 3. Update application user record
    await userRepository.update(user.id, {
      updated_at: new Date().toISOString(),
    });

    // 4. Activate tenant if currently in onboarding
    if (user.tenant_id) {
      try {
        const tenant = await tenantRepository.findById(user.tenant_id);
        if (tenant && tenant.status === 'onboarding') {
          await tenantRepository.update(user.tenant_id, { status: 'active' });
        }
      } catch (err) {
        console.error('[AUTH] Failed to activate tenant on password reset:', err);
      }
    }

    await auditLogRepository.create({
      tenant_id: user.tenant_id,
      actor_email: user.email,
      actor_role: user.role,
      action: 'auth.password_reset_completed',
      resource_type: 'user',
      resource_id: user.id,
      details: { email: user.email },
    });

    await securityEventRepository.create({
      event_type: 'password_reset_completed',
      severity: 'low',
      tenant_id: user.tenant_id,
      details: { email: user.email, timestamp: new Date().toISOString() },
    });

    return NextResponse.json({
      success: true,
      message: 'Password has been successfully updated. You can now log in with your new credentials.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to reset password.' },
      { status: 500 }
    );
  }
}
