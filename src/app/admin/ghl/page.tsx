'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardHeader, Skeleton, StatusBadge, buttonClasses } from '@/components/ui';
import { Notice, clientStatusLabel } from '@/components/admin/Notice';
import { formatDateTime } from '@/lib/utils/format';

interface GhlClient {
  id: string;
  name: string;
  status: string;
  ghl_location_id: string | null;
  lastLeadAt: string | null;
}

interface GhlData {
  counts: { connected: number; total: number };
  connected: GhlClient[];
  notConnected: GhlClient[];
}


function ClientRow({ client, onSaved }: { client: GhlClient; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(client.ghl_location_id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Emptying the field of a connected client disconnects it, after a second press of Save.
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const connected = Boolean(client.ghl_location_id);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed && !connected) {
      setError('Enter the Location ID from the GoHighLevel sub-account URL.');
      return;
    }
    if (!trimmed && !confirmDisconnect) {
      setConfirmDisconnect(true);
      setError(`Press Save again to disconnect ${client.name} from GoHighLevel. New leads will stop arriving in their portal.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghl_location_id: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save the Location ID.');
        return;
      }
      setEditing(false);
      setConfirmDisconnect(false);
      onSaved(
        trimmed
          ? `Location ID saved for ${client.name}.${data.locationNotice ? ` ${data.locationNotice}` : ''}`
          : `${client.name} was disconnected from GoHighLevel.`
      );
    } catch {
      setError('Could not reach the server. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  };

  const fieldId = `ghl-location-${client.id}`;

  return (
    <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{client.name}</span>
            <StatusBadge status={clientStatusLabel(client.status)} />
          </div>
          <dl style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1) var(--space-5)', margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-sm)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', minWidth: 0 }}>
              <dt style={{ color: 'var(--color-text-muted)' }}>Location ID</dt>
              <dd style={{ margin: 0, wordBreak: 'break-all', fontFamily: connected ? 'var(--font-family-mono)' : undefined, color: connected ? undefined : 'var(--color-status-warning-text)' }}>
                {client.ghl_location_id || 'Not set'}
              </dd>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <dt style={{ color: 'var(--color-text-muted)' }}>Last lead received</dt>
              <dd style={{ margin: 0 }}>{(client.lastLeadAt && formatDateTime(client.lastLeadAt)) || 'No leads yet'}</dd>
            </div>
          </dl>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!editing && (
            <Button type="button" variant={connected ? 'secondary' : 'primary'} size="sm" onClick={() => setEditing(true)}>
              {connected ? 'Change Location ID' : 'Set Location ID'}
            </Button>
          )}
          <Link href={`/admin/clients/${client.id}`} className={buttonClasses({ variant: 'outline', size: 'sm' })}>
            Open client
          </Link>
        </div>
      </div>

      {editing && (
        // Label, then input and buttons on one row, then the help text: the buttons line up with the input.
        <form onSubmit={save} className="admin-inline-edit">
          <label htmlFor={fieldId} className="ui-label">
            GoHighLevel Location ID for {client.name}
          </label>
          <input
            id={fieldId}
            className={`ui-input ${error ? 'ui-input-error' : ''}`.trim()}
            placeholder="Paste it from the sub-account’s web address"
            maxLength={64}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
              setConfirmDisconnect(false);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fieldId}-message`}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <div className="admin-inline-edit-actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError('');
                setConfirmDisconnect(false);
                setValue(client.ghl_location_id || '');
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <span className="ui-error-text admin-inline-edit-note" id={`${fieldId}-message`} role="alert">
              {error}
            </span>
          ) : (
            <span className="ui-helper-text admin-inline-edit-note" id={`${fieldId}-message`}>
              In GoHighLevel, open the client’s sub-account. The ID is the part of the web address right after /location/.{connected ? ' To disconnect this client, empty the field and save.' : ''}
            </span>
          )}
        </form>
      )}
    </div>
  );
}

function Section({ title, subtitle, clients, empty, onSaved }: { title: string; subtitle: string; clients: GhlClient[]; empty: string; onSaved: (message: string) => void }) {
  return (
    <Card style={{ marginBottom: 'var(--space-5)' }}>
      <CardHeader title={`${title} (${clients.length})`} subtitle={subtitle} />
      {clients.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} onSaved={onSaved} />
          ))}
        </div>
      )}
    </Card>
  );
}

type LeadRuleMode = 'opportunity' | 'tag';

/** Platform-wide rule: every opportunity is a lead, or only contacts carrying one GoHighLevel tag. */
function LeadRuleCard() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<LeadRuleMode>('opportunity');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/leads');
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.success) {
          const saved = typeof body.leads?.required_tag === 'string' ? body.leads.required_tag : '';
          setMode(saved ? 'tag' : 'opportunity');
          setTag(saved);
        } else {
          setMessage({ type: 'error', text: body.error || 'Could not load this setting.' });
        }
      } catch {
        setMessage({ type: 'error', text: 'Could not reach the server. Check your connection and reload the page.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (mode === 'tag' && !tag.trim()) {
      setFieldError('Type the tag name.');
      return;
    }
    setBusy(true);
    setFieldError('');
    try {
      const res = await fetch('/api/admin/settings/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, required_tag: mode === 'tag' ? tag : '' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.field === 'required_tag') setFieldError(body.error);
        else setMessage({ type: 'error', text: body.error || 'Could not save. Nothing was changed.' });
        return;
      }
      const saved = body.leads?.required_tag || '';
      setTag(saved);
      setMessage({
        type: 'success',
        text: saved
          ? `Saved. From now on a contact counts as a lead only when it has the tag "${saved}". Leads already in the portal stay.`
          : 'Saved. Every new opportunity counts as a lead.',
      });
    } catch {
      setMessage({ type: 'error', text: 'Could not reach the server. Nothing was saved.' });
    } finally {
      setBusy(false);
    }
  };

  const optionStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' };

  return (
    <Card style={{ marginBottom: 'var(--space-5)' }}>
      <CardHeader title="When does a contact count as a lead?" subtitle="Decides which GoHighLevel contacts appear on a client’s Leads page" />
      {loading ? (
        <Skeleton height="96px" />
      ) : (
        <form onSubmit={save}>
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 var(--space-3)' }}>
            <legend className="sr-only">When does a contact count as a lead?</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label style={optionStyle}>
                <input
                  type="radio"
                  name="lead-rule"
                  checked={mode === 'opportunity'}
                  onChange={() => {
                    setMode('opportunity');
                    setFieldError('');
                    setMessage(null);
                  }}
                  style={{ marginTop: 3 }}
                />
                <span>As soon as an opportunity is created (default)</span>
              </label>
              <label style={optionStyle}>
                <input
                  type="radio"
                  name="lead-rule"
                  checked={mode === 'tag'}
                  onChange={() => {
                    setMode('tag');
                    setMessage(null);
                  }}
                  style={{ marginTop: 3 }}
                />
                <span>Only when the contact has this tag</span>
              </label>
            </div>
          </fieldset>

          {mode === 'tag' && (
            <div style={{ margin: '0 0 var(--space-3)', maxWidth: 320 }}>
              <label htmlFor="lead-rule-tag" className="ui-label">
                Tag name in GoHighLevel
              </label>
              <input
                id="lead-rule-tag"
                className={`ui-input ${fieldError ? 'ui-input-error' : ''}`.trim()}
                placeholder="Qualified"
                maxLength={60}
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value);
                  setFieldError('');
                  setMessage(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? 'lead-rule-tag-error' : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              {fieldError && (
                <span className="ui-error-text" id="lead-rule-tag-error" role="alert">
                  {fieldError}
                </span>
              )}
            </div>
          )}

          <p className="ui-helper-text" style={{ margin: '0 0 var(--space-3)' }}>
            Applies to every client. Contacts tagged later appear as soon as GoHighLevel sends their next update — add the Contact Tag
            trigger to the workflow so that happens immediately (see the setup guide).
          </p>

          {message && (
            <p
              role={message.type === 'error' ? 'alert' : 'status'}
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                color: message.type === 'error' ? 'var(--color-status-danger-text)' : 'var(--color-status-done-text)',
              }}
            >
              {message.text}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function GhlConnectPage() {
  const [data, setData] = useState<GhlData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ghl');
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setData(body);
        setError('');
      } else {
        setError(body.error || 'Could not load GoHighLevel connections.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = (message: string) => {
    setNotice(message);
    load();
  };

  return (
    <div>
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">GHL Connect</span>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>GHL Connect</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          {data
            ? `${data.counts.connected} / ${data.counts.total} connected. A client counts as connected once its GoHighLevel sub-account Location ID is saved.`
            : 'Which clients have a GoHighLevel sub-account Location ID saved.'}
        </p>
      </div>

      {notice && (
        <Notice tone="success" style={{ marginBottom: 'var(--space-4)' }}>
          {notice}
        </Notice>
      )}

      <LeadRuleCard />

      {error && (
        <Notice onRetry={load} style={{ marginBottom: 'var(--space-5)' }}>
          {error}
        </Notice>
      )}

      {!data && !error ? (
        <Card>
          <Skeleton height="160px" />
        </Card>
      ) : data ? (
        <>
          <Section
            title="Not connected"
            subtitle="No Location ID saved yet"
            clients={data.notConnected}
            empty="All clients are connected."
            onSaved={onSaved}
          />
          <Section
            title="Connected"
            subtitle="Location ID saved"
            clients={data.connected}
            empty="No clients are connected yet."
            onSaved={onSaved}
          />
        </>
      ) : null}
    </div>
  );
}
