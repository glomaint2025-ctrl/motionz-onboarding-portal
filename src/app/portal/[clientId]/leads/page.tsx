'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, StatusBadge, Input, Select, Skeleton } from '@/components/ui';

interface Lead {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  created_at: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Read-only view of the client's GoHighLevel leads (opportunities). Stages are changed in GHL,
 * never here (client answer 1.5); GHL workflows push every change to the portal.
 */
export default function LeadsPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [connected, setConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/portal/${clientId}/data`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setLeads(data.leads || []);
        setConnected(Boolean(data.tenant?.ghl_location_id));
      })
      .catch(() => {})
      .finally(() => isMounted && setIsLoading(false));
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const stages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const stage = l.status || 'New';
      counts.set(stage, (counts.get(stage) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const newThisWeek = leads.filter((l) => Date.now() - new Date(l.created_at).getTime() < WEEK_MS).length;

  const q = searchQuery.trim().toLowerCase();
  const filtered = leads.filter((l) => {
    const name = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase();
    const matchesQuery =
      !q || name.includes(q) || (l.email || '').toLowerCase().includes(q) || (l.phone || '').includes(q);
    const matchesStage = stageFilter === 'ALL' || (l.status || 'New') === stageFilter;
    return matchesQuery && matchesStage;
  });

  const stat = (label: string, value: React.ReactNode) => (
    <Card>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{label}</span>
      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', marginTop: 'var(--space-1)' }}>{value}</div>
    </Card>
  );

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Leads</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Leads from your GoHighLevel account. To change a lead&apos;s stage, update it in GoHighLevel and it updates
          here automatically.
        </p>
      </div>

      {!isLoading && !connected && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Your GoHighLevel account is not connected yet. Your CSM is setting it up, and leads will appear here
            once it is ready.
          </p>
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        {stat('Total leads', isLoading ? '-' : leads.length)}
        {stat('New this week', isLoading ? '-' : newThisWeek)}
        {stages.slice(0, 2).map(([stage, count]) => (
          <React.Fragment key={stage}>{stat(stage, count)}</React.Fragment>
        ))}
      </div>

      <Card>
        <CardHeader title="All leads" subtitle={isLoading ? undefined : `${filtered.length} of ${leads.length}`} />

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <div style={{ flex: '1 1 220px' }}>
            <Input
              placeholder="Search name, email or phone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ flex: '0 1 220px' }}>
            <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="ALL">All stages</option>
              {stages.map(([stage]) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton height="160px" />
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            {leads.length === 0 ? 'No leads yet.' : 'No leads match your search.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                  {['Name', 'Phone', 'Email', 'Source', 'Stage', 'Added'].map((h) => (
                    <th key={h} style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>
                      {`${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unnamed lead'}
                    </td>
                    <td style={{ padding: 'var(--space-2)' }}>
                      {l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '-'}
                    </td>
                    <td style={{ padding: 'var(--space-2)', wordBreak: 'break-all' }}>{l.email || '-'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{l.source || '-'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>
                      <StatusBadge status={l.status || 'New'} variant="progress" />
                    </td>
                    <td style={{ padding: 'var(--space-2)', whiteSpace: 'nowrap' }}>
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
