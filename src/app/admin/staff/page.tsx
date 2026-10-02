'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Select, StatusBadge, Skeleton } from '@/components/ui';

interface StaffMember {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'csm';
  status: string;
  assignedClients: number | null;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'csm' | 'admin'>('csm');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    try {
      const data = await (await fetch('/api/admin/staff')).json();
      if (data.success) setStaff(data.staff);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'ok',
          text: data.emailDelivered
            ? `${data.staff.email} was added and emailed a link to set their password.`
            : data.setupUrl
              ? `Added. Email is not configured locally; password setup link: ${data.setupUrl}`
              : `Added, but the welcome email could not be sent. They can use "Forgot password" on the login page.`,
        });
        setName('');
        setEmail('');
        setRole('csm');
        load();
      } else {
        setMessage({ type: 'error', text: data.error || 'Could not add staff member.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (member: StaffMember) => {
    const action = member.status === 'suspended' ? 'enable' : 'disable';
    if (action === 'disable' && !window.confirm(`Disable portal access for ${member.email}?`)) return;
    const res = await fetch('/api/admin/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: member.id, action }),
    });
    const data = await res.json();
    if (data.success) load();
    else setMessage({ type: 'error', text: data.error || 'Could not update staff member.' });
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Staff</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Motionz team members who can sign in. CSMs see only the clients assigned to them; Admins see everything.
        </p>
      </div>

      {message && (
        <div
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            wordBreak: 'break-all',
            backgroundColor: message.type === 'ok' ? 'var(--color-status-done-bg)' : 'var(--color-status-danger-bg)',
            color: message.type === 'ok' ? 'var(--color-status-done-text)' : 'var(--color-status-danger-text)',
          }}
        >
          {message.text}
        </div>
      )}

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Add a staff member" subtitle="They receive an email to set their password, then sign in on the Staff tab." />
        <form onSubmit={addStaff} style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', alignItems: 'end' }}>
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Work email" type="email" placeholder="name@motionz.ai" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'csm')}>
            <option value="csm">CSM</option>
            <option value="admin">Admin (CSM manager)</option>
          </Select>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Adding...' : 'Add staff member'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Team" subtitle={loading ? undefined : `${staff.length} people`} />
        {loading ? (
          <Skeleton height="120px" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {staff.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{m.name || m.email}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {m.email}
                    {m.assignedClients !== null ? ` · ${m.assignedClients} assigned client${m.assignedClients === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <StatusBadge status={m.role === 'admin' ? 'Admin' : 'CSM'} variant="progress" />
                  {m.status === 'suspended' && <StatusBadge status="Disabled" variant="suspended" />}
                  <Button variant="outline" size="sm" onClick={() => toggle(m)}>
                    {m.status === 'suspended' ? 'Enable' : 'Disable'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
