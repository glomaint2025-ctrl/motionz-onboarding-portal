'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';

export default function CSMWorkspacePage() {
  const assignedClients = [
    { id: 'demo', name: 'ABC Roofing', contact: 'John Smith', progress: 60, currentStep: 'GoHighLevel / A2P Verified', status: 'Active' },
    { id: 'client-2', name: 'Apex Exteriors', contact: 'David Miller', progress: 80, currentStep: 'Phone system & A2P texting', status: 'Active' },
    { id: 'client-3', name: 'Summit Restoration', contact: 'Sarah Connor', progress: 20, currentStep: 'Facebook', status: 'Needs Review' },
  ];

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
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Assigned Clients
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            14
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-done-text)' }}>
            3 requiring review
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Average Velocity
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            68%
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Setup completion
          </span>
        </Card>
      </div>

      {/* Assigned Clients Table */}
      <Card>
        <CardHeader
          title="My Assigned Portals"
          subtitle="Direct link to client portal administrative view"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {assignedClients.map((client) => (
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
                <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)' }}>
                  {client.name}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Contact: {client.contact} &middot; Current Step: {client.currentStep}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <StatusBadge status={`${client.progress}% Progress`} variant="progress" />
                <Link href={`/portal/${client.id}`}>
                  <Button variant="secondary" size="sm">
                    Open Client Portal
                  </Button>
                </Link>
                <Link href={`/csm/clients/${client.id}/setup`}>
                  <Button variant="primary" size="sm">
                    Update Setup
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
