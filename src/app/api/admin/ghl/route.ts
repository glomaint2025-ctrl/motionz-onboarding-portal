import { NextResponse } from 'next/server';
import { tenantRepository, leadRepository } from '@/lib/db/repositories';
import { getSupabaseServiceClient } from '@/lib/db/supabase-client';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

/** Most recent lead created_at for a client, or null when it has none. */
async function lastLeadAt(tenantId: string): Promise<string | null> {
  // Supabase returns leads newest first, so one row is enough; the in-memory store has no guaranteed order.
  const leads = await leadRepository.listByTenant(tenantId, { limit: getSupabaseServiceClient() ? 1 : 1000 });
  let latest: string | null = null;
  for (const lead of leads) {
    if (lead.created_at && (!latest || new Date(lead.created_at).getTime() > new Date(latest).getTime())) latest = lead.created_at;
  }
  return latest;
}

/**
 * Admin > GHL Connect: every live client (not archived, not cancelled) with its
 * GoHighLevel Location ID and the time its last lead arrived.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const tenants = await tenantRepository.list({ includeArchived: true, limit: 1000 });
    const live = tenants.filter((t: any) => !t.deleted_at && t.status !== 'cancelled');

    const rows = await Promise.all(
      live.map(async (t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        ghl_location_id: t.ghl_location_id || null,
        lastLeadAt: await lastLeadAt(t.id),
      }))
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const connected = rows.filter((r) => r.ghl_location_id);
    const notConnected = rows.filter((r) => !r.ghl_location_id);

    return NextResponse.json({
      success: true,
      counts: { connected: connected.length, total: rows.length },
      connected,
      notConnected,
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Could not load GoHighLevel connections. Please try again.' }, { status: 500 });
  }
}
