'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, Button, Input, Select, StatusBadge, Table, Column } from '@/components/ui';

interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  primary_email: string;
  primary_contact_name?: string;
  status: string;
  csm_name: string;
  progress_percent: number;
  ghl_location_id?: string;
  created_at: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  useEffect(() => {
    fetchClients();
  }, []);

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.primary_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.primary_contact_name && client.primary_contact_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<ClientRecord>[] = [
    {
      key: 'name',
      header: 'Company / Organization',
      render: (client) => (
        <div>
          <span style={{ fontWeight: 'var(--font-weight-semibold)', display: 'block' }}>
            {client.name}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {client.primary_contact_name || client.primary_email}
          </span>
        </div>
      ),
    },
    {
      key: 'csm_name',
      header: 'Assigned CSM',
      render: (client) => (
        <span style={{ fontSize: 'var(--font-size-sm)' }}>
          {client.csm_name}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (client) => <StatusBadge status={client.status} />,
    },
    {
      key: 'progress_percent',
      header: 'Setup Progress',
      render: (client) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: '80px', height: '6px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ width: `${client.progress_percent}%`, height: '100%', backgroundColor: 'var(--color-primary)' }} />
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {client.progress_percent}%
          </span>
        </div>
      ),
    },
    {
      key: 'ghl',
      header: 'GoHighLevel',
      render: (client) => (
        client.ghl_location_id ? (
          <StatusBadge status="Connected" variant="done" />
        ) : (
          <StatusBadge status="Not Connected" variant="warning" />
        )
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (client) => (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href={`/portal/${client.id}`}>
            <Button variant="secondary" size="sm">
              Open Portal
            </Button>
          </Link>
          <Link href={`/admin/clients/${client.id}`}>
            <Button variant="outline" size="sm">
              Settings
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>Client Management</h1>
          <p>Provision and oversee client company portals, template clones, and assigned CSMs.</p>
        </div>
        <Link href="/admin/clients/new">
          <Button variant="primary">
            Add New Client
          </Button>
        </Link>
      </div>

      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Input
            label="Search Clients"
            placeholder="Search by company, email, contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select
            label="Filter by Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </Card>

      {loading ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p>Loading client roster...</p>
        </Card>
      ) : (
        <Table
          columns={columns}
          data={filteredClients}
          keyExtractor={(c) => c.id}
          emptyMessage="No matching client portals found."
        />
      )}
    </div>
  );
}
