import { GoHighLevelService } from './client';
import { logAuditEvent, getTenantById } from '../../db';

export async function syncGHLForTenant(tenantId: string, locationId?: string) {
  const ghlService = new GoHighLevelService();
  const tenant = await getTenantById(tenantId);
  const resolvedLocation = locationId || tenant?.ghl_location_id || 'loc_ghl_demo_abc';

  const result = await ghlService.syncTenant(tenantId, resolvedLocation);

  await logAuditEvent({
    tenantId,
    actorEmail: 'system@motionz.ai',
    actorRole: 'system',
    action: 'ghl.sync_completed',
    resourceType: 'integration',
    resourceId: resolvedLocation,
    details: { ...result, locationId: resolvedLocation },
  });

  return result;
}
