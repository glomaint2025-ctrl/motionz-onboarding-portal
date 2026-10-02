import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { userRepository, passwordResetRepository, auditLogRepository, securityEventRepository } from '@/lib/db/repositories';
import { enforceRateLimit, getClientIp, resolveBaseUrl } from '@/lib/auth/security-utils';
import { sendEmail, passwordResetEmail, canExposeDevLinks } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // Rate limit: 5 password reset requests per 10 minutes per IP
    const rateLimit = await enforceRateLimit(`forgot_pw:${ip}`, { maxRequests: 5, windowMs: 10 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please wait a few minutes before trying again.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = body?.email;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Identical response for unknown, suspended and valid accounts so this endpoint cannot probe emails.
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email, a password reset link has been sent.',
    };

    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user || user.status === 'suspended') {
      return NextResponse.json(genericResponse);
    }

    const expiresInMinutes = 60;
    const rawToken = crypto.randomBytes(32).toString('hex');
    await passwordResetRepository.create(normalizedEmail, rawToken, expiresInMinutes);

    const baseUrl = resolveBaseUrl(request);
    const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}`;

    await sendEmail(passwordResetEmail({ to: normalizedEmail, url: resetUrl, expiresInMinutes }));

    await auditLogRepository.create({
      tenant_id: user.tenant_id,
      actor_email: normalizedEmail,
      actor_role: user.role,
      action: 'auth.password_reset_requested',
      resource_type: 'user',
      resource_id: user.id,
      details: { email: normalizedEmail },
    });

    await securityEventRepository.create({
      event_type: 'password_reset_requested',
      severity: 'low',
      tenant_id: user.tenant_id,
      details: { email: normalizedEmail, timestamp: new Date().toISOString() },
    });

    return NextResponse.json({
      ...genericResponse,
      // Local development without an email provider only; never returned in production.
      ...(canExposeDevLinks() ? { resetUrl } : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to process password reset request.' },
      { status: 500 }
    );
  }
}
