'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button, Select, Modal, TableSkeleton, Pagination } from '@/components/ui';

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

function formatDate(dateString: string): { formatted: string; relative: string } {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });

    let relative = 'Today';
    if (diffDays === 1) relative = '1 day ago';
    else if (diffDays > 1 && diffDays < 7) relative = `${diffDays} days ago`;
    else if (diffDays >= 7 && diffDays < 14) relative = '1 week ago';
    else if (diffDays >= 14 && diffDays < 30) relative = `${Math.floor(diffDays / 7)} weeks ago`;
    else if (diffDays >= 30 && diffDays < 60) relative = '1 month ago';
    else if (diffDays >= 60) relative = `${Math.floor(diffDays / 30)} months ago`;

    return { formatted, relative };
  } catch {
    return { formatted: dateString, relative: '' };
  }
}

function getInitials(name: string): string {
  if (!name || name === 'Unassigned') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getDisplayDomain(email: string, contact?: string): string {
  if (!email) return contact || '';
  const atIndex = email.indexOf('@');
  if (atIndex !== -1 && atIndex < email.length - 1) {
    return email.substring(atIndex + 1);
  }
  return email;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [csmFilter, setCsmFilter] = useState('all');

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
  const [menuCoords, setMenuCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
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
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
        includeArchived: 'true',
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (csmFilter !== 'all') params.set('csm', csmFilter);

      const res = await fetch(`/api/admin/clients?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.tenants) {
        setClients(data.tenants);
        if (data.pagination) setPaginationMeta(data.pagination);
        if (data.stats) setGlobalStats(data.stats);
        if (data.availableCsms) setAvailableCsms(data.availableCsms);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [page, pageSize, debouncedSearch, statusFilter, csmFilter]);

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
        setUnarchiveError(data.error || 'Failed to unarchive portal.');
      }
    } catch {
      setUnarchiveError('Network error while unarchiving portal.');
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
        setArchiveError(data.error || 'Failed to archive portal.');
      }
    } catch {
      setArchiveError('Network error while archiving portal.');
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
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuspendTarget(null);
        fetchClients();
      } else {
        setSuspendError(data.error || 'Failed to update client status.');
      }
    } catch {
      setSuspendError('Network error while updating status.');
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
        <span className="ui-breadcrumb-current">Client Management</span>
      </div>

      {/* 2. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Client Management
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Provision, oversee, and manage client company portals, template clones, and assigned CSMs.
          </p>
        </div>
        <Link href="/admin/clients/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#2563eb', padding: '9px 18px', fontWeight: 600, borderRadius: 'var(--radius-md)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add New Client
          </Button>
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
              <span className="ui-stat-label">Total Clients</span>
              <span className="ui-stat-value">{totalClients}</span>
              <span className="ui-stat-meta-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
                +{newThisMonth} this month
              </span>
            </div>
          </div>
        </div>

        {/* Active Clients (with Circular Gauge) */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-emerald">
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)' }}></span>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Active Clients</span>
              <span className="ui-stat-value">{activeClients}</span>
              <span className="ui-stat-meta-text">{activePercent}% of total</span>
            </div>
          </div>
          <div className="ui-stat-gauge">
            <svg viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" className="ui-stat-gauge-circle-bg" />
              <circle
                cx="22"
                cy="22"
                r="18"
                className="ui-stat-gauge-circle-val"
                strokeDasharray="113.1"
                strokeDashoffset={113.1 - (113.1 * activePercent) / 100}
              />
            </svg>
            <span className="ui-stat-gauge-text">{activePercent}%</span>
          </div>
        </div>

        {/* Pending Setup */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Pending Setup</span>
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
            <label className="ui-label">
              Search Clients
            </label>
            <div style={{ position: 'relative' }}>
              <span className="ui-filter-search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                type="text"
                className="ui-filter-search-input"
                placeholder="Search by company name, email, domain or CSM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ui-filter-col-select">
          <Select
            label="Filter by Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="banned">Banned</option>
            <option value="archived">Archived</option>
          </Select>
        </div>

        <div className="ui-filter-col-select">
          <Select
            label="Filter by CSM"
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

      {/* 5. Modern Data Table */}
      {loading ? (
        <TableSkeleton rows={6} columns={8} />
      ) : (
        <div className="ui-modern-table-card">
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="ui-modern-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>Company / Organization</th>
                  <th>Assigned CSM</th>
                  <th>Status</th>
                  <th>Setup Progress</th>
                  <th>GoHighLevel</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
                      No matching client portals found.
                    </td>
                  </tr>
                ) : (
                  displayClients.map((client, index) => {
                    const isArchived = Boolean(client.is_archived || client.deleted_at || client.status === 'cancelled');
                    const isSuspended = client.status === 'suspended';
                    const hasCsm = client.csm_name && client.csm_name !== 'Unassigned';
                    const { formatted: createdDate, relative: relativeDate } = formatDate(client.created_at);
                    const domainSubtext = getDisplayDomain(client.primary_email, client.primary_contact_name);
                    const rowNumber = (page - 1) * pageSize + index + 1;

                    return (
                      <tr key={client.id}>
                        {/* # */}
                        <td style={{ textAlign: 'center' }}>
                          <span className="ui-row-num">{rowNumber}</span>
                        </td>

                        {/* Company / Organization */}
                        <td>
                          <div className="ui-company-cell">
                            <div
                              className="ui-company-avatar"
                              style={{ background: getAvatarGradient(client.name) }}
                            >
                              {client.name.trim().charAt(0)}
                            </div>
                            <div className="ui-company-info">
                              <span className="ui-company-name">{client.name}</span>
                              <span className="ui-company-sub">{domainSubtext}</span>
                            </div>
                          </div>
                        </td>

                        {/* Assigned CSM */}
                        <td>
                          {hasCsm ? (
                            <div className="ui-csm-cell">
                              <div className="ui-csm-avatar">
                                {getInitials(client.csm_name)}
                              </div>
                              <div className="ui-csm-details">
                                <span className="ui-csm-title">Motionz CSM</span>
                                <span className="ui-csm-sub">{client.csm_name}</span>
                              </div>
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
                        <td>
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
                          ) : (
                            <span className="ui-pill-status ui-pill-status-active">
                              <span className="ui-pill-status-dot" />
                              Active
                            </span>
                          )}
                        </td>

                        {/* Setup Progress */}
                        <td>
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
                        <td>
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
                              Not Connected
                            </span>
                          )}
                        </td>

                        {/* Created */}
                        <td>
                          <div className="ui-date-cell">
                            <span className="ui-date-main">{createdDate}</span>
                            <span className="ui-date-sub">{relativeDate}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="ui-actions-cell" style={{ justifyContent: 'flex-end' }}>
                            {!isArchived ? (
                              <Link
                                href={`/portal/${client.id}`}
                                className="ui-btn-action-portal"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                Open Portal
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
                                aria-label="More options"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeMenuClientId === client.id) {
                                    setActiveMenuClientId(null);
                                    setMenuCoords(null);
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const spaceBelow = window.innerHeight - rect.bottom;
                                    const right = Math.max(8, window.innerWidth - rect.right);

                                    // If space below is limited, open upwards above the button
                                    if (spaceBelow < 185) {
                                      setMenuCoords({
                                        bottom: Math.max(8, window.innerHeight - rect.top + 4),
                                        right,
                                      });
                                    } else {
                                      setMenuCoords({
                                        top: rect.bottom + 4,
                                        right,
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
                                    right: `${menuCoords.right}px`,
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
                                    Settings
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
                                      Unarchive Portal
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
                                          setSuspendError('');
                                        }}
                                      >
                                        {isSuspended ? (
                                          <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <circle cx="12" cy="12" r="10" />
                                              <polyline points="12 8 12 12 14 14" />
                                            </svg>
                                            <span style={{ color: '#34d399' }}>Reactivate Portal</span>
                                          </>
                                        ) : (
                                          <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <circle cx="12" cy="12" r="10" />
                                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                            </svg>
                                            Suspend Portal
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
                                        Archive Portal
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
        title="Unarchive Client Portal"
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
              {isUnarchiving ? 'Unarchiving...' : 'Confirm Unarchive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {unarchiveError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {unarchiveError}
            </div>
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
            ℹ️ Unarchiving restores the client portal to <strong>Active</strong> status and allows authorized users to access their onboarding dashboard again.
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
        title="Archive Client Portal"
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
              {isArchiving ? 'Archiving...' : 'Confirm Archive'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {archiveError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {archiveError}
            </div>
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
            ⚠️ Archiving hides the client portal from active listings and blocks member logins until unarchived.
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
        title={suspendTarget?.isUnban ? 'Reactivate Client Portal' : 'Suspend Client Portal'}
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
              disabled={isSuspending}
            >
              {isSuspending
                ? 'Processing...'
                : suspendTarget?.isUnban
                ? 'Confirm Reactivation'
                : 'Confirm Suspension'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {suspendError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger, #ef4444)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {suspendError}
            </div>
          )}
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {suspendTarget?.isUnban
              ? `Are you sure you want to reactivate ${suspendTarget.client.name}? All suspended members will regain access.`
              : `Are you sure you want to suspend ${suspendTarget?.client.name}? All member logins will be disabled.`}
          </p>
        </div>
      </Modal>
    </div>
  );
}
