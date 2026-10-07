'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, Input, Select, Skeleton, StatusBadge } from '@/components/ui';
import { Notice } from '@/components/admin/Notice';
import {
  OUTCOME_NOTE_MAX,
  STAFF_OUTCOMES,
  decisionBadge,
  decisionLabel,
  detailLines,
  typeLabel,
} from '@/lib/lead-requests/definition';
import { formatDateTime } from '@/lib/utils/format';

interface StaffLeadRequest {
  id: string;
  type: string;
  lead_name: string;
  lead_phone: string;
  details: Record<string, any>;
  decision: string;
  decision_reason: string | null;
  status: 'open' | 'done';
  submitter_email: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name?: string | null;
}

const mutedStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' };

/**
 * Staff view of one client's Lead Replacement and Unresponsive Lead requests (Admin → client page,
 * CSM → client setup page), newest first, with "Mark done" / "Reopen" and, for replacement requests,
 * "Change outcome" (the client sees the new outcome and reason under "Your requests").
 * Loads its own data, so a problem here never blocks the rest of the page.
 */
export function LeadRequestsCard({ clientId }: { clientId: string }) {
  const [requests, setRequests] = useState<StaffLeadRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  // The request whose outcome is being changed, with what has been chosen so far.
  const [outcome, setOutcome] = useState<{ id: string; decision: string; note: string } | null>(null);

  const load = async () => {
    setState('loading');
    setActionError('');
    try {
      const res = await fetch(`/api/csm/clients/${clientId}/lead-requests`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setState('error');
        return;
      }
      setRequests(data.requests || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.requests || []).length);
      setState(data.available === false ? 'unavailable' : 'ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const setStatus = async (request: StaffLeadRequest, status: 'open' | 'done') => {
    setBusyId(request.id);
    setActionError('');
    try {
      const res = await fetch(`/api/csm/clients/${clientId}/lead-requests`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        // Reload so "done by" shows the right name.
        await load();
      } else {
        setActionError(data.error || 'The request could not be updated. Please try again.');
      }
    } catch {
      setActionError('Could not reach the server. Nothing was changed.');
    } finally {
      setBusyId(null);
    }
  };

  const saveOutcome = async () => {
    if (!outcome) return;
    setBusyId(outcome.id);
    setActionError('');
    try {
      const res = await fetch(`/api/csm/clients/${clientId}/lead-requests`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: outcome.id, decision: outcome.decision, note: outcome.note }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setOutcome(null);
        await load();
      } else {
        setActionError(data.error || 'The outcome could not be changed. Please try again.');
      }
    } catch {
      setActionError('Could not reach the server. Nothing was changed.');
    } finally {
      setBusyId(null);
    }
  };

  const open = requests.filter((r) => r.status === 'open').length;

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title="Lead requests"
        subtitle="Lead Replacement and Unresponsive Lead forms this client sent from their Leads page. Newest first."
        action={
          state === 'ready' && requests.length > 0 ? (
            <StatusBadge status={open > 0 ? `${open} open` : 'All done'} variant={open > 0 ? 'warning' : 'done'} />
          ) : undefined
        }
      />

      {actionError && <Notice style={{ marginBottom: 'var(--space-3)' }}>{actionError}</Notice>}

      {state === 'loading' ? (
        <Skeleton height="90px" />
      ) : state === 'error' ? (
        <Notice onRetry={load}>The lead requests could not be loaded.</Notice>
      ) : state === 'unavailable' ? (
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          No lead requests yet. The lead forms are not switched on in the database yet (see the handover notes).
        </p>
      ) : requests.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          This client has not sent a lead replacement or unresponsive lead request yet.
        </p>
      ) : (
        <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {requests.map((r) => {
            const isDone = r.status === 'done';
            return (
              <div
                role="listitem"
                key={r.id}
                style={{
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  opacity: isDone ? 0.75 : 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2) var(--space-3)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <div style={mutedStyle}>{typeLabel(r.type)}</div>
                    <strong>{r.lead_name}</strong>{' '}
                    <a href={`tel:${r.lead_phone}`} style={{ whiteSpace: 'nowrap' }}>
                      {r.lead_phone}
                    </a>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <StatusBadge status={decisionLabel(r.decision)} variant={decisionBadge(r.decision)} />
                    <StatusBadge status={isDone ? 'Done' : 'Open'} variant={isDone ? 'done' : 'pending'} />
                  </div>
                </div>

                {r.decision_reason && (
                  <p style={{ margin: '0 0 var(--space-2) 0', color: 'var(--color-text-secondary)' }}>{r.decision_reason}</p>
                )}

                <dl style={{ margin: '0 0 var(--space-2) 0', display: 'grid', gap: 'var(--space-1)' }}>
                  {detailLines(r.type, r.details)
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label}>
                        <dt style={{ ...mutedStyle, display: 'inline' }}>{label}: </dt>
                        <dd style={{ display: 'inline', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</dd>
                      </div>
                    ))}
                </dl>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2) var(--space-3)',
                  }}
                >
                  <span style={mutedStyle}>
                    Sent by {r.submitter_email || 'unknown'} · {formatDateTime(r.created_at)}
                    {isDone && r.resolved_at
                      ? ` · marked done${r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''} ${formatDateTime(r.resolved_at)}`
                      : ''}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {r.type === 'replacement' && outcome?.id !== r.id && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() => {
                          setActionError('');
                          setOutcome({ id: r.id, decision: STAFF_OUTCOMES.includes(r.decision as any) ? r.decision : 'needs_review', note: '' });
                        }}
                      >
                        Change outcome
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={isDone ? 'outline' : 'secondary'}
                      size="sm"
                      disabled={busyId !== null}
                      onClick={() => setStatus(r, isDone ? 'open' : 'done')}
                    >
                      {busyId === r.id && outcome?.id !== r.id ? 'Saving...' : isDone ? 'Reopen' : 'Mark done'}
                    </Button>
                  </div>
                </div>

                {outcome?.id === r.id && (
                  <div
                    style={{
                      marginTop: 'var(--space-3)',
                      paddingTop: 'var(--space-3)',
                      borderTop: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                        gap: '0 var(--space-3)',
                      }}
                    >
                      <Select
                        id={`lead-request-outcome-${r.id}`}
                        label="Outcome"
                        size="sm"
                        value={outcome.decision}
                        onChange={(e) => setOutcome({ ...outcome, decision: e.target.value })}
                        options={STAFF_OUTCOMES.map((key) => ({ value: key, label: decisionLabel(key) }))}
                      />
                      <Input
                        id={`lead-request-outcome-note-${r.id}`}
                        label="Note for the client (optional)"
                        value={outcome.note}
                        onChange={(e) => setOutcome({ ...outcome, note: e.target.value })}
                        maxLength={OUTCOME_NOTE_MAX}
                        placeholder="e.g. We spoke to the homeowner and they still want the inspection."
                        helperText="The client sees the outcome and this note under Your requests. Leave it empty to use the standard sentence."
                      />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      <Button type="button" variant="primary" size="sm" disabled={busyId !== null} onClick={saveOutcome}>
                        {busyId === r.id ? 'Saving...' : 'Save outcome'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busyId !== null} onClick={() => setOutcome(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {total > requests.length && (
            <span style={mutedStyle}>
              Showing the newest {requests.length} of {total}.
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
