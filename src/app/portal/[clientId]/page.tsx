'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, Input, Skeleton } from '@/components/ui';
import { buttonClasses } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils/format';
import { nextUpcomingCall } from '@/lib/utils/appointments';
import { suspendedPageUrl } from '@/components/portal/suspended';

interface SetupStep {
  name: string;
  step_key: string;
  status: 'not_started' | 'in_progress' | 'done';
  owner: 'we_handle' | 'client_action';
  what_it_is: string;
  right_now: string;
  unlocks: string;
}

// Mirrors the server-side rules in src/lib/storage (the server re-validates every file).
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // total across all files (hosting limit)
const ATTACHMENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf'];
const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf';
const WEBSITE_REQUEST_INTRO =
  'Want different colors, new wording, an updated photo or phone number? Describe it below \u2014 use \u{1F4CE} to attach your logo or a photo \u2014 and it goes straight to our website team, who update your live site, usually the same day.';

function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Circular "N% SET UP" progress ring. Colours come from theme tokens only. */
function SetupProgressRing({ percentage, completed, total }: { percentage: number; completed: number; total: number }) {
  return (
    <div
      role="img"
      aria-label={`Setup ${percentage}% complete: ${completed} of ${total} steps done`}
      style={{ position: 'relative', width: '132px', height: '132px', flexShrink: 0 }}
    >
      <svg width="132" height="132" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="var(--color-border-default)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - percentage / 100)}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset var(--transition-normal, 0.3s ease)' }}
        />
      </svg>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1.1,
        }}
      >
        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          {percentage}%
        </span>
        <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          SET UP
        </span>
      </div>
    </div>
  );
}

export default function ClientOverviewPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [nextCall, setNextCall] = useState<string | null>(null);
  const [sheetReady, setSheetReady] = useState(false);
  const [csm, setCsm] = useState<{ name?: string; email: string } | null>(null);
  // 'signed' only when a contract row carries a signed_at timestamp; 'sent' when a contract exists but is unsigned.
  const [contractState, setContractState] = useState<'signed' | 'sent' | 'none'>('none');
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});

  // Website change request state
  const [changeTitle, setChangeTitle] = useState('');
  const [changeDesc, setChangeDesc] = useState('');
  const [changeUrl, setChangeUrl] = useState('');
  const [isSubmittingChange, setIsSubmittingChange] = useState(false);
  const [changeNotice, setChangeNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [changeFiles, setChangeFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const changeNoticeRef = useRef<HTMLDivElement>(null);

  // The result appears right above the send button; bring it into view and announce it.
  useEffect(() => {
    if (!changeNotice) return;
    changeNoticeRef.current?.scrollIntoView({ block: 'nearest' });
    changeNoticeRef.current?.focus({ preventScroll: true });
  }, [changeNotice]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.suspended) {
            window.location.href = suspendedPageUrl(data);
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
            // Staff previewing the portal see the greeting the client's main contact sees.
            const isStaffViewer = data.viewer?.role === 'admin' || data.viewer?.role === 'csm';
            const name = isStaffViewer ? data.tenant?.primary_contact_name : data.viewer?.full_name;
            setViewerName(typeof name === 'string' ? name : '');
            if (data.setupSteps) setSteps(data.setupSteps);
            // The real total from the server, not the length of a capped list.
            setLeadCount(typeof data.leadCount === 'number' ? data.leadCount : 0);
            // Appointments are calls between the client and their CSM (client answer 2.1).
            setNextCall(nextUpcomingCall(data.appointments));
            const sheet = (data.integrations || []).find((i: any) => i.integration_type === 'google_sheets' && i.is_active);
            setSheetReady(Boolean(sheet?.config_data?.sheet_url || sheet?.config_data?.spreadsheet_id));
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
      const form = new FormData();
      form.append('title', changeTitle);
      form.append('description', changeDesc);
      form.append('targetPageUrl', changeUrl);
      changeFiles.forEach((file) => form.append('files', file, file.name));
      // No Content-Type header: the browser sets the multipart boundary itself.
      const res = await fetch(`/api/portal/${clientId}/website-update`, { method: 'POST', body: form });

      if (res.status === 413) {
        setChangeNotice({
          text: 'Those files are too large to send together, so your request was not sent. Remove a file or attach smaller ones and try again.',
          isError: true,
        });
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setChangeNotice({ text: data.message || 'Your request was recorded.', isError: false });
        setChangeTitle('');
        setChangeDesc('');
        setChangeUrl('');
        setChangeFiles([]);
        setFileError('');
      } else {
        setChangeNotice({ text: data.error || 'Your request could not be submitted. Please try again.', isError: true });
      }
    } catch {
      setChangeNotice({ text: 'Could not reach the server. Your request was not submitted.', isError: true });
    } finally {
      setIsSubmittingChange(false);
    }
  };

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // allow picking the same file again after removing it
    const problems: string[] = [];
    const next = [...changeFiles];
    for (const file of picked) {
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
        problems.push(`"${file.name}" is not an image or PDF.`);
      } else if (next.reduce((sum, f) => sum + f.size, 0) + file.size > MAX_ATTACHMENT_BYTES) {
        problems.push(`"${file.name}" was not added: attachments can be 4 MB in total.`);
      } else if (file.size === 0) {
        problems.push(`"${file.name}" is empty.`);
      } else if (next.some((f) => f.name === file.name && f.size === file.size)) {
        // already attached
      } else if (next.length >= MAX_ATTACHMENTS) {
        problems.push(`You can attach up to ${MAX_ATTACHMENTS} files; "${file.name}" was not added.`);
      } else {
        next.push(file);
      }
    }
    setChangeFiles(next);
    setFileError(problems.join(' '));
  };

  const removeFile = (index: number) => {
    setChangeFiles((files) => files.filter((_, i) => i !== index));
    setFileError('');
  };

  if (loading) {
    return <ClientOverviewSkeleton />;
  }

  if (loadError) {
    return (
      <div>
        <h1 style={{ marginBottom: 'var(--space-4)' }}>Welcome.</h1>
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

  const onboardingEnabled = !featureToggles || featureToggles.onboarding !== false;
  // Hero: the signed-in person's own first name (the main contact's for staff), else the company name.
  const greetingName = viewerName.trim().split(/\s+/)[0] || companyName.trim();
  const showProgress = onboardingEnabled && totalSteps > 0;
  const pendingIndex = activeSteps.findIndex((s) => s.status !== 'done');
  const phaseLabel = !showProgress
    ? null
    : pendingIndex === -1
      ? 'SETUP COMPLETE'
      : `STEP ${pendingIndex + 1} OF ${totalSteps} \u00B7 ${activeSteps[pendingIndex].name.toUpperCase()}`;

  return (
    <div>
      {/* 1. Hero: current phase, welcome and setup progress ring */}
      <section
        aria-label="Welcome"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-6)',
          padding: 'clamp(20px, 4vw, 36px)',
          marginBottom: 'var(--space-6)',
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg, var(--radius-md))',
        }}
      >
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {phaseLabel && (
            <span
              style={{
                display: 'inline-block',
                maxWidth: '100%',
                padding: '5px 12px',
                marginBottom: 'var(--space-4)',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-muted)',
                border: '1px solid var(--color-primary-border)',
                color: 'var(--color-primary-text)',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                lineHeight: 1.4,
                overflowWrap: 'anywhere',
              }}
            >
              {phaseLabel}
            </span>
          )}
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              margin: '0 0 var(--space-3) 0',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
            }}
          >
            {greetingName ? `Welcome, ${greetingName}.` : 'Welcome.'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', lineHeight: 1.55, margin: 0, maxWidth: '60ch' }}>
            Here&apos;s exactly where your business stands. We handle the setup and will let you know if we need anything from you.
          </p>
        </div>
        {showProgress && <SetupProgressRing percentage={setupPercentage} completed={completedSteps} total={totalSteps} />}
      </section>

      {/* 2. Current step */}
      {onboardingEnabled && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          {/* Current Active Step Card */}
          <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 'var(--space-3)' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  Current step
                </h2>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-text)', margin: '2px 0 0 0', fontWeight: 500 }}>
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
                backgroundColor: 'var(--color-bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <strong style={{ color: 'var(--color-text-primary)' }}>Right Now:</strong> {currentStep.right_now}
            </div>
            )}

            <Link href={`/portal/${clientId}/onboarding`} className={buttonClasses({ variant: 'primary' })} style={{ textDecoration: 'none' }}>
              See all steps
            </Link>
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
                    <Link href={`/portal/${clientId}/leads`} style={{ fontSize: '0.72rem', color: 'var(--color-primary-text)', textDecoration: 'none' }}>
                      View leads →
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
                        ? formatDateTime(nextCall)
                        : 'Not booked'}
                    </span>
                    <Link href={`/portal/${clientId}/book-call`} style={{ fontSize: '0.72rem', color: 'var(--color-status-done-text)', textDecoration: 'none' }}>
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
                    <span className="ui-stat-label">Results Tracking</span>
                    <span className="ui-stat-value">{sheetReady ? 'Ready' : 'Being set up'}</span>
                    <Link href={`/portal/${clientId}/tracking`} style={{ fontSize: '0.72rem', color: 'var(--color-status-warning-text)', textDecoration: 'none' }}>
                      {sheetReady ? 'Open Results Tracking →' : 'See Results Tracking →'}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Contract */}
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
                    <span className="ui-stat-label">Contract</span>
                    <span
                      className="ui-stat-value"
                      style={contractState === 'none' ? { color: 'var(--color-text-muted)' } : undefined}
                    >
                      {contractState === 'signed' ? 'Signed' : contractState === 'sent' ? 'Awaiting signature' : 'Not available yet'}
                    </span>
                    {contractState !== 'none' && (
                      <Link href={`/portal/${clientId}/contract`} style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                        View contract →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 'var(--space-6)' }}>
        {/* Website Change Request Widget */}
        <Card>
          <CardHeader
            title="Website Change Request"
          />
          <p style={{ margin: '0 0 var(--space-4) 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.55 }}>
            {WEBSITE_REQUEST_INTRO}
          </p>
          <form onSubmit={handleWebsiteChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Input
              label="Request Title"
              placeholder="What should we change?"
              value={changeTitle}
              onChange={(e) => setChangeTitle(e.target.value)}
              maxLength={200}
              required
            />
            <Input
              label="Page URL (optional)"
              type="text"
              inputMode="url"
              autoComplete="url"
              maxLength={2000}
              placeholder="e.g. https://yourcompany.com/about"
              helperText="Mention the section (for example, the homepage banner) in the description."
              value={changeUrl}
              onChange={(e) => setChangeUrl(e.target.value)}
            />
            <div>
              <label
                htmlFor="website-change-description"
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
                id="website-change-description"
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
                placeholder="Describe the change in your own words"
                value={changeDesc}
                onChange={(e) => setChangeDesc(e.target.value)}
                maxLength={5000}
                required
              />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                onChange={handleFilesPicked}
                tabIndex={-1}
                aria-hidden="true"
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="ui-filter-clear-btn"
                  style={{ height: '34px', padding: '0 12px' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmittingChange || changeFiles.length >= MAX_ATTACHMENTS}
                  aria-label="Attach a logo, photo or PDF"
                >
                  <span aria-hidden="true">{'\u{1F4CE}'}</span> Attach
                </button>
                {changeFiles.map((file, index) => (
                  <span
                    key={`${file.name}-${file.size}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      maxWidth: '100%',
                      padding: '4px 6px 4px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={file.name}>
                      {file.name}
                    </span>
                    <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={isSubmittingChange}
                      aria-label={`Remove ${file.name}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        border: 'none',
                        borderRadius: 'var(--radius-full)',
                        background: 'transparent',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: 1,
                      }}
                    >
                      <span aria-hidden="true">{'\u00D7'}</span>
                    </button>
                  </span>
                ))}
              </div>
              <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Up to {MAX_ATTACHMENTS} files. Images (PNG, JPG, WEBP, GIF, SVG) or PDF, 4 MB in total.
              </p>
              {fileError && (
                <p role="alert" style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-danger-text)' }}>
                  {fileError}
                </p>
              )}
            </div>
            {changeNotice && (
              <div
                ref={changeNoticeRef}
                tabIndex={-1}
                role={changeNotice.isError ? 'alert' : 'status'}
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: changeNotice.isError ? 'var(--color-status-blocked-bg)' : 'var(--color-status-done-bg)',
                  color: changeNotice.isError ? 'var(--color-status-blocked-text)' : 'var(--color-status-done-text)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {changeNotice.text}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmittingChange || !changeTitle.trim() || !changeDesc.trim()}
            >
              {isSubmittingChange ? (changeFiles.length > 0 ? 'Uploading and sending...' : 'Sending...') : 'Send to website team'}
            </Button>
          </form>
        </Card>
      </div>

      {/* Your CSM */}
      <Card>
        <CardHeader title="Your CSM" subtitle="Your main contact at Motionz" />
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {csm ? (
            <>
              {csm.name ? `${csm.name} \u00B7 ` : ''}
              <a href={`mailto:${csm.email}`}>{csm.email}</a>
            </>
          ) : (
            'Not assigned yet'
          )}
        </div>
      </Card>
    </div>
  );
}

function ClientOverviewSkeleton() {
  return (
    <div>
      {/* Hero Skeleton */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-6)' }}>
          <div style={{ flex: '1 1 320px' }}>
            <Skeleton width="200px" height="24px" borderRadius="var(--radius-full)" style={{ marginBottom: 'var(--space-4)' }} />
            <Skeleton width="280px" height="40px" style={{ marginBottom: 'var(--space-3)' }} />
            <Skeleton width="90%" height="16px" style={{ marginBottom: 'var(--space-2)' }} />
            <Skeleton width="60%" height="16px" />
          </div>
          <Skeleton width="132px" height="132px" borderRadius="var(--radius-full)" />
        </div>
      </Card>

      {/* Current Step Skeleton */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
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

      <div>
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
