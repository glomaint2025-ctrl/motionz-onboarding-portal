'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Pagination, Select, Skeleton, StatusBadge, StatusVariant } from '@/components/ui';
import { auditActionLabel, detailChips, roleLabel, securityEventLabel } from '@/lib/utils/log-labels';
import { formatDate, formatLongDate } from '@/lib/utils/format';
import { Notice } from '@/components/admin/Notice';

type Kind = 'security' | 'audit';
type Preset = 'today' | 'yesterday' | 'week' | '7d' | '30d' | 'custom';

interface LogRow {
  id: string;
  created_at: string;
  details?: Record<string, unknown> | null;
  /** The client this entry belongs to, when it has one. */
  tenant_name?: string | null;
  // security events
  event_type?: string;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  is_resolved?: boolean;
  // audit logs
  actor_email?: string;
  actor_role?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
}

const PRESETS: { key: Preset; label: string; phrase: string }[] = [
  { key: 'today', label: 'Today', phrase: 'today' },
  { key: 'yesterday', label: 'Yesterday', phrase: 'yesterday' },
  { key: 'week', label: 'This week', phrase: 'this week' },
  { key: '7d', label: 'Last 7 days', phrase: 'in the last 7 days' },
  { key: '30d', label: 'Last 30 days', phrase: 'in the last 30 days' },
  { key: 'custom', label: 'Custom', phrase: '' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** yyyy-mm-dd from a date input, read as a local calendar day. */
function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local-time boundaries for a preset. The week starts on Monday. */
function resolveRange(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      return { from: startOfDay(addDays(now, -1)), to: endOfDay(addDays(now, -1)) };
    case 'week':
      return { from: startOfDay(addDays(now, -((now.getDay() + 6) % 7))), to: endOfDay(now) };
    case '7d':
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
    case '30d':
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case 'custom': {
      const from = parseDateInput(customFrom);
      const to = parseDateInput(customTo);
      if (!from || !to || from > to) return null;
      return { from: startOfDay(from), to: endOfDay(to) };
    }
  }
}

/** "Saturday, 3 Oct 2026" — never a numeric month, so it cannot be misread. Uses the shared portal date style. */
function formatDay(date: Date, withWeekday = true): string {
  return withWeekday ? formatLongDate(date) : formatDate(date);
}

const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function severityVariant(severity?: string): StatusVariant {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'pending';
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: '4px',
  padding: '2px var(--space-2)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-bg-subtle)',
  fontSize: 'var(--font-size-xs)',
  wordBreak: 'break-word',
};

function LogEntry({ kind, row }: { kind: Kind; row: LogRow }) {
  const [showRaw, setShowRaw] = useState(false);
  const title = kind === 'security' ? securityEventLabel(row.event_type || '') : auditActionLabel(row.action || '', row.details);
  // The client comes first, so rows with the same title (e.g. GoHighLevel leads) can be told apart.
  const chips = [
    ...(row.tenant_name ? [{ label: 'Client', value: row.tenant_name }] : []),
    ...detailChips(row.details, { ip: row.ip_address }),
  ];
  const hasRaw = Boolean(row.details && Object.keys(row.details).length > 0);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px minmax(0, 1fr)',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-card)',
      }}
    >
      <time dateTime={row.created_at} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {formatTime(new Date(row.created_at))}
      </time>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{title}</span>
          {kind === 'security' && row.severity && (
            <StatusBadge status={row.severity.charAt(0).toUpperCase() + row.severity.slice(1)} variant={severityVariant(row.severity)} />
          )}
          {kind === 'security' && row.is_resolved && <StatusBadge status="Resolved" variant="done" />}
        </div>

        {kind === 'audit' && (
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: '2px', wordBreak: 'break-word' }}>
            By {row.actor_email || 'unknown'}
            {row.actor_role ? ` (${roleLabel(row.actor_role)})` : ''}
          </div>
        )}

        {(chips.length > 0 || hasRaw) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)', alignItems: 'center' }}>
            {chips.map((chip, i) => (
              <span key={`${chip.label}-${i}`} style={chipStyle}>
                <span style={{ color: 'var(--color-text-muted)' }}>{chip.label}:</span>
                <span>{chip.value}</span>
              </span>
            ))}
            {hasRaw && (
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                aria-expanded={showRaw}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--color-primary-text)',
                  fontSize: 'var(--font-size-xs)',
                  textDecoration: 'underline',
                }}
              >
                {showRaw ? 'Hide raw' : 'Show raw'}
              </button>
            )}
          </div>
        )}

        {showRaw && (
          <pre
            style={{
              margin: 'var(--space-2) 0 0',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-input)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(
              kind === 'security'
                ? { event_type: row.event_type, details: row.details }
                : { action: row.action, resource_type: row.resource_type, resource_id: row.resource_id, details: row.details },
              null,
              2
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

export function LogExplorer({ kind, title, description }: { kind: Kind; title: string; description: string }) {
  const [preset, setPreset] = useState<Preset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [severity, setSeverity] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [highSeverity, setHighSeverity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const range = useMemo(() => resolveRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const fromIso = range?.from.toISOString();
  const toIso = range?.to.toISOString();

  const load = useCallback(async () => {
    if (!fromIso || !toIso) {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setHighSeverity(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ type: kind, from: fromIso, to: toIso, page: String(page), pageSize: String(pageSize) });
      if (kind === 'security' && severity !== 'all') params.set('severity', severity);
      if (search) params.set('q', search);
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not load the log.');
        setRows([]);
        return;
      }
      setRows(kind === 'security' ? data.securityEvents || [] : data.auditLogs || []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setHighSeverity(kind === 'security' ? data.summary?.highSeverity ?? 0 : null);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, fromIso, toIso, page, pageSize, severity, search]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const byDay: { key: string; day: Date; rows: LogRow[] }[] = [];
    for (const row of rows) {
      const date = new Date(row.created_at);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const last = byDay[byDay.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else byDay.push({ key, day: date, rows: [row] });
    }
    return byDay;
  }, [rows]);

  const noun = kind === 'security' ? 'event' : 'action';
  const filtered = Boolean(search) || (kind === 'security' && severity !== 'all');
  const rangePhrase =
    preset === 'custom'
      ? range
        ? `from ${formatDay(range.from, false)} to ${formatDay(range.to, false)}`
        : ''
      : PRESETS.find((p) => p.key === preset)!.phrase;
  const customInvalid = preset === 'custom' && !range;

  const choosePreset = (next: Preset) => {
    if (next === 'custom' && (!customFrom || !customTo)) {
      // Start the custom range from what is currently on screen.
      const current = range || resolveRange('week', '', '')!;
      const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setCustomFrom(toInput(current.from));
      setCustomTo(toInput(current.to));
    }
    setPreset(next);
    setPage(1);
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>{title}</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{description}</p>
      </div>

      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div role="group" aria-label="Date range" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {PRESETS.map((p) => (
            <Button key={p.key} type="button" size="sm" variant={preset === p.key ? 'primary' : 'outline'} aria-pressed={preset === p.key} onClick={() => choosePreset(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
          {preset === 'custom' && (
            <>
              <Input
                label="From"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(1);
                }}
              />
              <Input
                label="To"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(1);
                }}
              />
            </>
          )}
          {kind === 'security' && (
            <Select
              label="Severity"
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All severities' },
                { value: 'high', label: 'High and critical' },
                { value: 'critical', label: 'Critical only' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
                { value: 'info', label: 'Info' },
              ]}
            />
          )}
          <Input
            label="Search"
            type="search"
            placeholder={kind === 'security' ? 'Email or event, e.g. wrong password' : 'Person, action or resource'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </Card>

      <p aria-live="polite" style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        {customInvalid ? (
          'Choose a start and end date. The start date must not be after the end date.'
        ) : loading ? (
          'Loading...'
        ) : error ? null : (
          <>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {total} {filtered ? 'matching ' : ''}
              {noun}
              {total === 1 ? '' : 's'}
            </strong>{' '}
            {rangePhrase}
            {highSeverity !== null && (
              <>
                {' · '}
                <span style={{ color: highSeverity > 0 ? 'var(--color-status-danger-text)' : undefined }}>{highSeverity} high severity</span>
              </>
            )}
          </>
        )}
      </p>

      {error && (
        <Notice style={{ marginBottom: 'var(--space-4)' }}>{error}</Notice>
      )}

      {loading ? (
        <Skeleton height="240px" />
      ) : customInvalid || error ? null : rows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            {filtered ? `No ${noun}s match these filters ${rangePhrase}.` : `No ${noun}s were recorded ${rangePhrase}.`}
          </p>
        </Card>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.key} style={{ marginBottom: 'var(--space-5)' }}>
              <h2
                style={{
                  position: 'sticky',
                  top: 'var(--header-height, 0px)',
                  zIndex: 1,
                  margin: 0,
                  padding: 'var(--space-2) 0',
                  backgroundColor: 'var(--color-bg-base)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                }}
              >
                <span>{formatDay(group.day)}</span>
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-normal)' }}>
                  {group.rows.length}
                  {totalPages > 1 ? ' on this page' : ''}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                {group.rows.map((row) => (
                  <LogEntry key={row.id} kind={kind} row={row} />
                ))}
              </div>
            </section>
          ))}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            pageSizeOptions={[25, 50, 100]}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
