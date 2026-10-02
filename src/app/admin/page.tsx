'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, StatusBadge, Skeleton } from '@/components/ui';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeClients: 0,
    totalProvisioned: 0,
    ghlNotConnected: 0,
    stuckInSetup: 0,
    securityAlerts: 0,
  });

  useEffect(() => {
    fetch('/api/admin/clients?includeArchived=true')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.tenants) {
          const tenants: any[] = data.tenants;
          const active = tenants.filter((t) => !t.deleted_at && t.status !== 'cancelled');
          const notConnected = active.filter((t) => !t.ghl_location_id);
          const stuck = active.filter((t) => t.progress_percent < 100);
          setStats({
            activeClients: active.length,
            totalProvisioned: tenants.length,
            ghlNotConnected: notConnected.length,
            stuckInSetup: stuck.length,
            securityAlerts: 0,
          });
        }
      })
      .catch((err) => console.error('Failed to load telemetry:', err))
      .finally(() => setLoading(false));
  }, []);

  const activePercent = stats.totalProvisioned > 0 ? Math.round((stats.activeClients / stats.totalProvisioned) * 100) : 0;

  return (
    <div>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Admin Command Center</span>
      </div>

      {/* 2. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            Admin Command Center
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Global multi-tenant platform telemetry, client lifecycle, and security oversight.
          </p>
        </div>
        <Link href="/admin/clients/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#2563eb', padding: '9px 18px', fontWeight: 600, borderRadius: 'var(--radius-md)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Client
          </Button>
        </Link>
      </div>

      {/* 3. 4 KPI Metric Cards */}
      <div className="ui-stats-grid">
        {/* Active Clients */}
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
              <span className="ui-stat-label">Active Clients</span>
              {loading ? (
                <div style={{ margin: '4px 0' }}><Skeleton width="60px" height="28px" /></div>
              ) : (
                <span className="ui-stat-value">{stats.activeClients}</span>
              )}
              <span className="ui-stat-meta-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
                {stats.totalProvisioned} Total Provisioned
              </span>
            </div>
          </div>
          {!loading && (
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
          )}
        </div>

        {/* In Onboarding Setup */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-emerald">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10" />
                <line x1="18" y1="20" x2="18" y2="4" />
                <line x1="6" y1="20" x2="6" y2="16" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">In Onboarding Setup</span>
              {loading ? (
                <div style={{ margin: '4px 0' }}><Skeleton width="40px" height="28px" /></div>
              ) : (
                <span className="ui-stat-value">{stats.stuckInSetup}</span>
              )}
              <span className="ui-stat-meta-text">Portals progressing</span>
            </div>
          </div>
        </div>

        {/* GHL Not Connected */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">GHL Not Connected</span>
              {loading ? (
                <div style={{ margin: '4px 0' }}><Skeleton width="40px" height="28px" /></div>
              ) : (
                <span className="ui-stat-value" style={{ color: stats.ghlNotConnected > 0 ? '#fbbf24' : 'inherit' }}>
                  {stats.ghlNotConnected}
                </span>
              )}
              <span className="ui-stat-meta-text">
                {stats.ghlNotConnected > 0 ? 'Requires integration setup' : 'All accounts linked'}
              </span>
            </div>
          </div>
        </div>

        {/* Security Alerts */}
        <div className="ui-stat-card">
          <div className="ui-stat-card-body">
            <div className="ui-stat-icon-wrapper ui-stat-icon-slate">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="ui-stat-info">
              <span className="ui-stat-label">Security Alerts</span>
              {loading ? (
                <div style={{ margin: '4px 0' }}><Skeleton width="40px" height="28px" /></div>
              ) : (
                <span className="ui-stat-value">{stats.securityAlerts}</span>
              )}
              <span className="ui-stat-meta-text" style={{ color: '#34d399' }}>All systems normal</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Quick Navigation Cards */}
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Client Management
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Provision and manage client portals
              </p>
            </div>
            {loading ? (
              <Skeleton width="70px" height="22px" borderRadius="9999px" />
            ) : (
              <span className="ui-pill-status ui-pill-status-active">
                <span className="ui-pill-status-dot" />
                {stats.activeClients} Active
              </span>
            )}
          </div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
            Add new client organizations, assign CSMs, toggle feature modules, duplicate templates, and manage invitations.
          </p>
          <Link href="/admin/clients" style={{ width: '100%', textDecoration: 'none' }}>
            <button type="button" className="ui-btn-action-portal" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 'var(--font-size-sm)' }}>
              View Client Directory
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </Link>
        </div>

        <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Master Portal Templates
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Template governance & milestone blueprints
              </p>
            </div>
            <span className="ui-pill-status ui-pill-status-onboarding">
              <span className="ui-pill-status-dot" />
              v1.0 Baseline
            </span>
          </div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
            Manage the default 5 setup steps, base video script templates, and default feature toggles inherited by new client portals.
          </p>
          <Link href="/admin/templates" style={{ width: '100%', textDecoration: 'none' }}>
            <button type="button" className="ui-btn-action-portal" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 'var(--font-size-sm)' }}>
              Manage Templates
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
