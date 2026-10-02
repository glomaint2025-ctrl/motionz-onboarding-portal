'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Select, TableSkeleton, Pagination } from '@/components/ui';

interface AssignedClient {
  id: string;
  name: string;
  primary_email: string;
  primary_contact_name?: string;
  status: string;
  progress_percent: number;
  total_steps: number;
  completed_steps: number;
  ghl_location_id?: string;
  created_at?: string;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4f46e5, #6366f1)',
  'linear-gradient(135deg, #059669, #10b981)',
  'linear-gradient(135deg, #d97706, #f59e0b)',
  'linear-gradient(135deg, #7c3aed, #8b5cf6)',
  'linear-gradient(135deg, #e11d48, #f43f5e)',
  'linear-gradient(135deg, #0284c7, #38bdf8)',
  'linear-gradient(135deg, #0d9488, #14b8a6)',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getDisplayDomain(email: string, contact?: string): string {
  if (!email) return contact || '';
  const atIndex = email.indexOf('@');
  if (atIndex !== -1 && atIndex < email.length - 1) {
    return email.substring(atIndex + 1);
  }
  return email;
}

export default function CSMClientsPage() {
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const [globalStats, setGlobalStats] = useState({
    totalClients: 0,
    activeClients: 0,
    pendingSetup: 0,
    archivedClients: 0,
    newThisMonth: 0,
  });

  // Debounce search input
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
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await fetch(`/api/csm/clients?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.tenants) {
        setClients(data.tenants);
        if (data.pagination) setPaginationMeta(data.pagination);
        if (data.stats) setGlobalStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [page, pageSize, debouncedSearch, statusFilter]);

  const totalClients = globalStats.totalClients || clients.length;
  const completedClients = clients.filter((c) => c.progress_percent === 100).length;
  const inProgressClients = globalStats.pendingSetup || clients.filter((c) => c.progress_percent < 100).length;
  const avgProgress = clients.length > 0
    ? Math.round(clients.reduce((acc, c) => acc + (c.progress_percent || 0), 0) / clients.length)
    : 0;

  const displayClients = clients;

  return (
    <div>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <Link href="/csm">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Assigned Clients</span>
      </div>

      {/* 2. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Assigned Client Portals
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Review active client onboarding setups, inspect milestone statuses, and update operational progress.
          </p>
        </div>
      </div>

      {/* 3. 4 KPI Metric Cards */}
      <div className="ui-stats-grid">
        {/* Total Assigned */}
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
              <span className="ui-stat-label">Assigned Clients</span>
              <span className="ui-stat-value">{totalClients}</span>
              <span className="ui-stat-meta-text">Active portfolios</span>
            </div>
          </div>
        </div>

        {/* Avg Setup Progress */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-emerald">
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)' }}></span>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Avg Setup Progress</span>
              <span className="ui-stat-value">{avgProgress}%</span>
              <span className="ui-stat-meta-text">Portfolio average</span>
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
                strokeDashoffset={113.1 - (113.1 * avgProgress) / 100}
              />
            </svg>
            <span className="ui-stat-gauge-text">{avgProgress}%</span>
          </div>
        </div>

        {/* In Progress */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Active Onboarding</span>
              <span className="ui-stat-value">{inProgressClients}</span>
              <span className="ui-stat-meta-text">Awaiting completion</span>
            </div>
          </div>
        </div>

        {/* Completed Setup */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-slate">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Fully Launched</span>
              <span className="ui-stat-value">{completedClients}</span>
              <span className="ui-stat-meta-text" style={{ color: '#34d399' }}>100% complete</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Filter Toolbar */}
      <div className="ui-filter-toolbar">
        <div className="ui-filter-col-search">
          <div className="ui-filter-search-box">
            <label className="ui-label">Search Assigned Clients</label>
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
                placeholder="Search by company name, email or contact..."
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
            <option value="completed">Completed</option>
          </Select>
        </div>

        <div className="ui-filter-col-btn">
          <button
            type="button"
            className="ui-filter-clear-btn"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
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
        <TableSkeleton rows={5} columns={5} />
      ) : (
        <div className="ui-modern-table-card">
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="ui-modern-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>Client Company</th>
                  <th>Status</th>
                  <th>Setup Progress</th>
                  <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayClients.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
                      No matching assigned client portals found.
                    </td>
                  </tr>
                ) : (
                  displayClients.map((client, index) => {
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

                        {/* Status */}
                        <td>
                          {client.status === 'active' ? (
                            <span className="ui-pill-status ui-pill-status-active">
                              <span className="ui-pill-status-dot" />
                              Active
                            </span>
                          ) : client.status === 'suspended' ? (
                            <span className="ui-pill-status ui-pill-status-suspended">
                              <span className="ui-pill-status-dot" />
                              Suspended
                            </span>
                          ) : (
                            <span className="ui-pill-status ui-pill-status-onboarding">
                              <span className="ui-pill-status-dot" />
                              {client.status}
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
                              {client.completed_steps || 0}/{client.total_steps || 5} ({client.progress_percent}%)
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="ui-actions-cell" style={{ justifyContent: 'flex-end' }}>
                            <Link href={`/csm/clients/${client.id}/setup`} style={{ textDecoration: 'none' }}>
                              <Button variant="primary" size="sm" style={{ backgroundColor: '#2563eb', padding: '6px 14px' }}>
                                Manage Setup
                              </Button>
                            </Link>
                            <Link
                              href={`/portal/${client.id}`}
                              className="ui-btn-action-portal"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                              Client View
                            </Link>
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
    </div>
  );
}
