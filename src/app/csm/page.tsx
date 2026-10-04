'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, buttonClasses } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';

interface CsmStats {
  totalClients: number;
  pendingSetup: number;
  avgProgress: number;
}

export default function CSMWorkspacePage() {
  const [stats, setStats] = useState<CsmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Only the totals are needed here; the full list lives on "My clients".
      const res = await fetch('/api/csm/clients?page=1&pageSize=1');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.stats) {
        setStats({
          totalClients: data.stats.totalClients ?? 0,
          pendingSetup: data.stats.pendingSetup ?? 0,
          avgProgress: data.stats.avgProgress ?? 0,
        });
      } else {
        setError(data.error || 'Could not load your clients.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = (text: string) => (loading ? '-' : error || !stats ? '—' : text);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>CSM Workspace</h1>
        <p>A quick look at the clients assigned to you.</p>
      </div>

      {error && (
        <Notice onRetry={load} style={{ marginBottom: 'var(--space-5)' }}>
          {error}
        </Notice>
      )}

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Assigned clients</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {value(String(stats?.totalClients ?? 0))}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {!loading && !error && stats ? `${stats.pendingSetup} still in setup` : ''}
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Average setup progress</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {value(`${stats?.avgProgress ?? 0}%`)}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Across your assigned clients</span>
        </Card>
      </div>

      {!loading && !error && stats?.totalClients === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          No clients are assigned to you yet. Ask a Motionz admin to assign clients to you.
        </p>
      ) : (
        <Link href="/csm/clients" className={buttonClasses({ variant: 'primary' })}>
          View my clients
        </Link>
      )}
    </div>
  );
}
