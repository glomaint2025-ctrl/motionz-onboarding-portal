import { NextResponse } from 'next/server';
import { auditLogRepository, securityEventRepository, tenantRepository } from '@/lib/db/repositories';
import type { SecuritySeverity } from '@/lib/db/schema';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { parsePaginationParams, buildPaginationMeta } from '@/lib/utils/pagination';
import { AUDIT_ACTION_LABELS, SECURITY_EVENT_LABELS, keysMatchingLabel } from '@/lib/utils/log-labels';

const SEVERITIES: SecuritySeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
const HIGH: SecuritySeverity[] = ['high', 'critical'];

/**
 * Adds `tenant_name` to every row that belongs to a client, so identical-looking rows
 * (e.g. many "New lead received from GoHighLevel") can be told apart. Archived clients keep their name.
 */
async function withTenantNames<T extends { tenant_id?: string | null }>(rows: T[]): Promise<(T & { tenant_name: string | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.tenant_id).filter((id): id is string => Boolean(id))));
  const names = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const tenant = await tenantRepository.findById(id, { includeArchived: true }).catch(() => null);
      if (tenant?.name) names.set(id, tenant.name);
    })
  );
  return rows.map((r) => ({ ...r, tenant_name: (r.tenant_id && names.get(r.tenant_id)) || null }));
}

function parseDate(value: string | null, name: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`"${name}" must be an ISO date.`), { statusCode: 400 });
  }
  return date.toISOString();
}

/**
 * GET /api/admin/logs?type=security|audit&from=ISO&to=ISO&severity=&q=&page=&pageSize=
 * Without `type` both lists are returned (same filters applied to each).
 * `severity` accepts one level, a comma list, or "high" which also includes critical.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    if (typeParam && typeParam !== 'security' && typeParam !== 'audit') {
      return NextResponse.json({ error: '"type" must be "security" or "audit".' }, { status: 400 });
    }

    const from = parseDate(searchParams.get('from'), 'from');
    const to = parseDate(searchParams.get('to'), 'to');
    if (from && to && from > to) {
      return NextResponse.json({ error: '"from" must be before "to".' }, { status: 400 });
    }

    let severities: SecuritySeverity[] | undefined;
    const severityParam = searchParams.get('severity')?.trim().toLowerCase();
    if (severityParam && severityParam !== 'all') {
      const requested = severityParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (requested.some((s) => !SEVERITIES.includes(s as SecuritySeverity))) {
        return NextResponse.json({ error: `"severity" must be one of: ${SEVERITIES.join(', ')}.` }, { status: 400 });
      }
      severities = requested as SecuritySeverity[];
      if (requested.length === 1 && requested[0] === 'high') severities = HIGH;
    }

    const { page, pageSize, offset, search } = parsePaginationParams(request, typeParam ? 50 : 100);
    const wantSecurity = typeParam !== 'audit';
    const wantAudit = typeParam !== 'security';

    const [security, highSeverity, audit] = await Promise.all([
      wantSecurity
        ? securityEventRepository.query({
            from,
            to,
            severities,
            q: search,
            eventTypes: search ? keysMatchingLabel(SECURITY_EVENT_LABELS, search) : undefined,
            limit: pageSize,
            offset,
          })
        : null,
      // Summary line: high + critical events in the same date range, regardless of the other filters.
      wantSecurity ? securityEventRepository.query({ from, to, severities: HIGH, limit: 1 }) : null,
      wantAudit
        ? auditLogRepository.query({
            from,
            to,
            q: search,
            actions: search ? keysMatchingLabel(AUDIT_ACTION_LABELS, search) : undefined,
            limit: pageSize,
            offset,
          })
        : null,
    ]);

    const securityPagination = security ? buildPaginationMeta(security.total, page, pageSize) : undefined;
    const auditPagination = audit ? buildPaginationMeta(audit.total, page, pageSize) : undefined;

    return NextResponse.json({
      success: true,
      range: { from: from || null, to: to || null },
      ...(audit ? { auditLogs: await withTenantNames(audit.rows) } : {}),
      ...(security ? { securityEvents: await withTenantNames(security.rows) } : {}),
      pagination: typeParam === 'security' ? securityPagination : typeParam === 'audit' ? auditPagination : { audit: auditPagination, security: securityPagination },
      summary: {
        ...(security ? { securityTotal: security.total, highSeverity: highSeverity?.total ?? 0 } : {}),
        ...(audit ? { auditTotal: audit.total } : {}),
      },
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    if (err.statusCode === 400) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch logs.' }, { status: 500 });
  }
}
