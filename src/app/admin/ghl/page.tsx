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
