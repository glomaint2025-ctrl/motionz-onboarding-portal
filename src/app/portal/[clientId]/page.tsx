'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input, Skeleton } from '@/components/ui';
import { PORTAL_LINKS } from '@/lib/portal-links';

interface SetupStep {
  name: string;
  step_key: string;
  status: 'not_started' | 'in_progress' | 'done';
  owner: 'we_handle' | 'client_action';
  what_it_is: string;
  right_now: string;
  unlocks: string;
}

export default function ClientOverviewPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [nextCall, setNextCall] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [csm, setCsm] = useState<{ name?: string; email: string } | null>(null);
  // 'signed' only when a contract row carries a signed_at timestamp; 'sent' when a contract exists but is unsigned.
  const [contractState, setContractState] = useState<'signed' | 'sent' | 'none'>('none');
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});

  // Website change request state
  const [changeTitle, setChangeTitle] = useState('');
  const [changeDesc, setChangeDesc] = useState('');
  const [changeUrl, setChangeUrl] = useState('');
  const [isSubmittingChange, setIsSubmittingChange] = useState(false);
  const [changeNotice, setChangeNotice] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.suspended) {
            window.location.href = `/auth/suspended?reason=${encodeURIComponent(data.reason || 'Your account access has been suspended.')}`;
            return;
          }
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (isMounted) setLoadError(data.error || 'Your portal data could not be loaded. Please refresh the page.');
        } else {
          const data = await res.json();
          if (isMounted) {
            if (data.tenant?.name) setCompanyName(data.tenant.name);
            if (data.setupSteps) setSteps(data.setupSteps);
            if (data.leads) setLeadCount(data.leads.length);
            // Appointments are calls between the client and their CSM (client answer 2.1).
            const now = Date.now();
            const upcoming = (data.appointments || [])
              .filter((a: any) => new Date(a.appointment_time).getTime() > now && !/cancel/i.test(a.status || ''))
              .sort((a: any, b: any) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime());
            setNextCall(upcoming[0]?.appointment_time || null);
            const sheet = (data.integrations || []).find((i: any) => i.integration_type === 'google_sheets' && i.is_active);
            setSheetUrl(sheet?.config_data?.sheet_url || null);
            setCsm(data.csm || null);
            const contracts: any[] = Array.isArray(data.contracts) ? data.contracts : [];
            setContractState(contracts.some((c) => Boolean(c.signed_at)) ? 'signed' : contracts.length > 0 ? 'sent' : 'none');
            setViewerRole(data.viewer?.role || null);
            if (data.featureToggles) setFeatureToggles(data.featureToggles);
          }
        }
      } catch {
        if (isMounted) setLoadError('Could not reach the server. Please check your connection and refresh the page.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const activeSteps = steps;

  const totalSteps = activeSteps.length;
  const completedSteps = activeSteps.filter((s) => s.status === 'done').length;
  const setupPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Identify the first incomplete step as the active focus step
  const currentStep = activeSteps.find((s) => s.status !== 'done') || activeSteps[activeSteps.length - 1];

  const handleWebsiteChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeTitle.trim() || !changeDesc.trim()) return;

    setIsSubmittingChange(true);
    setChangeNotice(null);
    try {
      const res = await fetch(`/api/portal/${clientId}/website-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: changeTitle,
          description: changeDesc,
          targetPageUrl: changeUrl,
          isUrgent: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setChangeNotice({ text: data.message || 'Your request was recorded.', isError: false });
        setChangeTitle('');
        setChangeDesc('');
        setChangeUrl('');
      } else {
        setChangeNotice({ text: data.error || 'Your request could not be submitted. Please try again.', isError: true });
      }
    } catch {
      setChangeNotice({ text: 'Could not reach the server. Your request was not submitted.', isError: true });
    } finally {
      setIsSubmittingChange(false);
    }
  };

  if (loading) {
    return <ClientOverviewSkeleton />;
  }

  if (loadError) {
    return (
      <div>
        <h1 style={{ marginBottom: 'var(--space-4)' }}>Overview</h1>
        <Card>
          <p role="alert" style={{ margin: 0, color: 'var(--color-status-danger-text)' }}>
            {loadError}
          </p>
        </Card>
      </div>
    );
  }

  // Contract details are only shown to roles allowed to see them (the API hides them from team members).
  const showContractCard = featureToggles?.contracts !== false && viewerRole !== 'client_member';

  return (
    <div>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <span>Portal</span>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Overview</span>
      </div>

      {/* 2. Welcome Banner */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
          Overview
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
          {companyName ? (
            <>
              Welcome back to the <strong style={{ color: 'var(--color-text-primary)' }}>{companyName}</strong> onboarding dashboard.
            </>
          ) : (
            'Welcome back to your onboarding dashboard.'
          )}
        </p>
      </div>

      {/* 3. Progress & Next Step Grid */}
      {(!featureToggles || featureToggles.onboarding !== false) && (
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            marginBottom: 'var(--space-6)',
          }}
        >
          {/* Setup Progress Card */}
          <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  Setup Progress
                </h2>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                  Overall onboarding completion
                </p>
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
                    strokeDashoffset={113.1 - (113.1 * setupPercentage) / 100}
                  />
                </svg>
                <span className="ui-stat-gauge-text">{setupPercentage}%</span>
              </div>
            </div>

            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#0b121c',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
                marginBottom: 'var(--space-3)',
              }}
            >
              <div
                style={{
                  width: `${setupPercentage}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb, #38bdf8)',
                  boxShadow: '0 0 8px rgba(56, 189, 248, 0.5)',
                  transition: 'width var(--transition-normal)',
                }}
              />
            </div>

            <p style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
              {totalSteps === 0 ? (
                'Your onboarding checklist has not been set up yet.'
              ) : (
                <>
                  {completedSteps} of {totalSteps} onboarding milestones completed.
                  {currentStep && currentStep.status !== 'done' && (
                    <>
                      {' '}Current milestone: <strong style={{ color: '#38bdf8' }}>{currentStep.name}</strong>.
                    </>
                  )}
                </>
              )}
            </p>

            <Link href={`/portal/${clientId}/onboarding`} style={{ width: '100%', textDecoration: 'none' }}>
              <button type="button" className="ui-btn-action-portal" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}>
                View Setup Checklist
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </Link>
          </div>

          {/* Current Active Step Card */}
          <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  Current Action Step
                </h2>
                <p style={{ fontSize: 'var(--font-size-xs)', color: '#38bdf8', margin: '2px 0 0 0', fontWeight: 500 }}>
                  {currentStep?.name || 'No steps yet'}
                </p>
              </div>
              {currentStep && (
                <span className={`ui-pill-status ${currentStep.status === 'done' ? 'ui-pill-status-active' : 'ui-pill-status-onboarding'}`}>
                  <span className="ui-pill-status-dot" />
                  {currentStep.status === 'done' ? 'Done' : currentStep.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                </span>
              )}
            </div>

            <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.4 }}>
              {currentStep?.what_it_is || 'Your Motionz team will add your onboarding steps here.'}
            </p>

            {currentStep?.right_now && (
            <div
              style={{
                width: '100%',
                padding: '12px 14px',
                backgroundColor: '#0b121c',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <strong style={{ color: 'var(--color-text-primary)' }}>Right Now:</strong> {currentStep.right_now}
            </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', flexWrap: 'wrap' }}>
              <Link href={`/portal/${clientId}/onboarding`} style={{ flex: 1, minWidth: '130px', textDecoration: 'none' }}>
                <Button variant="primary" fullWidth style={{ backgroundColor: '#2563eb' }}>
                  Review Step Details
                </Button>
              </Link>
              {(!featureToggles || featureToggles.book_call !== false) && (
                <Link href={`/portal/${clientId}/book-call`} style={{ textDecoration: 'none' }}>
                  <button type="button" className="ui-filter-clear-btn" style={{ height: '38px', padding: '0 14px' }}>
                    Book CSM Call
                  </button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. At a glance Summary Cards */}
      {(featureToggles?.leads !== false || featureToggles?.tracking !== false || showContractCard) && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>
            At a glance
          </h2>
          <div className="ui-stats-grid">
            {/* Total Leads */}
            {featureToggles?.leads !== false && (
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
                    <span className="ui-stat-label">Total Leads</span>
                    <span className="ui-stat-value">{leadCount}</span>
                    <Link href={`/portal/${clientId}/leads`} style={{ fontSize: '0.72rem', color: '#38bdf8', textDecoration: 'none' }}>
                      View Pipeline →
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Next CSM call */}
            {featureToggles?.book_call !== false && (
              <div className="ui-stat-card">
                <div className="ui-stat-card-body">
                  <div className="ui-stat-icon-wrapper ui-stat-icon-emerald">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="ui-stat-info">
                    <span className="ui-stat-label">Next CSM Call</span>
                    <span className="ui-stat-value" style={{ fontSize: nextCall ? '1rem' : undefined }}>
                      {nextCall
                        ? new Date(nextCall).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : 'Not booked'}
                    </span>
                    <Link href={`/portal/${clientId}/book-call`} style={{ fontSize: '0.72rem', color: '#34d399', textDecoration: 'none' }}>
                      {nextCall ? 'Book another call →' : 'Book a call →'}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Tracking Sheet */}
            {featureToggles?.tracking !== false && (
              <div className="ui-stat-card">
                <div className="ui-stat-card-body">
                  <div className="ui-stat-icon-wrapper ui-stat-icon-amber">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div className="ui-stat-info">
                    <span className="ui-stat-label">Tracking Sheet</span>
                    <span className="ui-stat-value">{sheetUrl ? 'Ready' : 'Not ready yet'}</span>
                    {sheetUrl ? (
                      <a href={sheetUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: '#fbbf24', textDecoration: 'none' }}>
                        Open my tracking sheet →
                      </a>
                    ) : (
                      <span className="ui-stat-meta-text">The link will appear here once your sheet is connected</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Signed Contract */}
            {showContractCard && (
              <div className="ui-stat-card">
                <div className="ui-stat-card-body">
                  <div className="ui-stat-icon-wrapper ui-stat-icon-slate">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div className="ui-stat-info">
                    <span className="ui-stat-label">Signed Contract</span>
                    <span className="ui-stat-value" style={{ color: contractState === 'signed' ? '#34d399' : '#fbbf24' }}>
                      {contractState === 'signed' ? 'Signed' : contractState === 'sent' ? 'Awaiting signature' : 'Not available yet'}
                    </span>
                    <Link href={`/portal/${clientId}/contract`} style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                      View Agreement →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Split Section: Onboarding Milestones & Website Change Widget */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: (!featureToggles || featureToggles.onboarding !== false) ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Onboarding Roadmap Overview */}
        {(!featureToggles || featureToggles.onboarding !== false) && (
          <Card>
            <CardHeader
              title="Onboarding Milestones"
              subtitle="Core operational setup progress"
              action={
                <Link href={`/portal/${clientId}/onboarding`}>
                  <Button variant="secondary" size="sm">
                    Full Roadmap
                  </Button>
                </Link>
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {activeSteps.map((step) => (
                <div
                  key={step.step_key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
                      {step.name}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      Owner: {step.owner === 'we_handle' ? 'WE HANDLE' : 'YOUR ACTION'}
                    </span>
                  </div>
                  <StatusBadge
                    status={step.status === 'done' ? 'Done' : step.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                    variant={step.status === 'done' ? 'done' : step.status === 'in_progress' ? 'progress' : 'pending'}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Website Change Request Widget */}
        <Card>
          <CardHeader
            title="Website Change Request"
            subtitle="Submit copy or image revisions to your CSM"
          />
          {changeNotice && (
            <div
              role={changeNotice.isError ? 'alert' : 'status'}
              style={{
                padding: 'var(--space-3)',
                backgroundColor: changeNotice.isError ? 'var(--color-status-blocked-bg)' : 'var(--color-status-done-bg)',
                color: changeNotice.isError ? 'var(--color-status-blocked-text)' : 'var(--color-status-done-text)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {changeNotice.text}
            </div>
          )}
          <form onSubmit={handleWebsiteChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Input
              label="Request Title"
              placeholder="e.g. Update phone number on header"
              value={changeTitle}
              onChange={(e) => setChangeTitle(e.target.value)}
              maxLength={200}
              required
            />
            <Input
              label="Page URL (optional)"
              type="url"
              placeholder="e.g. https://yourcompany.com/about"
              helperText="Mention the section (for example, the homepage banner) in the description."
              value={changeUrl}
              onChange={(e) => setChangeUrl(e.target.value)}
            />
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Description of Change
              </label>
              <textarea
                rows={3}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                  fontFamily: 'inherit',
                }}
                placeholder="Explain the changes you would like us to make..."
                value={changeDesc}
                onChange={(e) => setChangeDesc(e.target.value)}
                maxLength={5000}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmittingChange || !changeTitle.trim() || !changeDesc.trim()}
            >
              {isSubmittingChange ? 'Submitting...' : 'Submit Change Request'}
            </Button>
          </form>
        </Card>
      </div>

      {/* Account Support Card */}
      <Card>
        <CardHeader
          title="Motionz Account Team"
          subtitle="Your CSM and the Motionz community"
          action={
            (!featureToggles || featureToggles.book_call !== false) ? (
              <Link href={`/portal/${clientId}/book-call`}>
                <Button variant="secondary" size="sm">
                  Book CSM Call
                </Button>
              </Link>
            ) : undefined
          }
        />
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
              Your CSM
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {csm ? (
                <>
                  {csm.name ? `${csm.name} · ` : ''}
                  <a href={`mailto:${csm.email}`}>{csm.email}</a>
                </>
              ) : (
                'Not assigned yet'
              )}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
              Community
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
              <a href={PORTAL_LINKS.slackInvite} target="_blank" rel="noopener noreferrer">Join Slack</a>
              <a href={PORTAL_LINKS.skoolCommunity} target="_blank" rel="noopener noreferrer">Join Skool</a>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ClientOverviewSkeleton() {
  return (
    <div>
      {/* Welcome Banner Skeleton */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Skeleton width="180px" height="32px" style={{ marginBottom: 'var(--space-2)' }} />
        <Skeleton width="360px" height="18px" />
      </div>

      {/* Progress & Next Step Grid */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <div>
              <Skeleton width="130px" height="20px" style={{ marginBottom: '6px' }} />
              <Skeleton width="190px" height="14px" />
            </div>
            <Skeleton width="52px" height="24px" borderRadius="var(--radius-full)" />
          </div>
          <Skeleton width="100%" height="8px" borderRadius="var(--radius-full)" style={{ marginBottom: 'var(--space-4)' }} />
          <Skeleton width="85%" height="16px" style={{ marginBottom: 'var(--space-4)' }} />
          <Skeleton width="100%" height="38px" borderRadius="var(--radius-md)" />
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <div>
              <Skeleton width="140px" height="20px" style={{ marginBottom: '6px' }} />
              <Skeleton width="160px" height="14px" />
            </div>
            <Skeleton width="80px" height="24px" borderRadius="var(--radius-full)" />
          </div>
          <Skeleton width="90%" height="16px" style={{ marginBottom: 'var(--space-2)' }} />
          <Skeleton width="70%" height="14px" style={{ marginBottom: 'var(--space-4)' }} />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Skeleton width="120px" height="38px" borderRadius="var(--radius-md)" />
            <Skeleton width="130px" height="38px" borderRadius="var(--radius-md)" />
          </div>
        </Card>
      </div>

      {/* At a glance Cards Skeleton */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Skeleton width="170px" height="22px" style={{ marginBottom: 'var(--space-3)' }} />
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <Skeleton width="80px" height="12px" style={{ marginBottom: 'var(--space-2)' }} />
              <Skeleton width="60px" height="32px" style={{ margin: 'var(--space-1) 0' }} />
              <Skeleton width="100px" height="12px" />
            </Card>
          ))}
        </div>
      </div>

      {/* Onboarding Roadmap Skeleton */}
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div>
              <Skeleton width="160px" height="20px" style={{ marginBottom: '6px' }} />
              <Skeleton width="220px" height="14px" />
            </div>
            <Skeleton width="100px" height="32px" borderRadius="var(--radius-md)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <Skeleton width="140px" height="18px" />
                  <Skeleton width="75px" height="20px" borderRadius="var(--radius-full)" />
                </div>
                <Skeleton width="75%" height="14px" />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Skeleton width="180px" height="20px" style={{ marginBottom: '6px' }} />
          <Skeleton width="240px" height="14px" style={{ marginBottom: 'var(--space-4)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
            <Skeleton width="100%" height="80px" borderRadius="var(--radius-md)" />
            <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
            <Skeleton width="140px" height="38px" borderRadius="var(--radius-md)" style={{ alignSelf: 'flex-end' }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
