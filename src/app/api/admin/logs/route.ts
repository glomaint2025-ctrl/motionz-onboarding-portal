import { NextResponse } from 'next/server';
import { auditLogRepository, securityEventRepository } from '@/lib/db/repositories';

export async function GET() {
  try {
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
    return NextResponse.json({ error: err.message || 'Failed to fetch logs.' }, { status: 500 });
  }
}
