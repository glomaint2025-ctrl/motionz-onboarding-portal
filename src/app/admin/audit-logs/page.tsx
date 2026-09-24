'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, Input, Table, Column, StatusBadge } from '@/components/ui';

interface AuditLogRecord {
  id: string;
  tenant_id?: string;
  actor_email: string;
  actor_role: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: any;
  created_at: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        if (data.success && data.auditLogs) {
          setLogs(data.auditLogs);
        }
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    return (
      log.actor_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.resource_type && log.resource_type.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  const columns: Column<AuditLogRecord>[] = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (log) => (
        <span style={{ fontSize: 'var(--font-size-xs)', fontFamily: 'var(--font-family-mono)' }}>
          {new Date(log.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (log) => (
        <div>
          <span style={{ fontSize: 'var(--font-size-sm)', display: 'block' }}>{log.actor_email}</span>
          <StatusBadge status={log.actor_role} variant="pending" />
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => (
        <span style={{ fontWeight: 'var(--font-weight-medium)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
          {log.action}
        </span>
      ),
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (log) => (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          {log.resource_type || 'N/A'}: {log.resource_id || ''}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (log) => (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {log.details ? JSON.stringify(log.details) : 'None'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Security and Audit Logs</h1>
        <p>Immutable ledger of administrative actions, user authentications, and portal lifecycle events.</p>
      </div>

      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <Input
          label="Search Logs"
          placeholder="Filter by actor email, action event, or resource..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {loading ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p>Loading audit ledger...</p>
        </Card>
      ) : (
        <Table
          columns={columns}
          data={filteredLogs}
          keyExtractor={(l) => l.id}
          emptyMessage="No audit log entries recorded yet."
        />
      )}
    </div>
  );
}
