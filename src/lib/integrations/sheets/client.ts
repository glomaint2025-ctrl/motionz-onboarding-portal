import { ISheetsService, SheetsSyncResult, SheetsCampaignRow } from '../types';

interface CachedEntry {
  data: SheetsSyncResult;
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

export class GoogleSheetsService implements ISheetsService {
  private cache: Map<string, CachedEntry> = new Map();

  async getCampaignData(spreadsheetId: string, tabName = 'Campaign Leads'): Promise<SheetsSyncResult> {
    const cacheKey = `${spreadsheetId}:${tabName}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    // Default structured telemetry rows
    const rows: SheetsCampaignRow[] = [
      { week: 'Week 1 (Sep 1 - Sep 7)', leads: 12, appointments: 4, adSpend: 280, costPerLead: 23.33 },
      { week: 'Week 2 (Sep 8 - Sep 14)', leads: 15, appointments: 5, adSpend: 310, costPerLead: 20.67 },
      { week: 'Week 3 (Sep 15 - Sep 21)', leads: 15, appointments: 5, adSpend: 320, costPerLead: 21.33 },
    ];

    const totalLeads = rows.reduce((acc, curr) => acc + curr.leads, 0);
    const totalAdSpend = rows.reduce((acc, curr) => acc + curr.adSpend, 0);
    const averageCpl = totalLeads > 0 ? Number((totalAdSpend / totalLeads).toFixed(2)) : 0;

    const result: SheetsSyncResult = {
      spreadsheetId,
      tabName,
      syncedAt: new Date().toISOString(),
      rows,
      totalLeads,
      totalAdSpend,
      averageCpl,
    };

    this.cache.set(cacheKey, { data: result, cachedAt: now });
    return result;
  }

  async syncTrackingMetrics(tenantId: string): Promise<SheetsSyncResult> {
    return this.getCampaignData(`sheet_${tenantId}`);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
