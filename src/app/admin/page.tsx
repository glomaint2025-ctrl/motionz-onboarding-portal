'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';

export default function AdminDashboardPage() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Admin Command Center</h1>
          <p>Global multi-tenant platform telemetry, client lifecycle, and security oversight.</p>
        </div>
        <Link href="/admin/clients/new">
          <Button variant="primary">
            Add Client
          </Button>
        </Link>
      </div>

      {/* Admin KPI Telemetry Tiles */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Active Clients
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            128
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-done-text)' }}>
            142 Total Provisioned
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            GHL Not Connected
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0', color: 'var(--color-status-warning-text)' }}>
            5
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>
            Requires integration setup
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Stuck in Setup (&gt;14d)
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0', color: 'var(--color-status-danger-text)' }}>
            3
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-danger-text)' }}>
            Requires CSM intervention
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Security Alerts
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            0
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-done-text)' }}>
            All systems normal
          </span>
        </Card>
      </div>

      {/* Quick Navigation Sections */}
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <CardHeader
            title="Client Management"
            subtitle="Provision and manage client portals"
            action={<StatusBadge status="128 Active" variant="done" />}
          />
          <p style={{ marginBottom: 'var(--space-4)' }}>
            Add new client organizations, assign CSMs, toggle feature modules, duplicate templates, and manage invitations.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Link href="/admin/clients" style={{ flex: 1 }}>
              <Button variant="secondary" fullWidth>
                View Client Directory
              </Button>
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Master Portal Templates"
            subtitle="Template governance"
            action={<StatusBadge status="v1.0 Baseline" variant="progress" />}
          />
          <p style={{ marginBottom: 'var(--space-4)' }}>
            Manage the default 5 setup steps, base video script templates, and default feature toggles inherited by new client portals.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Link href="/admin/templates" style={{ flex: 1 }}>
              <Button variant="secondary" fullWidth>
                Manage Templates
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
