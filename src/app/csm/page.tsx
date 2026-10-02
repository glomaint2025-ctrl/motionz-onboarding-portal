'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge, Skeleton } from '@/components/ui';

interface AssignedClient {
  id: string;
  name: string;
  primary_contact_name?: string;
  progress_percent: number;
  current_step_name: string | null;
}

export default function CSMWorkspacePage() {
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/csm/clients')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setClients(data.clients || []);
        else setError(data.error || 'Could not load your clients.');
      })
      .catch(() => setError('Network error while loading your clients.'))
      .finally(() => setLoading(false));
  }, []);

  const inSetup = clients.filter((c) => c.progress_percent < 100).length;
  const avgProgress = clients.length
    ? Math.round(clients.reduce((sum, c) => sum + c.progress_percent, 0) / clients.length)
    : 0;

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>CSM Workspace</h1>
        <p>Manage assigned client onboarding setups, update step statuses, and edit guidance copy.</p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Assigned Clients</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {loading ? '-' : clients.length}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {loading ? '' : `${inSetup} still in setup`}
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Average Setup Progress</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {loading ? '-' : `${avgProgress}%`}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Across assigned clients</span>
        </Card>
      </div>

      <Card>
        <CardHeader title="My Assigned Portals" subtitle="Clients your CSM manager has assigned to you" />
        {loading ? (
          <Skeleton height="120px" />
        ) : error ? (
          <p style={{ color: 'var(--color-status-danger-text)' }}>{error}</p>
        ) : clients.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No clients are assigned to you yet. Ask your CSM manager to assign clients.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {clients.map((client) => (
              <div
                key={client.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)' }}>{client.name}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {client.primary_contact_name ? `Contact: ${client.primary_contact_name} · ` : ''}
                    {client.current_step_name
                      ? `Current step: ${client.current_step_name}`
                      : client.progress_percent === 100
                        ? 'Setup complete'
                        : 'No setup steps yet'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <StatusBadge
                    status={`${client.progress_percent}% Progress`}
                    variant={client.progress_percent === 100 ? 'done' : 'progress'}
                  />
                  <Link href={`/portal/${client.id}`}>
                    <Button variant="secondary" size="sm">Open Client Portal</Button>
                  </Link>
                  <Link href={`/csm/clients/${client.id}/setup`}>
                    <Button variant="primary" size="sm">Update Setup</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
