'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Select, StatusBadge, Skeleton, Modal } from '@/components/ui';

interface StaffMember {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'csm';
  status: string;
  assignedClients: number | null;
  /** The CSM's own GHL booking calendar; null = the default calendar. */
  calendarId?: string | null;
  /** True on the signed-in admin's own row. */
  self?: boolean;
}

const CALENDAR_ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;
const CALENDAR_ID_ERROR = 'Use the id at the end of the booking link: letters, numbers, - and _ only (10 to 40 characters).';

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'csm' | 'admin'>('csm');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'csm' | 'admin'>('csm');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editCalendar, setEditCalendar] = useState('');

  // null until loaded from the server: never show a calendar id the server did not return.
  const [defaultCalendar, setDefaultCalendar] = useState<string | null>(null);
  const [defaultDraft, setDefaultDraft] = useState('');
  const [defaultBusy, setDefaultBusy] = useState(false);
  const [defaultError, setDefaultError] = useState('');

  const load = async () => {
    try {
      const data = await (await fetch('/api/admin/staff')).json();
      if (data.success) {
        setStaff(data.staff);
        if (typeof data.defaultCalendarId === 'string') {
          setDefaultCalendar(data.defaultCalendarId);
          setDefaultDraft(data.defaultCalendarId);
        }
      }
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

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setEditName(member.name || '');
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditCalendar(member.calendarId || '');
    setEditError('');
  };

  const saveDefaultCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = defaultDraft.trim();
    if (!CALENDAR_ID_PATTERN.test(id)) {
      setDefaultError(CALENDAR_ID_ERROR);
      return;
    }
    setDefaultBusy(true);
    setDefaultError('');
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_default_calendar', calendar_id: id }),
      });
      const data = await res.json();
      if (data.success) {
        setDefaultCalendar(data.defaultCalendarId);
        setDefaultDraft(data.defaultCalendarId);
        setMessage({ type: 'ok', text: data.changed ? 'Default booking calendar saved.' : 'No changes to save.' });
      } else {
        setDefaultError(data.error || 'Could not save the default booking calendar.');
      }
    } catch {
      setDefaultError('Network error. Nothing was saved.');
    } finally {
      setDefaultBusy(false);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const calendar = editCalendar.trim();
    if (editRole === 'csm' && calendar && !CALENDAR_ID_PATTERN.test(calendar)) {
      setEditError(CALENDAR_ID_ERROR);
      return;
    }
    setEditBusy(true);
    setEditError('');
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          action: 'update',
          name: editName,
          email: editEmail,
          // Your own role is locked; the server rejects it too.
          ...(editing.self ? {} : { role: editRole }),
          ...(editRole === 'csm' ? { calendar_id: calendar } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const emailChanged = (data.changed || []).includes('email');
        setMessage({
          type: 'ok',
          text:
            (data.changed || []).length === 0
              ? 'No changes to save.'
              : emailChanged
                ? `Saved. The sign-in email is now ${data.staff.email}; the password is unchanged.`
                : 'Saved.',
        });
        setEditing(null);
        load();
      } else {
        setEditError(data.error || 'Could not save the changes.');
      }
    } catch {
      setEditError('Network error. Nothing was saved.');
    } finally {
      setEditBusy(false);
    }
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

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Default booking calendar"
          subtitle="The GoHighLevel calendar clients book on when their CSM has no calendar of their own (set per CSM under Edit)."
        />
        {loading ? (
          <Skeleton height="48px" />
        ) : defaultCalendar === null ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            The default booking calendar could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <form
            onSubmit={saveDefaultCalendar}
            style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-start' }}
          >
            <div style={{ flex: '1 1 260px' }}>
              <Input
                id="default-booking-calendar"
                label="Default booking calendar ID (GoHighLevel)"
                value={defaultDraft}
                onChange={(e) => setDefaultDraft(e.target.value)}
                error={defaultError || undefined}
                helperText="GHL → Calendars → the calendar → the id in the booking link (…/widget/booking/<id>)."
                required
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={defaultBusy || defaultDraft.trim() === defaultCalendar}
              style={{ marginTop: 'var(--space-6)' }}
            >
              {defaultBusy ? 'Saving...' : 'Save default'}
            </Button>
          </form>
        )}
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
                  {m.role === 'csm' && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      {m.calendarId ? `Calendar: ${m.calendarId}` : 'Default calendar'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <StatusBadge status={m.role === 'admin' ? 'Admin' : 'CSM'} variant="progress" />
                  {m.status === 'suspended' && <StatusBadge status="Disabled" variant="suspended" />}
                  {m.self && <StatusBadge status="You" variant="pending" dot={false} />}
                  <Button variant="outline" size="sm" onClick={() => openEdit(m)} aria-label={`Edit ${m.name || m.email}`}>
                    Edit
                  </Button>
                  {!m.self && (
                    <Button variant="outline" size="sm" onClick={() => toggle(m)}>
                      {m.status === 'suspended' ? 'Enable' : 'Disable'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => !editBusy && setEditing(null)}
        title="Edit staff member"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', justifyContent: 'flex-end' }}>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={editBusy}>
              Cancel
            </Button>
            <Button type="submit" form="edit-staff-form" variant="primary" disabled={editBusy}>
              {editBusy ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        }
      >
        {editing && (
          <form id="edit-staff-form" onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {editError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  backgroundColor: 'var(--color-status-danger-bg)',
                  color: 'var(--color-status-danger-text)',
                }}
              >
                {editError}
              </div>
            )}
            <Input id="edit-staff-name" label="Full name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            <Input
              id="edit-staff-email"
              label="Work email"
              type="email"
              placeholder="name@motionz.ai"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              required
              helperText="Must be an @motionz.ai address. Changing it changes the email they sign in with; their password stays the same."
            />
            <Select
              id="edit-staff-role"
              label="Role"
              value={editRole}
              disabled={editing.self}
              onChange={(e) => setEditRole(e.target.value === 'admin' ? 'admin' : 'csm')}
              helperText={editing.self ? 'You cannot change your own role. Ask another admin.' : undefined}
            >
              <option value="csm">CSM</option>
              <option value="admin">Admin (CSM manager)</option>
            </Select>
            {editRole === 'csm' && (
              <Input
                id="edit-staff-calendar"
                label="Booking calendar ID (GoHighLevel)"
                value={editCalendar}
                onChange={(e) => setEditCalendar(e.target.value)}
                helperText="GHL → Calendars → the CSM's calendar → the id in the booking link (…/widget/booking/<id>). Leave empty to use the default calendar."
              />
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
