import { GoogleSheetsService } from './client';
import { logAuditEvent, getTenantById } from '../../db';

const sheetsServiceInstance = new GoogleSheetsService();

export async function syncSheetsForTenant(tenantId: string, spreadsheetId?: string) {
  const tenant = await getTenantById(tenantId);
  const resolvedId = spreadsheetId || 'sheet_demo_123';

  const result = await sheetsServiceInstance.getCampaignData(resolvedId);

  await logAuditEvent({
    tenantId,
    actorEmail: 'system@motionz.ai',
    actorRole: 'system',
    action: 'sheets.sync_completed',
    resourceType: 'integration',
    resourceId: resolvedId,
    details: { totalLeads: result.totalLeads, totalAdSpend: result.totalAdSpend },
  });

  return result;
}
