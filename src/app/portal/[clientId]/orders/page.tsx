'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Skeleton } from '@/components/ui';

interface OrderRecord {
  id: string;
  order_number: string;
  label: string;
  stage: 'ordered' | 'packaged' | 'shipped' | 'delivered' | 'issue';
  carrier: string;
  tracking_number: string;
  tracking_url?: string;
  batch_info?: string;
  created_at: string;
  updated_at: string;
}

const STAGES = [
  { key: 'ordered', label: 'Ordered' },
  { key: 'packaged', label: 'Packaged' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export default function OrdersAndShippingPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadOrders() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.orders && data.orders.length > 0) {
            setOrders(data.orders);
          }
        }
      } catch {
        // Fallback remains active
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

  const getStageIndex = (stage: string) => {
    const idx = STAGES.findIndex((s) => s.key === stage);
    return idx >= 0 ? idx : 0;
  };

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
        ) : activeOrders.length === 0 ? (
          <Card>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              No orders yet. When Motionz ships something to you, you will be able to track it here.
            </p>
          </Card>
        ) : (
          activeOrders.map((order) => {
          const currentStageIdx = getStageIndex(order.stage);

          return (
            <Card key={order.id}>
              <CardHeader
                title={order.label}
                subtitle={`Order #${order.order_number} | Placed on ${new Date(order.created_at).toLocaleDateString()}`}
                action={
                  <StatusBadge
                    status={order.stage.toUpperCase()}
                    variant={order.stage === 'delivered' ? 'done' : order.stage === 'issue' ? 'danger' : 'progress'}
                  />
                }
              />

              {/* Progress Pipeline Stages */}
              <div style={{ margin: 'var(--space-4) 0 var(--space-6) 0' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  {STAGES.map((s, idx) => {
                    const isCompleted = idx <= currentStageIdx;
                    const isCurrent = idx === currentStageIdx;

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
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                    Fulfillment Carrier
                  </span>
                  <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
                    {order.carrier}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                    Tracking Number
                  </span>
                  <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', fontFamily: 'monospace' }}>
                    {order.tracking_number}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                    Logistics Origin
                  </span>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    {order.batch_info || 'Motionz Central Depot'}
                  </span>
                </div>

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
