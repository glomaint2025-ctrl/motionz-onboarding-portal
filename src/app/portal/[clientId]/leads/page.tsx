'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, StatusBadge, Input, Select, Skeleton, Button, Pagination } from '@/components/ui';
import { LeadHelpForms } from '@/components/portal/LeadHelpForms';
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
  counts: { all: number; newThisWeek: number; byStage: StageCount[] };
  ghlConnected: boolean;
}

interface StageCount {
  stage: string;
  count: number;
}

/**
 * Pipeline order: "New Lead" first, then "Day 1" to "Day 7" by number, then everything else
 * A to Z, with closing stages (won, lost and similar) last.
 */
/**
 * The leads list is a table on wide screens and stacked cards on phones and tablets, so nothing
 * is cut off or broken mid-word. Emails may wrap only after "@".
 */
const LEADS_LAYOUT_CSS = `
.leads-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
.leads-table th { padding: var(--space-2); text-align: left; color: var(--color-text-muted); font-size: var(--font-size-xs); border-bottom: 1px solid var(--color-border-subtle); }
.leads-table td { padding: var(--space-2); vertical-align: top; }
.leads-table tbody tr { border-bottom: 1px solid var(--color-border-subtle); }
.lead-name { font-weight: var(--font-weight-medium); white-space: nowrap; }
.lead-phone, .lead-followup, .lead-added { white-space: nowrap; }
.lead-label { display: none; }
@media (max-width: 1100px) {
  .leads-table thead { display: none; }
  .leads-table, .leads-table tbody { display: block; }
  .leads-table tbody tr {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-surface);
  }
  .leads-table td { display: block; padding: 0; min-width: 0; }
  .lead-name { grid-area: 1 / 1 / 2 / 3; white-space: normal; }
  .lead-stage { grid-area: 1 / 3 / 2 / 4; justify-self: end; }
  .lead-phone { grid-area: 2 / 1 / 3 / 4; }
  .lead-email { grid-area: 3 / 1 / 4 / 4; }
  .lead-source { grid-area: 4 / 1 / 5 / 2; }
  .lead-followup { grid-area: 4 / 2 / 5 / 3; }
  .lead-added { grid-area: 4 / 3 / 5 / 4; }
  .lead-label { display: block; font-size: var(--font-size-xs); color: var(--color-text-muted); }
}
`;

/** An email may wrap only after "@", never in the middle of a word (a zero-width space marks the spot). */
function breakableEmail(email: string): string {
  return email.replace(/@/g, '@​');
}

const CLOSED_STAGE = /\b(won|lost|closed|sold|dead|disqualified|unqualified|not interested|abandoned)\b/i;

function stageRank(stage: string): [number, number] {
  const name = stage.trim();
  if (/^new(\s+leads?)?$/i.test(name)) return [0, 0];
  const day = name.match(/^day\s*(\d+)/i);
  if (day) return [1, parseInt(day[1], 10)];
  if (CLOSED_STAGE.test(name)) {
    return [3, /\b(won|sold)\b/i.test(name) ? 0 : 1];
  }
  return [2, 0];
}

function sortStages(stages: StageCount[]): StageCount[] {
  return [...stages].sort((a, b) => {
    const [groupA, orderA] = stageRank(a.stage);
    const [groupB, orderB] = stageRank(b.stage);
    return groupA - groupB || orderA - orderB || a.stage.localeCompare(b.stage);
  });
}

const stageChipStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '32px',
  padding: '4px 12px',
  borderRadius: 'var(--radius-full)',
  border: `1px solid ${isActive ? 'var(--color-primary-border)' : 'var(--color-border-default)'}`,
  backgroundColor: isActive ? 'var(--color-primary-muted)' : 'var(--color-bg-surface)',
  color: isActive ? 'var(--color-primary-text)' : 'var(--color-text-primary)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-medium)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

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
  const stages = sortStages(data?.counts.byStage || []);
  const pickStage = (stage: string) => {
    setStageFilter(stage);
    setPage(1);
  };
  const isFiltered = Boolean(search) || stageFilter !== 'ALL';

  const stat = (label: string, value: React.ReactNode) => (
    <Card style={{ minWidth: 0 }}>
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

      {/* Shown only when an admin has saved a link for at least one of the two lead forms. */}
      <LeadHelpForms clientId={clientId} />

      {/* Only when there is truly nothing: a client with leads is connected, whatever the setting says. */}
      {data && !data.ghlConnected && data.counts.all === 0 && (
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
            // Two cards side by side on every screen, phones included.
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            maxWidth: '640px',
            marginBottom: 'var(--space-4)',
          }}
        >
          {stat('Total leads', data ? data.counts.all : '-')}
          {stat('New this week', data ? data.counts.newThisWeek : '-')}
        </div>
      )}

      {data && stages.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <div
            role="group"
            aria-label="Leads by stage"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginRight: 'var(--space-1)' }}>
              By stage
            </span>
            <button
              type="button"
              aria-pressed={stageFilter === 'ALL'}
              onClick={() => pickStage('ALL')}
              style={stageChipStyle(stageFilter === 'ALL')}
            >
              All <strong>{data.counts.all}</strong>
            </button>
            {stages.map(({ stage, count }) => (
              <button
                key={stage}
                type="button"
                aria-pressed={stageFilter === stage}
                onClick={() => pickStage(stageFilter === stage ? 'ALL' : stage)}
                style={stageChipStyle(stageFilter === stage)}
              >
                {stage} <strong>{count}</strong>
              </button>
            ))}
          </div>
        </Card>
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
                onChange={(e) => pickStage(e.target.value)}
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
            <div style={{ opacity: isLoading ? 0.6 : 1, transition: 'opacity var(--transition-normal)' }}>
              <style>{LEADS_LAYOUT_CSS}</style>
              <table className="leads-table">
                <thead>
                  <tr>
                    {['Name', 'Phone', 'Email', 'Source', 'Stage', 'Follow-up', 'Added'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="lead-name">{`${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unnamed lead'}</td>
                      <td className="lead-phone">{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '-'}</td>
                      <td className="lead-email">{l.email ? breakableEmail(l.email) : '-'}</td>
                      <td className="lead-source">
                        <span className="lead-label">Source</span>
                        {l.source || '-'}
                      </td>
                      <td className="lead-stage">
                        <StatusBadge status={l.status || 'New'} variant="progress" />
                      </td>
                      <td className="lead-followup">
                        <span className="lead-label">Follow-up</span>
                        {l.status && CLOSED_STAGE.test(l.status) ? (
                          <span style={{ color: 'var(--color-text-muted)' }} aria-label="No follow-up needed">-</span>
                        ) : followUpDay(l.created_at) > 7 && isEarlyStage(l.status) ? (
                          <StatusBadge status="Past day 7" variant="warning" />
                        ) : (
                          `Day ${Math.min(followUpDay(l.created_at), 99)}`
                        )}
                      </td>
                      <td className="lead-added">
                        <span className="lead-label">Added</span>
                        {formatDate(l.created_at)}
                      </td>
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
