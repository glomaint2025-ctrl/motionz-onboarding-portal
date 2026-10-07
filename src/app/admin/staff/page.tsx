'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Select, StatusBadge, Skeleton, Modal } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';

type SectionMessage = { type: 'ok' | 'error'; text: string } | null;

/** A result line shown inside the section it belongs to, right next to the form or list it is about. */
function SectionNotice({ message, style }: { message: SectionMessage; style?: React.CSSProperties }) {
  if (!message) return null;
  return (
    <Notice tone={message.type === 'ok' ? 'success' : 'error'} style={{ wordBreak: 'break-word', ...style }}>
      {message.text}
    </Notice>
  );
}

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
  // Each section keeps its own result message, shown inside that section.
  const [addMessage, setAddMessage] = useState<SectionMessage>(null);
  const [teamMessage, setTeamMessage] = useState<SectionMessage>(null);
  const [defaultMessage, setDefaultMessage] = useState<SectionMessage>(null);
  /** Typing in the Add form clears an old error there (a success line stays until the next submit). */
  const clearAddError = () => setAddMessage((prev) => (prev?.type === 'error' ? null : prev));

  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
    setAddMessage(null);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (data.success) {
        setAddMessage({
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
        setAddMessage({ type: 'error', text: data.error || 'Could not add the staff member.' });
      }
    } catch {
      setAddMessage({ type: 'error', text: 'Could not reach the server. The staff member was not added.' });
    } finally {
      setBusy(false);
    }
  };

  /** Only people who are already disabled can be enabled again; there is no Disable button any more. */
  const enable = async (member: StaffMember) => {
    setTeamMessage(null);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, action: 'enable' }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setTeamMessage({ type: 'ok', text: `${member.name || member.email} was enabled.` });
        load();
      } else {
        setTeamMessage({ type: 'error', text: data.error || 'Could not update the staff member.' });
      }
    } catch {
      setTeamMessage({ type: 'error', text: 'Could not reach the server. Nothing was changed.' });
    }
  };

  const openDelete = (member: StaffMember) => {
    setDeleteTarget(member);
    setDeleteError('');
  };

  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTeamMessage({ type: 'ok', text: `${deleteTarget.name || deleteTarget.email} was deleted.` });
        setDeleteTarget(null);
        load();
      } else {
        // The server's reason (e.g. they still have clients) stays inside the dialog.
        setDeleteError(data.error || 'Could not delete this staff member. Please try again.');
      }
    } catch {
      setDeleteError('Could not reach the server. Nobody was deleted.');
    } finally {
      setDeleteBusy(false);
    }
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
    setDefaultMessage(null);
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
        setDefaultError('');
        setDefaultMessage({ type: 'ok', text: data.changed ? 'Default booking calendar saved.' : 'No changes to save.' });
      } else {
        setDefaultError(data.error || 'Could not save the default booking calendar.');
      }
    } catch {
      setDefaultError('Could not reach the server. Nothing was saved.');
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
        setTeamMessage({
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
      setEditError('Could not reach the server. Nothing was saved.');
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Staff</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Motionz team members who can sign in. CSMs see only the clients assigned to them; CSM Managers see everything.
        </p>
      </div>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader title="Add a staff member" subtitle="They receive an email to set their password, then sign in with their email and password." />
        {/* One row from about 900px; the button lines up with the input boxes (staff-tables.css). */}
        <form onSubmit={addStaff} className="staff-add-form">
          <Input
            label="Full name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearAddError();
            }}
            required
          />
          <Input
            label="Work email"
            type="email"
            placeholder="name@motionz.ai"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearAddError();
            }}
            required
          />
          <Select
            label="Role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value === 'admin' ? 'admin' : 'csm');
              clearAddError();
            }}
          >
            <option value="csm">CSM</option>
            <option value="admin">CSM Manager</option>
          </Select>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Adding...' : 'Add staff member'}
          </Button>
        </form>
        {/* The result appears right under the form that caused it. */}
        <SectionNotice message={addMessage} style={{ marginTop: 'var(--space-3)' }} />
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
                onChange={(e) => {
                  // Correcting the field clears the old error and result straight away.
                  setDefaultDraft(e.target.value);
                  setDefaultError('');
                  setDefaultMessage(null);
                }}
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
        <SectionNotice message={defaultMessage} style={{ marginTop: 'var(--space-3)' }} />
      </Card>

      <Card>
        <CardHeader title="Team" subtitle={loading ? undefined : `${staff.length} people`} />
        <SectionNotice message={teamMessage} style={{ marginBottom: 'var(--space-3)' }} />
        {loading ? (
          <Skeleton height="120px" />
        ) : (
          <div className="ui-modern-table-card ui-staff-table-card">
            {/* Same table as Admin > Clients: fits a 1024px screen, stacked cards on phones (staff-tables.css). */}
            <table className="ui-modern-table ui-clients-table ui-staff-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', justifyContent: 'center', padding: 'var(--space-8) var(--space-4)', color: 'var(--color-text-muted)' }}>
                      No staff members yet.
                    </td>
                  </tr>
                ) : (
                  staff.map((m) => {
                    const label = m.name || m.email;
                    const disabled = m.status === 'suspended';
                    return (
                      <tr key={m.id}>
                        <td className="ui-cell-title" data-label="User">
                          <div className="ui-staff-user">
                            <span className="ui-company-name">{label}</span>
                            <span className="ui-company-sub">{m.email}</span>
                            {m.role === 'csm' && (
                              <span className="ui-company-sub">
                                {m.assignedClients !== null
                                  ? `${m.assignedClients} assigned client${m.assignedClients === 1 ? '' : 's'} · `
                                  : ''}
                                {m.calendarId ? `Calendar: ${m.calendarId}` : 'Default calendar'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-label="Role">
                          <div className="ui-staff-badges">
                            <StatusBadge status={m.role === 'admin' ? 'CSM Manager' : 'CSM'} variant="progress" dot={false} />
                            {m.self && <StatusBadge status="You" variant="pending" dot={false} />}
                          </div>
                        </td>
                        <td data-label="Status">
                          {disabled ? <StatusBadge status="Disabled" variant="suspended" /> : <StatusBadge status="Active" variant="done" />}
                        </td>
                        <td className="ui-cell-actions" data-label="Actions">
                          <div className="ui-actions-cell">
                            <Button variant="outline" size="sm" onClick={() => openEdit(m)} aria-label={`Edit ${label}`}>
                              Edit
                            </Button>
                            {!m.self && disabled && (
                              <Button variant="outline" size="sm" onClick={() => enable(m)} aria-label={`Enable ${label}`}>
                                Enable
                              </Button>
                            )}
                            {!m.self && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="ui-btn-danger-outline"
                                onClick={() => openDelete(m)}
                                aria-label={`Delete ${label}`}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={closeDelete}
        title="Delete staff member"
        dismissOnOverlay={!deleteBusy}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="outline" onClick={closeDelete} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {deleteError && <Notice style={{ wordBreak: 'break-word' }}>{deleteError}</Notice>}
          <p style={{ margin: 0 }}>
            Delete <strong>{deleteTarget?.name || deleteTarget?.email}</strong>? They will no longer be able to sign in and will be
            removed from this list. This cannot be undone. Their past activity stays in the audit log.
          </p>
        </div>
      </Modal>

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
            <Input
              id="edit-staff-name"
              label="Full name"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setEditError('');
              }}
              required
            />
            <Input
              id="edit-staff-email"
              label="Work email"
              type="email"
              placeholder="name@motionz.ai"
              value={editEmail}
              onChange={(e) => {
                setEditEmail(e.target.value);
                setEditError('');
              }}
              required
              helperText="Must be an @motionz.ai address. Changing it changes the email they sign in with; their password stays the same."
            />
            <Select
              id="edit-staff-role"
              label="Role"
              value={editRole}
              disabled={editing.self}
              onChange={(e) => setEditRole(e.target.value === 'admin' ? 'admin' : 'csm')}
              helperText={editing.self ? 'You cannot change your own role. Ask another CSM Manager.' : undefined}
            >
              <option value="csm">CSM</option>
              <option value="admin">CSM Manager</option>
            </Select>
            {editRole === 'csm' && (
              <Input
                id="edit-staff-calendar"
                label="Booking calendar ID (GoHighLevel)"
                value={editCalendar}
                onChange={(e) => {
                  setEditCalendar(e.target.value);
                  setEditError('');
                }}
                helperText="GHL → Calendars → the CSM's calendar → the id in the booking link (…/widget/booking/<id>). Leave empty to use the default calendar."
              />
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
