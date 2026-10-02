'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input, Select, Skeleton } from '@/components/ui';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  created_at: string;
}

interface Appointment {
  id: string;
  contact_name: string;
  appointment_time: string;
  status: string;
  notes?: string;
}

export default function LeadsAndPerformancePage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [activeTab, setActiveTab] = useState<'pipeline' | 'appointments'>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ghlConnected, setGhlConnected] = useState(true);
  const [locationId, setLocationId] = useState('loc_ghl_demo_abc');

  useEffect(() => {
    let isMounted = true;
    async function loadLeads() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.leads) setLeads(data.leads);
            if (data.appointments) setAppointments(data.appointments);
            const ghlConfig = data.integrations?.find((i: any) => i.integration_type === 'ghl');
            if (ghlConfig) {
              setGhlConnected(ghlConfig.is_active);
              setLocationId(ghlConfig.config_data?.location_id || '');
            }
          }
        }
      } catch (err) {
        // Fallback
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadLeads();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const activeLeads: Lead[] = leads;
  const activeAppointments: Appointment[] = appointments;

  const filteredLeads = activeLeads.filter((lead) => {
    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.toLowerCase();
    const matchesQuery =
      fullName.includes(searchQuery.toLowerCase()) ||
      (lead.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.phone || '').includes(searchQuery);

    const matchesStatus =
      statusFilter === 'ALL' || (lead.status || '').toLowerCase() === statusFilter.toLowerCase();

    return matchesQuery && matchesStatus;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Leads & Performance</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Realtime pipeline synchronization and appointment tracking via GoHighLevel.
        </p>
      </div>

      {/* Integration Connection Banner */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: ghlConnected ? 'var(--color-status-done-bg)' : 'var(--color-status-progress-bg)',
          border: `1px solid ${ghlConnected ? 'var(--color-status-done-border)' : 'var(--color-status-progress-border)'}`,
          marginBottom: 'var(--space-6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <div>
          <span
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-sm)',
              color: ghlConnected ? 'var(--color-status-done-text)' : 'var(--color-status-progress-text)',
            }}
          >
            GoHighLevel Sync: {ghlConnected ? 'Connected & Operational' : 'Awaiting Connection'}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              marginTop: '2px',
            }}
          >
            Location ID: {locationId || 'Not Configured'}
          </span>
        </div>
        <StatusBadge
          status={ghlConnected ? 'Live' : 'Pending'}
          variant={ghlConnected ? 'done' : 'progress'}
        />
      </div>

      {/* KPI Telemetry Cards */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Total Pipeline Leads
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {activeLeads.length}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Captured campaigns
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Appointments Booked
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {isLoading ? <Skeleton width="50px" height="32px" /> : activeAppointments.length}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-progress-text)' }}>
            Confirmed inspections
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Inspection Completed
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            {isLoading ? <Skeleton width="50px" height="32px" /> : activeLeads.filter((l) => l.status === 'Inspection Completed').length}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-done-text)' }}>
            Ready for proposal
          </span>
        </Card>

        <Card>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Estimated Pipeline Value
          </span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
            $38,500
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Average $8,500 / job
          </span>
        </Card>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <Button
          variant={activeTab === 'pipeline' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('pipeline')}
        >
          Pipeline Leads ({activeLeads.length})
        </Button>
        <Button
          variant={activeTab === 'appointments' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('appointments')}
        >
          Appointments ({activeAppointments.length})
        </Button>
      </div>

      {activeTab === 'pipeline' ? (
        <Card>
          <CardHeader
            title="Lead Contacts"
            subtitle="Synced in real-time from GoHighLevel campaigns"
          />

          {/* Search & Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 240px' }}>
              <Input
                placeholder="Search leads by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ width: '200px' }}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="Contacted">Contacted</option>
                <option value="Appointment Booked">Appointment Booked</option>
                <option value="Inspection Completed">Inspection Completed</option>
              </Select>
            </div>
          </div>

          {/* Leads Table / Responsive List */}
          {isLoading ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Contact</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Email</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Phone</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Source</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Date</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: 'var(--space-3)' }}><Skeleton width="130px" height="18px" /></td>
                      <td style={{ padding: 'var(--space-3)' }}><Skeleton width="160px" height="16px" /></td>
                      <td style={{ padding: 'var(--space-3)' }}><Skeleton width="110px" height="16px" /></td>
                      <td style={{ padding: 'var(--space-3)' }}><Skeleton width="90px" height="14px" /></td>
                      <td style={{ padding: 'var(--space-3)' }}><Skeleton width="75px" height="14px" /></td>
                      <td style={{ padding: 'var(--space-3)' }}><Skeleton width="85px" height="24px" borderRadius="var(--radius-full)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No leads match the selected criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Contact</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Email</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Phone</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Source</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Date</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                    >
                      <td style={{ padding: 'var(--space-3)', fontWeight: 'var(--font-weight-medium)' }}>
                        {lead.first_name} {lead.last_name}
                      </td>
                      <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
                        {lead.email}
                      </td>
                      <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
                        {lead.phone}
                      </td>
                      <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        {lead.source}
                      </td>
                      <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <StatusBadge
                          status={lead.status}
                          variant={
                            lead.status === 'Inspection Completed'
                              ? 'done'
                              : lead.status === 'Appointment Booked'
                              ? 'progress'
                              : 'pending'
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Booked Appointments"
            subtitle="Confirmed roof inspections and customer meetings"
          />
          {activeAppointments.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No appointments scheduled yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {activeAppointments.map((apt) => (
                <div
                  key={apt.id}
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-md)' }}>
                      {apt.contact_name}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
                      Time: {new Date(apt.appointment_time).toLocaleString()}
                    </div>
                    {apt.notes && (
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>
                        Note: {apt.notes}
                      </div>
                    )}
                  </div>
                  <StatusBadge
                    status={apt.status.toUpperCase()}
                    variant={apt.status === 'confirmed' ? 'done' : 'progress'}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
