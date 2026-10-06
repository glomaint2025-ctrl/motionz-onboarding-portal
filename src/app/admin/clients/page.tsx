'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button, Input, Select, Modal, TableSkeleton, Pagination, buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand';
import { Notice, clientStatusLabel } from '@/components/admin/Notice';
import { formatDate } from '@/lib/utils/format';

interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  primary_email: string;
  primary_contact_name?: string;
  status: string;
  csm_name: string;
  csm_email?: string | null;
  progress_percent: number;
  ghl_location_id?: string;
  created_at: string;
  deleted_at?: string;
  is_archived?: boolean;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4f46e5, #6366f1)', // Indigo
  'linear-gradient(135deg, #059669, #10b981)', // Emerald
  'linear-gradient(135deg, #d97706, #f59e0b)', // Amber
  'linear-gradient(135deg, #7c3aed, #8b5cf6)', // Purple
  'linear-gradient(135deg, #e11d48, #f43f5e)', // Rose
  'linear-gradient(135deg, #0284c7, #38bdf8)', // Blue/Sky
  'linear-gradient(135deg, #0d9488, #14b8a6)', // Teal
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getInitials(name: string): string {
  if (!name || name === 'Unassigned') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [csmFilter, setCsmFilter] = useState('all');
  // "Still in setup" arrives from the dashboard tile as ?setup=in_progress (also accepts ?status=).
  const [setupFilter, setSetupFilter] = useState<'all' | 'in_progress'>('all');
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('setup') === 'in_progress') setSetupFilter('in_progress');
    const status = query.get('status');
    if (status && ['active', 'onboarding', 'suspended', 'archived'].includes(status)) setStatusFilter(status);
    setUrlReady(true);
  }, []);

  // Server-side pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationMeta, setPaginationMeta] = useState<any>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Global telemetry stats (computed on server across all records)
  const [globalStats, setGlobalStats] = useState({
    totalClients: 0,
    activeClients: 0,
    pendingSetup: 0,
    archivedClients: 0,
    newThisMonth: 0,
  });
  const [availableCsms, setAvailableCsms] = useState<string[]>([]);

  // Action menu dropdown state
  const [activeMenuClientId, setActiveMenuClientId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Modals state
  const [unarchiveTarget, setUnarchiveTarget] = useState<ClientRecord | null>(null);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [unarchiveError, setUnarchiveError] = useState('');

  const [archiveTarget, setArchiveTarget] = useState<ClientRecord | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  const [suspendTarget, setSuspendTarget] = useState<{ client: ClientRecord; isUnban: boolean } | null>(null);
  const [isSuspending, setIsSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState('');
  const [suspendReason, setSuspendReason] = useState('');

  // Debounce search input to avoid excessive server queries
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
        includeArchived: 'true',
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (csmFilter !== 'all') params.set('csm', csmFilter);
      if (setupFilter !== 'all') params.set('setup', setupFilter);

      const res = await fetch(`/api/admin/clients?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.tenants) {
        setClients(data.tenants);
        if (data.pagination) setPaginationMeta(data.pagination);
        if (data.stats) setGlobalStats((prev) => ({ ...prev, ...data.stats }));
        if (data.availableCsms) setAvailableCsms(data.availableCsms);
      } else {
        setLoadError(data.error || 'Could not load the client list.');
      }
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait until the filters in the page address have been read, so the list is loaded once.
    if (urlReady) fetchClients();
  }, [urlReady, page, pageSize, debouncedSearch, statusFilter, csmFilter, setupFilter]);

  // Close context menu on outside click, scroll, or resize
  useEffect(() => {
    const handleClose = (e: MouseEvent | Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuClientId(null);
        setMenuCoords(null);
      }
    };
    if (activeMenuClientId) {
      document.addEventListener('mousedown', handleClose);
      window.addEventListener('scroll', handleClose, true);
      window.addEventListener('resize', handleClose);
    }
    return () => {
      document.removeEventListener('mousedown', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [activeMenuClientId]);

  // Modal actions
  const handleConfirmUnarchive = async () => {
    if (!unarchiveTarget) return;
    setIsUnarchiving(true);
    setUnarchiveError('');

    try {
      const res = await fetch(`/api/admin/clients/${unarchiveTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive' }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUnarchiveTarget(null);
        fetchClients();
      } else {
        setUnarchiveError(data.error || 'Could not unarchive this client. Please try again.');
      }
    } catch {
      setUnarchiveError('Could not reach the server. The client is still archived.');
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    setArchiveError('');

    try {
      const res = await fetch(`/api/admin/clients/${archiveTarget.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setArchiveTarget(null);
        fetchClients();
      } else {
        setArchiveError(data.error || 'Could not archive this client. Please try again.');
      }
    } catch {
      setArchiveError('Could not reach the server. The client was not archived.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!suspendTarget) return;
    setIsSuspending(true);
    setSuspendError('');

    const action = suspendTarget.isUnban ? 'unsuspend_client' : 'suspend_client';

    try {
      const res = await fetch(`/api/admin/clients/${suspendTarget.client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suspendTarget.isUnban ? { action } : { action, reason: suspendReason.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuspendTarget(null);
        fetchClients();
      } else {
        setSuspendError(data.error || 'That did not work. Please try again.');
      }
    } catch {
      setSuspendError('Could not reach the server. Nothing was changed.');
    } finally {
      setIsSuspending(false);
    }
  };

  // KPI Calculations (from server-side global statistics)
  const totalClients = globalStats.totalClients;
  const activeClients = globalStats.activeClients;
  const activePercent = totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0;
  const pendingSetup = globalStats.pendingSetup;
  const pendingPercent = totalClients > 0 ? Math.round((pendingSetup / totalClients) * 100) : 0;
  const archivedClients = globalStats.archivedClients;
  const archivedPercent = totalClients > 0 ? Math.round((archivedClients / totalClients) * 100) : 0;
  const newThisMonth = globalStats.newThisMonth;

  // Filtered CSM List (from server or fallback to current tenants)
  const uniqueCsms = availableCsms.length > 0
    ? availableCsms
    : Array.from(
        new Set(
          clients
            .map((c) => c.csm_name)
            .filter((name) => name && name !== 'Unassigned')
        )
      );

  const displayClients = clients;

  return (
    <div>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Clients</span>
      </div>

      {/* 2. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Clients
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Every client company, who looks after it, and how far along its setup is.
          </p>
        </div>
        <Link href="/admin/clients/new" className={buttonClasses({ variant: 'primary' })} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add client
        </Link>
      </div>

      {/* 3. 4 KPI Metric Cards */}
      <div className="ui-stats-grid">
        {/* Total Clients */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Total clients</span>
              <span className="ui-stat-value">{totalClients}</span>
              <span className="ui-stat-meta-text">
                {newThisMonth === 0 ? 'None added this month' : `${newThisMonth} added this month`}
              </span>
            </div>
          </div>
        </div>

        {/* Active Clients */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-emerald">
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-status-done-solid)', display: 'inline-block' }}></span>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Active</span>
              <span className="ui-stat-value">{activeClients}</span>
              <span className="ui-stat-meta-text">{activePercent}% of total</span>
            </div>
          </div>
        </div>

        {/* Onboarding (status = onboarding, never overlaps Active) */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Onboarding</span>
              <span className="ui-stat-value">{pendingSetup}</span>
              <span className="ui-stat-meta-text">{pendingPercent}% of total</span>
            </div>
          </div>
        </div>

        {/* Archived */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-slate">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Archived</span>
              <span className="ui-stat-value">{archivedClients}</span>
              <span className="ui-stat-meta-text">{archivedPercent}% of total</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Filter Toolbar */}
      <div className="ui-filter-toolbar">
        <div className="ui-filter-col-search">
          <div className="ui-filter-search-box">
            <label className="ui-label" htmlFor="admin-client-search">
              Search clients
            </label>
            <div style={{ position: 'relative' }}>
              <span className="ui-filter-search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                id="admin-client-search"
                type="search"
                maxLength={120}
                className="ui-filter-search-input"
                placeholder="Company, contact, email or CSM"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ui-filter-col-select">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </Select>
        </div>

        <div className="ui-filter-col-select">
          <Select
            label="CSM"
            value={csmFilter}
            onChange={(e) => {
              setCsmFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All CSMs</option>
            {uniqueCsms.map((csm) => (
              <option key={csm} value={csm}>{csm}</option>
            ))}
          </Select>
        </div>

        <div className="ui-filter-col-btn">
          <button
            type="button"
            className="ui-filter-clear-btn"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setCsmFilter('all');
              setSetupFilter('all');
              setPage(1);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Clear Filters
          </button>
        </div>
      </div>

      {setupFilter === 'in_progress' && (
        <Notice tone="info" style={{ marginBottom: 'var(--space-4)' }}>
          <span style={{ display: 'inline-flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            Showing only clients that are still in setup.
            <button
              type="button"
              className="ui-btn-action-portal"
              onClick={() => {
                setSetupFilter('all');
                setPage(1);
              }}
            >
              Show all clients
            </button>
          </span>
        </Notice>
      )}

      {/* 5. Modern Data Table */}
      {loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : loadError ? (
        <Notice onRetry={fetchClients}>{loadError}</Notice>
      ) : (
        <div className="ui-modern-table-card">
          <div style={{ width: '100%', overflowX: 'auto' }}>
            {/* Six columns that fit a 1024px screen; on phones each row becomes a stacked card (staff-tables.css). */}
            <table className="ui-modern-table ui-clients-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>CSM</th>
                  <th>Status</th>
                  <th>Setup progress</th>
                  <th>GoHighLevel</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', justifyContent: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
                      {totalClients === 0
                        ? 'No clients yet. Use "Add client" to create the first one.'
                        : 'No clients match your search or filters.'}
                    </td>
                  </tr>
                ) : (
                  displayClients.map((client) => {
                    const isArchived = Boolean(client.is_archived || client.deleted_at || client.status === 'cancelled');
                    const isSuspended = client.status === 'suspended';
                    const hasCsm = client.csm_name && client.csm_name !== 'Unassigned';
                    const createdDate = formatDate(client.created_at);

                    return (
                      <tr key={client.id}>
                        {/* Company, with the main contact's email and the date added underneath */}
                        <td className="ui-cell-title" data-label="Company">
                          <div className="ui-company-cell">
                            <div
                              className="ui-company-avatar"
                              style={{ background: getAvatarGradient(client.name) }}
                            >
                              {client.name.trim().charAt(0)}
                            </div>
                            <div className="ui-company-info">
                              <span className="ui-company-name">{client.name}</span>
                              <span className="ui-company-sub" title={client.primary_email || undefined}>{client.primary_email || client.primary_contact_name || 'No email'}</span>
                              {createdDate && <span className="ui-company-date">Added {createdDate}</span>}
                            </div>
                          </div>
                        </td>

                        {/* Assigned CSM: the person's name, once */}
                        <td data-label="CSM">
                          {hasCsm ? (
                            <div className="ui-csm-cell" title={client.csm_email || undefined}>
                              <div className="ui-csm-avatar" aria-hidden="true">
                                {getInitials(client.csm_name)}
                              </div>
                              <span className="ui-csm-name">{client.csm_name}</span>
                            </div>
                          ) : (
                            <div className="ui-csm-cell">
                              <div className="ui-csm-unassigned-icon">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                              </div>
                              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                Unassigned
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td data-label="Status">
                          {isArchived ? (
                            <span className="ui-pill-status ui-pill-status-archived">
                              <span className="ui-pill-status-dot" />
                              Archived
                            </span>
                          ) : isSuspended ? (
                            <span className="ui-pill-status ui-pill-status-suspended">
                              <span className="ui-pill-status-dot" />
                              Suspended
                            </span>
                          ) : client.status === 'onboarding' ? (
                            <span className="ui-pill-status ui-pill-status-onboarding">
                              <span className="ui-pill-status-dot" />
                              Onboarding
                            </span>
                          ) : client.status === 'active' ? (
                            <span className="ui-pill-status ui-pill-status-active">
                              <span className="ui-pill-status-dot" />
                              Active
                            </span>
                          ) : (
                            <span className="ui-pill-status ui-pill-status-archived">
                              <span className="ui-pill-status-dot" />
                              {clientStatusLabel(client.status)}
                            </span>
                          )}
                        </td>

                        {/* Setup Progress */}
                        <td data-label="Setup progress">
                          <div className="ui-progress-pill-wrapper">
                            <div className="ui-progress-pill-track">
                              <div
                                className="ui-progress-pill-fill"
                                style={{ width: `${client.progress_percent}%` }}
                              />
                            </div>
                            <span className="ui-progress-pill-label">
                              {client.progress_percent}%
                            </span>
                          </div>
                        </td>

                        {/* GoHighLevel */}
                        <td data-label="GoHighLevel">
                          {client.ghl_location_id ? (
                            <span className="ui-ghl-pill ui-ghl-pill-connected">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Connected
                            </span>
                          ) : (
                            <span className="ui-ghl-pill ui-ghl-pill-unconnected">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              Not connected
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="ui-cell-actions" data-label="Actions">
                          <div className="ui-actions-cell">
                            {!isArchived ? (
                              <Link
                                href={`/portal/${client.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ui-btn-action-portal ui-btn-icon-compact"
                                title={`Open the portal for ${client.name} in a new tab`}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                <span className="ui-action-label">Open portal</span>
                                <span className="sr-only">(opens in a new tab)</span>
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="ui-btn-action-portal"
                                onClick={() => {
                                  setUnarchiveTarget(client);
                                  setUnarchiveError('');
                                }}
                              >
                                Unarchive
                              </button>
                            )}

                            {/* Three dots context menu */}
                            <div style={{ position: 'relative' }}>
                              <button
                                type="button"
                                className="ui-btn-action-menu"
                                aria-label={`More options for ${client.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeMenuClientId === client.id) {
                                    setActiveMenuClientId(null);
                                    setMenuCoords(null);
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const spaceBelow = window.innerHeight - rect.bottom;
                                    // Line the menu up with the button's right edge, unless that would push it off the
                                    // left of the screen (phone cards put the button on the left); then open rightwards.
                                    const MENU_WIDTH = 200;
                                    const side =
                                      rect.right - MENU_WIDTH < 8
                                        ? { left: Math.max(8, rect.left) }
                                        : { right: Math.max(8, window.innerWidth - rect.right) };

                                    // If space below is limited, open upwards above the button
                                    if (spaceBelow < 185) {
                                      setMenuCoords({
                                        bottom: Math.max(8, window.innerHeight - rect.top + 4),
                                        ...side,
                                      });
                                    } else {
                                      setMenuCoords({
                                        top: rect.bottom + 4,
                                        ...side,
                                      });
                                    }
                                    setActiveMenuClientId(client.id);
                                  }
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="5" cy="12" r="2" />
                                  <circle cx="12" cy="12" r="2" />
                                  <circle cx="19" cy="12" r="2" />
                                </svg>
                              </button>

                              {activeMenuClientId === client.id && menuCoords && (
                                <div
                                  className="ui-action-dropdown"
                                  ref={menuRef}
                                  style={{
                                    position: 'fixed',
                                    top: menuCoords.top !== undefined ? `${menuCoords.top}px` : 'auto',
                                    bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : 'auto',
                                    left: menuCoords.left !== undefined ? `${menuCoords.left}px` : 'auto',
                                    right: menuCoords.right !== undefined ? `${menuCoords.right}px` : 'auto',
                                    zIndex: 99999,
                                  }}
                                >
                                  <Link
                                    href={`/admin/clients/${client.id}`}
                                    className="ui-action-dropdown-item"
                                    onClick={() => {
                                      setActiveMenuClientId(null);
                                      setMenuCoords(null);
                                    }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="3" />
                                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                    </svg>
                                    Manage client
                                  </Link>

                                  <div className="ui-action-dropdown-divider" />

                                  {isArchived ? (
                                    <button
                                      type="button"
                                      className="ui-action-dropdown-item"
                                      onClick={() => {
                                        setActiveMenuClientId(null);
                                        setMenuCoords(null);
                                        setUnarchiveTarget(client);
                                        setUnarchiveError('');
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="21 8 21 21 3 21 3 8" />
                                        <rect x="1" y="3" width="22" height="5" />
                                        <line x1="10" y1="12" x2="14" y2="12" />
                                      </svg>
                                      Unarchive
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className={`ui-action-dropdown-item ${isSuspended ? '' : 'ui-action-dropdown-item-danger'}`}
                                        onClick={() => {
                                          setActiveMenuClientId(null);
                                          setMenuCoords(null);
                                          setSuspendTarget({ client, isUnban: isSuspended });
                                          setSuspendReason('');
                                          setSuspendError('');
                                        }}
                                      >
                                        {isSuspended ? (
                                          <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-done-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <circle cx="12" cy="12" r="10" />
                                              <polyline points="12 8 12 12 14 14" />
                                            </svg>
                                            <span style={{ color: 'var(--color-status-done-text)' }}>Reactivate</span>
                                          </>
                                        ) : (
                                          <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <circle cx="12" cy="12" r="10" />
                                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                            </svg>
                                            Suspend
                                          </>
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        className="ui-action-dropdown-item ui-action-dropdown-item-danger"
                                        onClick={() => {
                                          setActiveMenuClientId(null);
                                          setMenuCoords(null);
                                          setArchiveTarget(client);
                                          setArchiveError('');
                                        }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="21 8 21 21 3 21 3 8" />
                                          <rect x="1" y="3" width="22" height="5" />
                                          <line x1="10" y1="12" x2="14" y2="12" />
                                        </svg>
                                        Archive
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={paginationMeta.page}
            totalPages={paginationMeta.totalPages}
            totalItems={paginationMeta.total}
            pageSize={paginationMeta.pageSize}
            onPageChange={(newPage) => setPage(newPage)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        </div>
      )}

      {/* 6. Modals */}

      {/* Unarchive Client Portal Modal */}
      <Modal
        isOpen={Boolean(unarchiveTarget)}
        onClose={() => {
          if (!isUnarchiving) {
            setUnarchiveTarget(null);
            setUnarchiveError('');
          }
        }}
        title="Unarchive client"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => {
                setUnarchiveTarget(null);
                setUnarchiveError('');
              }}
              disabled={isUnarchiving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmUnarchive}
              disabled={isUnarchiving}
            >
              {isUnarchiving ? 'Unarchiving...' : 'Unarchive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unarchiveError && (
            <Notice>{unarchiveError}</Notice>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Are you sure you want to unarchive <strong>{unarchiveTarget?.name}</strong>?
          </p>
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              lineHeight: 1.5,
            }}
          >
            Unarchiving sets the client back to <strong>Active</strong> and lets their team sign in to the portal again.
          </div>
        </div>
      </Modal>

      {/* Archive Client Portal Modal */}
      <Modal
        isOpen={Boolean(archiveTarget)}
        onClose={() => {
          if (!isArchiving) {
            setArchiveTarget(null);
            setArchiveError('');
          }
        }}
        title="Archive client"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveTarget(null);
                setArchiveError('');
              }}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmArchive}
              disabled={isArchiving}
            >
              {isArchiving ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {archiveError && (
            <Notice>{archiveError}</Notice>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Are you sure you want to archive <strong>{archiveTarget?.name}</strong>?
          </p>
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              lineHeight: 1.5,
            }}
          >
            <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <Icon name="alert" size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Archiving stops the client’s team from signing in until you unarchive. Nothing is deleted.</span>
            </span>
          </div>
        </div>
      </Modal>

      {/* Suspend / Reactivate Client Portal Modal */}
      <Modal
        isOpen={Boolean(suspendTarget)}
        onClose={() => {
          if (!isSuspending) {
            setSuspendTarget(null);
            setSuspendError('');
          }
        }}
        title={suspendTarget?.isUnban ? 'Reactivate client' : 'Suspend client'}
        dismissOnOverlay={false}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="outline"
              onClick={() => {
                setSuspendTarget(null);
                setSuspendError('');
              }}
              disabled={isSuspending}
            >
              Cancel
            </Button>
            <Button
              variant={suspendTarget?.isUnban ? 'primary' : 'danger'}
              onClick={handleConfirmSuspend}
              disabled={isSuspending || (!suspendTarget?.isUnban && !suspendReason.trim())}
            >
              {isSuspending
                ? 'Working...'
                : suspendTarget?.isUnban
                ? 'Reactivate'
                : 'Suspend'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {suspendError && (
            <Notice>{suspendError}</Notice>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {suspendTarget?.isUnban
              ? `Reactivate ${suspendTarget.client.name}? Everyone who was locked out by the suspension can sign in again.`
              : `Suspend ${suspendTarget?.client.name}? Nobody on their team will be able to sign in until you reactivate them.`}
          </p>
          {suspendTarget && !suspendTarget.isUnban && (
            <Input
              label="Reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Subscription paused"
              helperText="The client sees this reason when they try to sign in."
              maxLength={300}
              required
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
