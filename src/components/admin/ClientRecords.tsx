'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import { Notice } from '@/components/admin/Notice';

/** Today as YYYY-MM-DD in the viewer's own timezone, for the date picker's upper limit. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface ContractRow {
  id: string;
  title: string;
  document_url?: string;
  signed_at?: string;
}

/** Admin panel to attach signed contracts for one client. */
export const ClientRecords: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<ContractRow | null>(null);

  const [contractTitle, setContractTitle] = useState('');
  const [contractUrl, setContractUrl] = useState('');
  const [contractSigned, setContractSigned] = useState('');

  const api = `/api/admin/clients/${clientId}/records`;

  const load = async () => {
    setLoadError('');
    try {
      const res = await fetch(api);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setContracts(data.contracts || []);
      } else {
        setLoadError(data.error || 'Could not load this client’s contracts.');
      }
    } catch {
      setLoadError('Could not reach the server, so contracts could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const send = async (method: string, body?: any, query = '') => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(api + query, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setError(data.error || 'That did not save. Please try again.');
        return false;
      }
      await load();
      return true;
    } catch {
      setError('Could not reach the server. Nothing was changed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addContract = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (contractSigned && contractSigned > todayIso()) {
      setError('The signed date cannot be in the future.');
      return;
    }
    const ok = await send('POST', {
      kind: 'contract',
      title: contractTitle,
      document_url: contractUrl,
      signed_at: contractSigned || undefined,
    });
    if (ok) {
      setContractTitle('');
      setContractUrl('');
      setContractSigned('');
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    padding: 'var(--space-3)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
  };

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader title="Contract" subtitle="What the client sees on their Contract page." />

      {error && <Notice style={{ marginBottom: 'var(--space-3)' }}>{error}</Notice>}
      {loadError && (
        <Notice onRetry={load} style={{ marginBottom: 'var(--space-3)' }}>
          {loadError}
        </Notice>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {loading && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Loading contracts...</span>}
        {!loading && !loadError && contracts.length === 0 && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>No contract attached yet.</span>
        )}
        {contracts.map((c) => (
          <div key={c.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{c.title}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {c.signed_at ? `Signed ${formatDate(c.signed_at)}` : 'Not signed yet'}
                {c.document_url && (
                  <>
                    {' · '}
                    <a href={c.document_url} target="_blank" rel="noopener noreferrer">
                      Open
                    </a>
                  </>
                )}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRemoveTarget(c)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <form onSubmit={addContract} style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
        <Input label="Title" value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} placeholder="Service Agreement" maxLength={200} required />
        <Input label="Document link" type="url" value={contractUrl} onChange={(e) => setContractUrl(e.target.value)} placeholder="https://..." maxLength={2000} />
        <Input label="Signed on" type="date" max={todayIso()} value={contractSigned} onChange={(e) => setContractSigned(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? 'Saving...' : 'Attach contract'}
        </Button>
      </form>

      <Modal
        isOpen={Boolean(removeTarget)}
        onClose={() => {
          if (!busy) setRemoveTarget(null);
        }}
        title="Remove contract"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!removeTarget) return;
                await send('DELETE', undefined, `?kind=contract&recordId=${encodeURIComponent(removeTarget.id)}`);
                setRemoveTarget(null);
              }}
            >
              {busy ? 'Removing...' : 'Remove contract'}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
          Remove <strong>{removeTarget?.title}</strong>? The client will no longer see it on their Contract page.
        </p>
      </Modal>
    </Card>
  );
};
