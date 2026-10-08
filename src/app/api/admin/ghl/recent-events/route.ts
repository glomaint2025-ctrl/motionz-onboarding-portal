import { NextResponse } from 'next/server';
import { auditLogRepository, tenantRepository } from '@/lib/db/repositories';
import { getLeadSettings } from '@/lib/db/repositories/app-settings.repository';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import type { AuditLog } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const MAX_EVENTS = 5;
/** Events that are about leads; call bookings and onboarding forms are left out. */
const LEAD_EVENTS = ['lead', 'lead_lost', 'lead_unqualified', 'ContactCreate', 'ContactUpdate'];
const STORED_ACTIONS = LEAD_EVENTS.map((event) => `ghl.webhook.${event}`);

type EventKind = 'received' | 'ignored' | 'removed' | 'rejected';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function isLeadRelated(log: AuditLog): boolean {
  if (log.action === 'ghl.webhook.lead_removed' || STORED_ACTIONS.includes(log.action)) return true;
  if (log.action === 'ghl.webhook.ignored' || log.action === 'ghl.webhook.rejected') {
    return LEAD_EVENTS.includes(text(log.details?.eventType));
  }
  return false;
}

/** One plain line for the entry, e.g. "Ignored (no Qualified tag) · Sam Lee · tags seen: hot, new". */
function describe(log: AuditLog): { kind: EventKind; summary: string } {
  const details = log.details || {};
  const reason = text(details.reason);
  const tags = text(details.tagsSeen);
  const parts = (...items: string[]) => items.filter(Boolean).join(' · ');

  if (log.action === 'ghl.webhook.lead_removed') {
    return {
      kind: 'removed',
      summary: parts('Removed', text(details.leadName), reason === 'tag removed' ? 'tag taken off' : 'marked lost'),
    };
  }
  if (log.action === 'ghl.webhook.rejected') {
    return { kind: 'rejected', summary: parts('Rejected', reason || 'the message was not complete') };
  }
  if (log.action === 'ghl.webhook.ignored') {
    const tag = /^Contact is not tagged "(.+)" yet\.$/.exec(reason)?.[1];
    if (tag) {
      return { kind: 'ignored', summary: parts(`Ignored (no ${tag} tag)`, text(details.contact), `tags seen: ${tags || '(none sent)'}`) };
    }
    return { kind: 'ignored', summary: parts('Ignored', reason || 'could not be placed') };
  }
  return { kind: 'received', summary: parts('Received', text(details.leadName) || 'A contact', tags ? `tags: ${tags}` : '') };
}

/**
 * GET /api/admin/ghl/recent-events: the 5 most recent lead messages from GoHighLevel (received,
 * ignored, removed), read from the audit log, so an admin can see what GoHighLevel is sending.
 * Only entries since the lead rule was last saved are shown.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const requiredTag = (await getLeadSettings()).required_tag;
    const since = (await auditLogRepository.listByActionPrefix('settings.leads_updated', { limit: 1 }))[0]?.created_at || null;

    const logs = (await auditLogRepository.listByActionPrefix('ghl.webhook', { from: since || undefined, limit: 100 }))
      .filter(isLeadRelated)
      .slice(0, MAX_EVENTS);

    // Client names for entries that do not already carry one.
    const names = new Map<string, string>();
    for (const log of logs) {
      if (!log.tenant_id || text(log.details?.client) || names.has(log.tenant_id)) continue;
      const tenant = await tenantRepository.findById(log.tenant_id, { includeArchived: true }).catch(() => null);
      names.set(log.tenant_id, tenant?.name || '');
    }

    const events = logs.map((log) => {
      const location = text(log.details?.location) || (log.resource_id && log.resource_id !== 'n/a' ? log.resource_id : '');
      return {
        id: log.id,
        at: log.created_at,
        ...describe(log),
        client: text(log.details?.client) || (log.tenant_id ? names.get(log.tenant_id) || '' : ''),
        location,
      };
    });

    return NextResponse.json(
      { success: true, requiredTag, since, events },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Could not load the last events.' }, { status: 500 });
  }
}
