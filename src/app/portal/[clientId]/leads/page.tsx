'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, StatusBadge, Input, Select, Skeleton, Button, Pagination } from '@/components/ui';
import { formatDate } from '@/lib/utils/format';

interface Lead {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  created_at: string;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { all: number; newThisWeek: number; byStage: { stage: string; count: number }[] };
  connected: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_DELAY_MS = 300;

/** Follow-up day since the lead arrived (client answer 1.4: Day 1 to Day 7, then replace). */
const followUpDay = (createdAt: string) => Math.floor((Date.now() - new Date(createdAt).getTime()) / DAY_MS) + 1;
const isEarlyStage = (stage?: string) => !stage || /new|contact|no answer|follow/i.test(stage);

/**
 * Read-only view of the client's GoHighLevel leads (opportunities). Stages are changed in GHL,
 * never here (client answer 1.5); GHL workflows push every change to the portal.
 * Search, stage filter, paging and all totals come from the server, so every lead is counted.
 */
export default function LeadsPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [data, setData] = useState<LeadsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let isMounted = true;
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) query.set('search', search);
    if (stageFilter !== 'ALL') query.set('stage', stageFilter);

    setIsLoading(true);
    setLoadError('');
    fetch(`/api/portal/${clientId}/leads?${query.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (!res.ok) {
          setLoadError(
            res.status === 403 ? 'You do not have access to leads.' : 'Your leads could not be loaded.'
          );
          return;
        }
        setData(body as LeadsResponse);
        // The server falls back to the last real page when the requested one no longer exists.
        if (typeof body.page === 'number' && body.page !== page) setPage(body.page);
      })
      .catch(() => {
        if (isMounted) setLoadError('We could not reach the server. Check your connection and try again.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [clientId, page, pageSize, search, stageFilter, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const firstLoad = isLoading && !data;
  const leads = data?.leads || [];
  const stages = data?.counts.byStage || [];
  const isFiltered = Boolean(search) || stageFilter !== 'ALL';

  const stat = (label: string, value: React.ReactNode) => (
    <Card>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{label}</span>
      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', marginTop: 'var(--space-1)' }}>{value}</div>
    </Card>
  );

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Leads</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Leads from your GoHighLevel account. Follow up with new leads from Day 1 to Day 7. To change a lead&apos;s
          stage, update it in GoHighLevel and it updates here automatically.
        </p>
      </div>

      {data && !data.connected && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Your GoHighLevel account is not connected yet. Your CSM is setting it up, and leads will appear here
            once it is ready.
          </p>
        </Card>
      )}

      {loadError && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)' }}>
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </Card>
      )}

      {(data || firstLoad) && (
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginBottom: 'var(--space-6)',
          }}
        >
          {stat('Total leads', data ? data.counts.all : '-')}
          {stat('New this week', data ? data.counts.newThisWeek : '-')}
          {stages.slice(0, 2).map(({ stage, count }) => (
            <React.Fragment key={stage}>{stat(stage, count)}</React.Fragment>
          ))}
        </div>
      )}

      {(data || firstLoad) && (
        <Card>
          <CardHeader
            title="All leads"
            subtitle={
              !data
                ? undefined
                : isFiltered
                  ? `${data.total} of ${data.counts.all} match`
                  : `${data.counts.all} in total`
            }
          />

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <div style={{ flex: '1 1 220px' }}>
              <Input
                aria-label="Search leads"
                placeholder="Search name, email or phone"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                maxLength={100}
              />
            </div>
            <div style={{ flex: '0 1 220px' }}>
              <Select
                aria-label="Filter by stage"
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All stages</option>
                {stages.map(({ stage, count }) => (
                  <option key={stage} value={stage}>
                    {stage} ({count})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {firstLoad ? (
            <Skeleton height="160px" />
          ) : leads.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {data && data.counts.all === 0 ? 'No leads yet.' : 'No leads match your search.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto', opacity: isLoading ? 0.6 : 1, transition: 'opacity var(--transition-normal)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {['Name', 'Phone', 'Email', 'Source', 'Stage', 'Follow-up', 'Added'].map((h) => (
                      <th key={h} style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>
                        {`${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unnamed lead'}
                      </td>
                      <td style={{ padding: 'var(--space-2)' }}>
                        {l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '-'}
                      </td>
                      <td style={{ padding: 'var(--space-2)', wordBreak: 'break-all' }}>{l.email || '-'}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{l.source || '-'}</td>
                      <td style={{ padding: 'var(--space-2)' }}>
                        <StatusBadge status={l.status || 'New'} variant="progress" />
                      </td>
                      <td style={{ padding: 'var(--space-2)', whiteSpace: 'nowrap' }}>
                        {followUpDay(l.created_at) > 7 && isEarlyStage(l.status) ? (
                          <StatusBadge status="Past day 7" variant="warning" />
                        ) : (
                          `Day ${Math.min(followUpDay(l.created_at), 99)}`
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-2)', whiteSpace: 'nowrap' }}>{formatDate(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <Pagination
              currentPage={data.page}
              totalPages={data.totalPages}
              totalItems={data.total}
              pageSize={pageSize}
              pageSizeOptions={[25, 50, 100]}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              disabled={isLoading}
            />
          )}
        </Card>
      )}
    </div>
  );
}
