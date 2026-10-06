'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Skeleton, StatusBadge, buttonClasses } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';

interface ClientRef {
  id: string;
  name: string;
}

interface Dashboard {
  clients: { total: number; active: number; onboarding: number; suspended: number; cancelledOrArchived: number; newLast30Days: number };
  ghl: { connected: number; total: number };
  withoutCsm: ClientRef[];
  withoutContract: ClientRef[];
  inSetup: number;
  security: { last7Days: number; highSeverity: number };
  unmatchedSubmissions: number;
  leadRequests?: { open: number; clients: (ClientRef & { open: number })[] };
}

function Metric({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <Card style={{ height: '100%' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <div style={{ fontSize: '2rem', fontWeight: 700, margin: 'var(--space-1) 0', letterSpacing: '-0.02em' }}>{value}</div>
      {hint && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{hint}</span>}
    </Card>
  );
  return href ? (
    <Link href={href} className="admin-metric-link">
      {body}
    </Link>
  ) : (
    body
  );
}

function ClientList({ items, empty, render }: { items: any[]; empty: string; render?: (item: any) => React.ReactNode }) {
  if (items.length === 0) return <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 'var(--font-size-sm)' }}>{empty}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {items.slice(0, 8).map((c) => (
        <Link
          key={c.id}
          href={`/admin/clients/${c.id}`}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            color: 'inherit',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          <span>{c.name}</span>
          {render && <span style={{ color: 'var(--color-text-muted)' }}>{render(c)}</span>}
        </Link>
      ))}
      {items.length > 8 && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>and {items.length - 8} more</span>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    fetch('/api/admin/dashboard')
      .then(async (res) => ({ ok: res.ok, d: await res.json().catch(() => ({})) }))
      .then(({ ok, d }) => (ok && d.success ? setData(d) : setError(d.error || 'Could not load the dashboard.')))
      .catch(() => setError('Could not reach the server. Check your connection and try again.'));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Dashboard</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Where every client stands, and what needs attention.</p>
        </div>
        <Link href="/admin/clients/new" className={buttonClasses({ variant: 'primary' })}>
          Add client
        </Link>
      </div>

      {error && (
        <Notice onRetry={load} style={{ marginBottom: 'var(--space-6)' }}>
          {error}
        </Notice>
      )}

      {!data && !error ? (
        <div className="admin-metric-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <Skeleton height="72px" />
            </Card>
          ))}
        </div>
      ) : data ? (
        <>
          {/* Every tile opens the page where its number is managed. */}
          <div className="admin-metric-grid">
            <Metric label="Active clients" value={data.clients.active} hint={`${data.clients.onboarding} onboarding · ${data.clients.total} total`} href="/admin/clients" />
            <Metric
              label="Still in setup"
              value={data.inSetup}
              hint="Setup steps not all done yet"
              href="/admin/clients?setup=in_progress"
            />
            <Metric
              label="GHL Connect"
              value={`${data.ghl.connected} / ${data.ghl.total}`}
              hint={
                data.ghl.total === 0
                  ? 'No clients yet'
                  : data.ghl.connected === data.ghl.total
                    ? 'connected · every client has a Location ID'
                    : `connected · ${data.ghl.total - data.ghl.connected} without a Location ID`
              }
              href="/admin/ghl"
            />
            <Metric
              label="Security events (7 days)"
              value={data.security.last7Days}
              hint={data.security.highSeverity ? `${data.security.highSeverity} high severity` : 'None high severity'}
              href="/admin/security-alerts"
            />
            <Metric label="New clients (30 days)" value={data.clients.newLast30Days} hint={`${data.clients.cancelledOrArchived} archived`} href="/admin/clients" />
          </div>

          {data.unmatchedSubmissions > 0 && (
            <Card style={{ marginBottom: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <span>
                  <StatusBadge status="Action needed" variant="warning" />{' '}
                  {data.unmatchedSubmissions} onboarding form submission{data.unmatchedSubmissions === 1 ? '' : 's'} could not be matched to a client.
                </span>
                <Link href="/admin/integrations" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                  Review
                </Link>
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <Card>
              <CardHeader title="No CSM assigned" />
              <ClientList items={data.withoutCsm} empty="Every client has a CSM." />
            </Card>
            <Card>
              <CardHeader title="No contract attached" />
              <ClientList items={data.withoutContract || []} empty="Every client has a contract attached." />
            </Card>
            <Card>
              <CardHeader
                title="Lead requests to handle"
                action={
                  data.leadRequests?.open ? <StatusBadge status={`${data.leadRequests.open} open`} variant="warning" /> : undefined
                }
              />
              <ClientList
                items={data.leadRequests?.clients || []}
                empty="No open lead replacement or unresponsive lead requests."
                render={(c) => `${c.open} open`}
              />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
