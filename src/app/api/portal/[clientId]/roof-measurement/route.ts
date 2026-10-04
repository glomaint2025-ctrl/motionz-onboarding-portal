import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, getFeatureToggles } from '@/lib/db';
import { roofMeasurementRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { enforceRateLimit } from '@/lib/auth/security-utils';
import { measureRoof, isRoofServiceConfigured, RoofServiceError } from '@/lib/integrations/roof/solar';
import { validateText } from '@/lib/validation';

/** GET: whether the tool is available plus recent measurements. POST { address }: measure a roof. */
export async function GET(request: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const tenant = await getTenantById(params.clientId);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    await assertPortalAccess(request, tenant, params.clientId);
    const recent = await roofMeasurementRepository.listByTenant(tenant.id, 10);
    return NextResponse.json({ configured: isRoofServiceConfigured(), recent });
  } catch (error: any) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const tenant = await getTenantById(params.clientId);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    const session = await assertPortalAccess(request, tenant, params.clientId);

    const toggles = await getFeatureToggles(tenant.id);
    if (toggles.roof_measurement === false) {
      return NextResponse.json({ error: 'Roof measurement is not enabled for this portal.' }, { status: 403 });
    }

    // Each lookup costs money past the free tier, so cap usage per client.
    const limit = await enforceRateLimit(`roof:${tenant.id}`, { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Daily roof measurement limit reached. Try again tomorrow.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    let address: string;
    try {
      address = validateText(body.address, 'Address', { required: true, max: 300 })!;
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const result = await measureRoof(address);

    // Saving the history must never hide a successful measurement from the user.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    await roofMeasurementRepository
      .create({
      tenant_id: tenant.id,
      address: result.formattedAddress,
      planar_area_sqft: result.footprintSqFt,
      surface_area_sqft: result.roofAreaSqFt,
      pitch: result.predominantPitch,
      squares: result.squares,
      result_data: result as unknown as Record<string, any>,
      created_by: session && UUID.test(session.userId) ? session.userId : undefined,
    })
      .catch((err: any) => console.error('[roof] Could not save measurement history:', err?.message));

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof RoofServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    if (error.statusCode === 401 || error.statusCode === 403) return handleAuthError(error);
    console.error('[roof] Measurement failed:', error?.message);
    return NextResponse.json({ error: 'Roof measurement failed. Please try again.' }, { status: 500 });
  }
}
