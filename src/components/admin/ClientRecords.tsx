'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Select, StatusBadge } from '@/components/ui';

interface ContractRow {
  id: string;
  title: string;
  document_url?: string;
  signed_at?: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  label: string;
  stage: string;
  carrier?: string;
  tracking_url?: string;
}

const STAGES = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'packaged', label: 'Packaged' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'issue', label: 'Issue' },
];

/** Admin panel to attach signed contracts and track physical orders for one client. */
export const ClientRecords: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [contractTitle, setContractTitle] = useState('');
  const [contractUrl, setContractUrl] = useState('');
  const [contractSigned, setContractSigned] = useState('');

  const [orderLabel, setOrderLabel] = useState('');
  const [orderCarrier, setOrderCarrier] = useState('');
  const [orderTrackingUrl, setOrderTrackingUrl] = useState('');

  const api = `/api/admin/clients/${clientId}/records`;

  const load = async () => {
    const res = await fetch(api);
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setContracts(data.contracts || []);
      setOrders(data.orders || []);
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
        setError(data.error || 'Could not save.');
        return false;
      }
      await load();
      return true;
    } catch {
      setError('Network error.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addContract = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const addOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await send('POST', { kind: 'order', label: orderLabel, carrier: orderCarrier, tracking_url: orderTrackingUrl });
    if (ok) {
      setOrderLabel('');
      setOrderCarrier('');
      setOrderTrackingUrl('');
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
      <CardHeader title="Contract & orders" subtitle="What the client sees on their Signed Contract and Orders pages." />

      {error && (
        <p style={{ color: 'var(--color-status-danger-text)', fontSize: 'var(--font-size-sm)', marginTop: 0 }}>{error}</p>
      )}

      <h3 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-2)' }}>Signed contract</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {contracts.length === 0 && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>No contract attached yet.</span>
        )}
        {contracts.map((c) => (
          <div key={c.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{c.title}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {c.signed_at ? `Signed ${new Date(c.signed_at).toLocaleDateString()}` : 'Not signed yet'}
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
            <Button variant="outline" size="sm" disabled={busy} onClick={() => send('DELETE', undefined, `?kind=contract&recordId=${c.id}`)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <form onSubmit={addContract} style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end', marginBottom: 'var(--space-6)' }}>
        <Input label="Title" value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} placeholder="Service Agreement" required />
        <Input label="Document link (https)" value={contractUrl} onChange={(e) => setContractUrl(e.target.value)} placeholder="https://..." />
        <Input label="Signed on" type="date" value={contractSigned} onChange={(e) => setContractSigned(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={busy}>
          Attach contract
        </Button>
      </form>

      <h3 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-2)' }}>Orders</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {orders.length === 0 && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>No orders yet.</span>
        )}
        {orders.map((o) => (
          <div key={o.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{o.label}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {o.order_number}
                {o.carrier ? ` · ${o.carrier}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <StatusBadge status={STAGES.find((s) => s.value === o.stage)?.label || o.stage} variant={o.stage === 'issue' ? 'danger' : o.stage === 'delivered' ? 'done' : 'progress'} />
              <Select value={o.stage} onChange={(e) => send('PATCH', { kind: 'order', id: o.id, stage: e.target.value })} size="sm">
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => send('DELETE', undefined, `?kind=order&recordId=${o.id}`)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={addOrder} style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
        <Input label="What was ordered" value={orderLabel} onChange={(e) => setOrderLabel(e.target.value)} placeholder="Yard signs and door hangers" required />
        <Input label="Carrier" value={orderCarrier} onChange={(e) => setOrderCarrier(e.target.value)} placeholder="UPS" />
        <Input label="Tracking link (https)" value={orderTrackingUrl} onChange={(e) => setOrderTrackingUrl(e.target.value)} placeholder="https://..." />
        <Button type="submit" variant="secondary" disabled={busy}>
          Add order
        </Button>
      </form>
    </Card>
  );
};
