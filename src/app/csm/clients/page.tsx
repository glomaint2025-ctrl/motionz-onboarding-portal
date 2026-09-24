'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Input, Button, Table, Column, StatusBadge } from '@/components/ui';

interface AssignedClient {
  id: string;
  name: string;
  primary_email: string;
  primary_contact_name?: string;
  status: string;
  progress_percent: number;
  total_steps: number;
  completed_steps: number;
}

export default function CSMClientsPage() {
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/clients');
        const data = await res.json();
        if (data.success && data.tenants) {
          setClients(data.tenants);
        }
      } catch (err) {
        console.error('Failed to load clients:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, []);

  const filteredClients = clients.filter((client) => {
    return (
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.primary_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.primary_contact_name && client.primary_contact_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  const columns: Column<AssignedClient>[] = [
    {
      key: 'name',
      header: 'Client Company',
      render: (client) => (
        <div>
          <span style={{ fontWeight: 'var(--font-weight-semibold)', display: 'block' }}>{client.name}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {client.primary_contact_name || client.primary_email}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (client) => <StatusBadge status={client.status} />,
    },
    {
      key: 'progress',
      header: 'Setup Progress',
      render: (client) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: '80px', height: '6px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ width: `${client.progress_percent}%`, height: '100%', backgroundColor: 'var(--color-primary)' }} />
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {client.completed_steps}/{client.total_steps} ({client.progress_percent}%)
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (client) => (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href={`/csm/clients/${client.id}/setup`}>
            <Button variant="primary" size="sm">
              Manage Setup
            </Button>
          </Link>
          <Link href={`/portal/${client.id}`}>
            <Button variant="secondary" size="sm">
              Client View
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Assigned Client Portals</h1>
        <p>Review active client onboarding setups, inspect milestone statuses, and update operational progress.</p>
      </div>

      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <Input
          label="Search Assigned Clients"
          placeholder="Filter by company name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {loading ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p>Loading assigned client roster...</p>
        </Card>
      ) : (
        <Table
          columns={columns}
          data={filteredClients}
          keyExtractor={(c) => c.id}
          emptyMessage="No assigned client portals found."
        />
      )}
    </div>
  );
}
