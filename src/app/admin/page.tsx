'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardHeader, Skeleton, StatusBadge } from '@/components/ui';

interface ClientRef {
  id: string;
  name: string;
}

interface Dashboard {
  clients: { total: number; active: number; onboarding: number; suspended: number; cancelledOrArchived: number; newLast30Days: number };
  ghlNotConnected: ClientRef[];
  withoutCsm: ClientRef[];
  inSetup: number;
  stuck: (ClientRef & { currentStep: string; daysOnStep: number })[];
  security: { last7Days: number; highSeverity: number };
  unmatchedSubmissions: number;
  revenue: number | null;
  churnRate: number | null;
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
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
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

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((res) => res.json())
      .then((d) => (d.success ? setData(d) : setError(d.error || 'Could not load the dashboard.')))
      .catch(() => setError('Network error while loading the dashboard.'));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Dashboard</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Where every client stands, and what needs attention.</p>
        </div>
        <Link href="/admin/clients/new">
          <Button variant="primary">Add client</Button>
        </Link>
      </div>

      {error && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <p style={{ margin: 0, color: 'var(--color-status-danger-text)' }}>{error}</p>
        </Card>
      )}

      {!data && !error ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <Skeleton height="72px" />
            </Card>
          ))}
        </div>
      ) : data ? (
        <>
          <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 'var(--space-6)' }}>
            <Metric label="Active clients" value={data.clients.active} hint={`${data.clients.onboarding} onboarding · ${data.clients.total} total`} href="/admin/clients" />
            <Metric label="Still in setup" value={data.inSetup} hint={`${data.stuck.length} stuck 14+ days on one step`} />
            <Metric label="GHL not connected" value={data.ghlNotConnected.length} hint="No Location ID set yet" />
            <Metric
              label="Security events (7 days)"
              value={data.security.last7Days}
              hint={data.security.highSeverity ? `${data.security.highSeverity} high severity` : 'None high severity'}
              href="/admin/security-alerts"
            />
            <Metric label="New clients (30 days)" value={data.clients.newLast30Days} hint={`${data.clients.cancelledOrArchived} cancelled or archived`} />
            <Metric label="Revenue & churn" value="Not connected" hint="Payments run through Stripe links outside the portal" />
          </div>

          {data.unmatchedSubmissions > 0 && (
            <Card style={{ marginBottom: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <span>
                  <StatusBadge status="Action needed" variant="warning" />{' '}
                  {data.unmatchedSubmissions} onboarding form submission{data.unmatchedSubmissions === 1 ? '' : 's'} could not be matched to a client.
                </span>
                <Link href="/admin/integrations">
                  <Button variant="secondary" size="sm">Review</Button>
                </Link>
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <Card>
              <CardHeader title="Stuck in setup" subtitle="Same onboarding step for 14+ days" />
              <ClientList items={data.stuck} empty="Nobody is stuck." render={(c) => `${c.currentStep} · ${c.daysOnStep} days`} />
            </Card>
            <Card>
              <CardHeader title="GoHighLevel not connected" subtitle="Add the sub-account Location ID" />
              <ClientList items={data.ghlNotConnected} empty="All clients are connected." />
            </Card>
            <Card>
              <CardHeader title="No CSM assigned" />
              <ClientList items={data.withoutCsm} empty="Every client has a CSM." />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
