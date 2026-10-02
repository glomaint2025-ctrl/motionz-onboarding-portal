import { NextResponse } from 'next/server';
import { auditLogRepository, securityEventRepository } from '@/lib/db/repositories';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const [auditLogs, securityEvents] = await Promise.all([
      auditLogRepository.list(undefined, 100),
      securityEventRepository.list({ limit: 100 }),
    ]);

    return NextResponse.json({
      success: true,
      auditLogs,
      securityEvents,
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to fetch logs.' }, { status: 500 });
  }
}
