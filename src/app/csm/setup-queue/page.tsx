'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge, Table, Column } from '@/components/ui';

interface QueueItem {
  id: string;
  name: string;
  primary_email: string;
  current_step_name: string;
  current_step_status: string;
  progress_percent: number;
}

export default function CSMSetupQueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/csm/clients?status=in_progress');
        const data = await res.json();
        if (data.success && data.tenants) {
          // Filter to clients that have incomplete steps (< 100%)
          const activeQueue: QueueItem[] = data.tenants
            .filter((t: any) => t.status !== 'suspended' && t.current_step_name)
            .map((t: any) => ({
              id: t.id,
              name: t.name,
              primary_email: t.primary_email,
              current_step_name: t.current_step_name,
              current_step_status: t.current_step_status === 'in_progress' ? 'In Progress' : 'Not Started',
              progress_percent: t.progress_percent,
            }));
          setQueue(activeQueue);
        }
      } catch (err) {
        console.error('Failed to load queue:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchQueue();
  }, []);

  const columns: Column<QueueItem>[] = [
    {
      key: 'name',
      header: 'Client Company',
      render: (item) => (
        <div>
          <span style={{ fontWeight: 'var(--font-weight-semibold)', display: 'block' }}>{item.name}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{item.primary_email}</span>
        </div>
      ),
    },
    {
      key: 'current_step',
      header: 'Active Milestone',
      render: (item) => (
        <div>
          <span style={{ fontSize: 'var(--font-size-sm)', display: 'block' }}>{item.current_step_name}</span>
          <StatusBadge status={item.current_step_status} variant="progress" />
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (item) => (
        <span style={{ fontSize: 'var(--font-size-sm)' }}>
          {item.progress_percent}%
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (item) => (
        <Link href={`/csm/clients/${item.id}/setup`}>
          <Button variant="primary" size="sm">
            Review & Advance
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Setup Review Queue</h1>
        <p>Portals currently undergoing active onboarding milestones requiring CSM attention.</p>
      </div>

      {loading ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p>Loading setup review queue...</p>
        </Card>
      ) : queue.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <StatusBadge status="All Caught Up" variant="done" />
          <h2 style={{ margin: 'var(--space-3) 0 var(--space-1)' }}>No Pending Setup Milestones</h2>
          <p>All assigned client portals have completed their onboarding roadmaps.</p>
        </Card>
      ) : (
        <Table
          columns={columns}
          data={queue}
          keyExtractor={(item) => item.id}
        />
      )}
    </div>
  );
}
