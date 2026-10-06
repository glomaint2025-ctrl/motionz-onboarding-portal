'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Skeleton, StatusBadge } from '@/components/ui';
import { decisionBadge, decisionLabel, typeLabel } from '@/lib/lead-requests/definition';
import { formatDate } from '@/lib/utils/format';

interface RequestRow {
  id: string;
  type: string;
  lead_name: string;
  lead_phone: string;
  decision: string;
  decision_reason: string | null;
  created_at: string;
}

const PAGE = 20;

const rowStyle: React.CSSProperties = {
  padding: 'var(--space-3) 0',
  borderTop: '1px solid var(--color-border-subtle)',
  fontSize: 'var(--font-size-sm)',
};

/**
 * "Your requests" on the Leads page: the client's own Lead Replacement and Unresponsive Lead
 * requests, newest first, 20 at a time. Renders nothing when the forms are not set up yet.
 */
export function LeadRequestList({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = async (offset: number): Promise<boolean> => {
    const res = await fetch(`/api/portal/${clientId}/lead-requests?limit=${PAGE}&offset=${offset}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return false;
    if (body.available === false) {
      setState('hidden');
      return true;
    }
    const incoming: RequestRow[] = body.requests || [];
    setRows((current) => {
      if (offset === 0) return incoming;
      // A request sent in another tab shifts the list by one: never show the same row twice.
      const seen = new Set(current.map((r) => r.id));
      return [...current, ...incoming.filter((r) => !seen.has(r.id))];
    });
    setTotal(typeof body.total === 'number' ? body.total : incoming.length);
    setState('ready');
    return true;
  };

  useEffect(() => {
    let isMounted = true;
    setState('loading');
    load(0)
      .then((ok) => {
        if (isMounted && !ok) setState('error');
      })
      .catch(() => {
        if (isMounted) setState('error');
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, attempt]);

  const showMore = async () => {
    setIsLoadingMore(true);
    try {
      await load(rows.length);
    } catch {
      // The rows already shown stay; the button can be pressed again.
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (state === 'hidden') return null;

  return (
    <Card style={{ marginTop: 'var(--space-6)' }}>
      <CardHeader
        title="Your requests"
        subtitle={
          state === 'ready' && total > 0
            ? `${total} lead replacement and unresponsive lead request${total === 1 ? '' : 's'}, newest first`
            : 'Lead replacement and unresponsive lead requests you have sent.'
        }
      />
      {state === 'loading' ? (
        <Skeleton height="80px" />
      ) : state === 'error' ? (
        <>
          <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)' }}>
            Your requests could not be loaded.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          You have not sent any requests yet. Use the buttons at the top of this page when a lead needs replacing or has
          gone quiet.
        </p>
      ) : (
        <>
          <div role="list">
            {rows.map((r) => (
              <div role="listitem" key={r.id} style={rowStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 'var(--space-1) var(--space-3)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{r.lead_name}</strong>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {' '}
                      · {typeLabel(r.type)} · {formatDate(r.created_at)}
                    </span>
                  </span>
                  <StatusBadge status={decisionLabel(r.decision)} variant={decisionBadge(r.decision)} />
                </div>
                {r.decision_reason && (
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{r.decision_reason}</p>
                )}
              </div>
            ))}
          </div>
          {rows.length < total && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button variant="secondary" size="sm" onClick={showMore} disabled={isLoadingMore}>
                {isLoadingMore ? 'Loading...' : `Show more (${total - rows.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
