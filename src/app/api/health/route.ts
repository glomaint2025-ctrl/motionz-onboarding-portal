import { NextResponse } from 'next/server';
import { getSanitizedEnv } from '@/lib/env';
import { listTenants } from '@/lib/db';

export const dynamic = 'force-dynamic';

const START_TIME = Date.now();

export async function GET() {
  const checkStart = Date.now();
  let dbHealthy = false;
  let dbLatencyMs = 0;

  try {
    // Probe database layer
    await listTenants();
    dbHealthy = true;
    dbLatencyMs = Date.now() - checkStart;
  } catch {
    dbHealthy = false;
    dbLatencyMs = Date.now() - checkStart;
  }

  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
  const sanitizedEnv = getSanitizedEnv();

  const isHealthy = dbHealthy;
  const status = isHealthy ? 'healthy' : 'degraded';
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      version: '1.0.0',
      database: {
        healthy: dbHealthy,
        latencyMs: dbLatencyMs,
      },
      environment: {
        nodeEnv: sanitizedEnv.NODE_ENV,
        configuredAdapters: {
          database: sanitizedEnv.HAS_DATABASE_URL || sanitizedEnv.HAS_SUPABASE_URL ? 'configured' : 'in-memory-mock',
          googleSheets: sanitizedEnv.HAS_GOOGLE_CREDS ? 'ready' : 'unconfigured',
          slackWebhooks: sanitizedEnv.HAS_SLACK_WEBHOOK ? 'ready' : 'unconfigured',
        },
      },
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  );
}
