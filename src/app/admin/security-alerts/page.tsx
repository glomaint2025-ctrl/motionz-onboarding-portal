'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, Table, Column, StatusBadge, TableSkeleton } from '@/components/ui';

interface SecurityAlertRecord {
  id: string;
  tenant_id?: string;
  event_type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  details?: any;
  is_resolved: boolean;
  created_at: string;
}

export default function SecurityAlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        if (data.success && data.securityEvents) {
          setAlerts(data.securityEvents);
        }
      } catch (err) {
        console.error('Failed to load security alerts:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  const columns: Column<SecurityAlertRecord>[] = [
    {
      key: 'created_at',
      header: 'Detected At',
      render: (alert) => (
        <span style={{ fontSize: 'var(--font-size-xs)', fontFamily: 'var(--font-family-mono)' }}>
          {new Date(alert.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'event_type',
      header: 'Event Type',
      render: (alert) => (
        <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-status-danger-text)' }}>
          {alert.event_type}
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (alert) => (
        <StatusBadge
          status={alert.severity.toUpperCase()}
          variant={alert.severity === 'critical' || alert.severity === 'high' ? 'danger' : 'warning'}
        />
      ),
    },
    {
      key: 'details',
      header: 'Incident Details',
      render: (alert) => (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          {alert.details ? JSON.stringify(alert.details) : 'None'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (alert) => (
        <StatusBadge
          status={alert.is_resolved ? 'Resolved' : 'Active Alert'}
          variant={alert.is_resolved ? 'done' : 'danger'}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Security Alerts</h1>
        <p>Real-time intrusion detection, domain authorization failures, and tenant quarantine alerts.</p>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : alerts.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <StatusBadge status="All Systems Secure" variant="done" />
          <h2 style={{ margin: 'var(--space-3) 0 var(--space-1)' }}>Zero Active Security Alerts</h2>
          <p>No unauthorized domain attempts or security violations detected.</p>
        </Card>
      ) : (
        <Table
          columns={columns}
          data={alerts}
          keyExtractor={(a) => a.id}
        />
      )}
    </div>
  );
}
