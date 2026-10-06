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
          database: sanitizedEnv.HAS_SUPABASE_URL ? 'configured' : 'in-memory-mock',
          email: process.env.RESEND_API_KEY || process.env.BREVO_API_KEY ? 'configured' : 'unconfigured',
          trackingSheets: process.env.GOOGLE_SHEETS_SCRIPT_URL ? 'configured' : 'unconfigured',
          ghlWebhooks: process.env.GHL_WEBHOOK_SECRET ? 'configured' : 'unconfigured',
          roofMeasurement: process.env.GOOGLE_SOLAR_API_KEY ? 'configured' : 'unconfigured',
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
