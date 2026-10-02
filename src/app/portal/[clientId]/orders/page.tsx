'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Skeleton } from '@/components/ui';

interface OrderRecord {
  id: string;
  order_number: string;
  label: string;
  stage: 'ordered' | 'packaged' | 'shipped' | 'delivered' | 'issue';
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  batch_info?: string | null;
  issue_notes?: string | null;
  created_at: string;
  updated_at: string;
}

const STAGES = [
  { key: 'ordered', label: 'Ordered' },
  { key: 'packaged', label: 'Packaged' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

const STAGE_LABELS: Record<string, string> = {
  ordered: 'Ordered',
  packaged: 'Packaged',
  shipped: 'Shipped',
  delivered: 'Delivered',
  issue: 'Issue',
};

export default function OrdersAndShippingPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadOrders() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isMounted) setLoadError(data.error || 'Your orders could not be loaded. Please refresh the page.');
          return;
        }
        if (isMounted) setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch {
        if (isMounted) setLoadError('Could not reach the server. Please check your connection and refresh the page.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadOrders();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const activeOrders: OrderRecord[] = orders;

  /** Index on the ordered -> delivered tracker, or -1 when the order is not on it (e.g. an issue). */
  const getStageIndex = (stage: string) => STAGES.findIndex((s) => s.key === stage);

  const detail = (label: string, value: string | null | undefined, mono = false) => (
    <div>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>{label}</span>
      {value ? (
        <span
          style={{
            fontWeight: 'var(--font-weight-medium)',
            fontSize: 'var(--font-size-sm)',
            ...(mono ? { fontFamily: 'monospace' } : {}),
          }}
        >
          {value}
        </span>
      ) : (
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Not available yet</span>
      )}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Orders & Shipping</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Track physical packages, marketing materials, and product fulfillment.
        </p>
      </div>

      {/* Orders List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {isLoading ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div>
                <Skeleton width="300px" height="22px" style={{ marginBottom: '6px' }} />
                <Skeleton width="220px" height="14px" />
              </div>
              <Skeleton width="90px" height="26px" borderRadius="var(--radius-full)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', margin: 'var(--space-4) 0' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton width="100%" height="8px" borderRadius="var(--radius-full)" style={{ marginBottom: '6px' }} />
                  <Skeleton width="60px" height="12px" />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton width="70px" height="12px" style={{ marginBottom: '4px' }} />
                  <Skeleton width="130px" height="16px" />
                </div>
              ))}
            </div>
          </Card>
        ) : loadError ? (
          <Card>
            <p role="alert" style={{ color: 'var(--color-status-danger-text)', margin: 0 }}>
              {loadError}
            </p>
          </Card>
        ) : activeOrders.length === 0 ? (
          <Card>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              No orders yet. When Motionz ships something to you, you will be able to track it here.
            </p>
          </Card>
        ) : (
          activeOrders.map((order) => {
          const currentStageIdx = getStageIndex(order.stage);
          const hasIssue = order.stage === 'issue';

          return (
            <Card key={order.id}>
              <CardHeader
                title={order.label}
                subtitle={`Order #${order.order_number} | Placed on ${new Date(order.created_at).toLocaleDateString()}`}
                action={
                  <StatusBadge
                    status={(STAGE_LABELS[order.stage] || order.stage).toUpperCase()}
                    variant={order.stage === 'delivered' ? 'done' : order.stage === 'issue' ? 'danger' : 'progress'}
                  />
                }
              />

              {hasIssue && (
                <div
                  role="alert"
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-status-blocked-bg)',
                    color: 'var(--color-status-blocked-text)',
                    borderRadius: 'var(--radius-md)',
                    margin: 'var(--space-4) 0 0',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <strong>There is an issue with this order.</strong>{' '}
                  {order.issue_notes ? order.issue_notes : 'Contact your CSM for details.'}
                </div>
              )}

              {/* Progress Pipeline Stages (no stage is marked complete while an issue is open) */}
              <div style={{ margin: 'var(--space-4) 0 var(--space-6) 0', opacity: hasIssue ? 0.5 : 1 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  {STAGES.map((s, idx) => {
                    const isCompleted = currentStageIdx >= 0 && idx <= currentStageIdx;
                    const isCurrent = currentStageIdx >= 0 && idx === currentStageIdx;

                    return (
                      <div key={s.key} style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            height: '6px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: isCompleted ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                            border: isCompleted ? 'none' : '1px solid var(--color-border-subtle)',
                            marginBottom: 'var(--space-2)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: isCurrent ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                            color: isCurrent
                              ? 'var(--color-text-primary)'
                              : isCompleted
                              ? 'var(--color-status-done-text)'
                              : 'var(--color-text-muted)',
                          }}
                        >
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tracking Information Grid */}
              <div
                style={{
                  display: 'grid',
                  gap: 'var(--space-4)',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {detail('Carrier', order.carrier)}
                {detail('Tracking Number', order.tracking_number, true)}
                {order.batch_info ? detail('Batch', order.batch_info) : null}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                {order.tracking_url && (
                  <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="primary">
                      Track Package on Carrier Site
                    </Button>
                  </a>
                )}
              </div>
            </Card>
          );
        }))}
      </div>
    </div>
  );
}
