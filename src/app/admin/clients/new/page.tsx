'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input, Select, Button, Modal } from '@/components/ui';

export default function AddClientPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [csmUserId, setCsmUserId] = useState('');
  const [csms, setCsms] = useState<{ id: string; name?: string; email: string }[]>([]);

  useEffect(() => {
    fetch('/api/admin/csms')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCsms(data.csms);
          if (data.csms.length === 1) setCsmUserId(data.csms[0].id);
        }
      })
      .catch(() => {});
  }, []);
  const [features, setFeatures] = useState<Record<string, boolean>>({
    onboarding: true,
    leads: true,
    tracking: true,
    contracts: true,
    tools: true,
    roof_measurement: true,
    video_scripts: true,
    book_call: true,
    team: true,
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdTenant, setCreatedTenant] = useState<any | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [emailDelivered, setEmailDelivered] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [sheet, setSheet] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          primary_contact_name: contactName,
          primary_email: email,
          phone,
          csm_user_id: csmUserId || undefined,
          feature_overrides: features,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to provision client portal.');
      } else {
        setCreatedTenant(data.tenant);
        setEmailDelivered(data.emailDelivered === true);
        setInvitedEmail(data.tenant?.primary_email || email.trim().toLowerCase());
        setSheet(data.sheet && typeof data.sheet === 'object' ? data.sheet : null);
        let link = data.magicLinkUrl || '';
        if (typeof window !== 'undefined' && link) {
          try {
            if (link.startsWith('/')) {
              link = `${window.location.origin}${link}`;
            } else {
              const parsed = new URL(link);
              if (parsed.origin !== window.location.origin) {
                link = `${window.location.origin}${parsed.pathname}${parsed.search}`;
              }
            }
          } catch {}
        }
        setMagicLink(link);
        setIsSuccessModalOpen(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      {/* 1. Breadcrumb */}
      <div className="ui-breadcrumb">
        <Link href="/admin">Home</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <Link href="/admin/clients">Client Management</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Provision New Client</span>
      </div>

      {/* 2. Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
          Provision New Client
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
          Create a new client company tenant, clone the Master Portal Template, assign a CSM, and generate an invitation.
        </p>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#f87171',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Section 1: Company & Contact Information */}
        <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-4)', width: '100%' }}>
            <div className="ui-stat-icon-wrapper ui-stat-icon-blue" style={{ width: '36px', height: '36px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Company Information
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                Primary client business entity and main administrative contact
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%' }}>
            <Input
              label="Company Name"
              placeholder="e.g. Apex Roofing Pro"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
            <Input
              label="Primary Contact Full Name"
              placeholder="e.g. Michael Henderson"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <Input
              label="Primary Contact Email"
              type="email"
              placeholder="e.g. michael@apexroofing.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              helperText="The invite link is emailed to this address when you create the client."
            />
            <Input
              label="Business Phone Number"
              placeholder="e.g. (555) 345-6789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        {/* Section 2: CSM Assignment */}
        <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-4)', width: '100%' }}>
            <div className="ui-stat-icon-wrapper ui-stat-icon-emerald" style={{ width: '36px', height: '36px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <polyline points="17 11 19 13 23 9" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Customer Success Assignment
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                Assign an internal Motionz CSM to guide onboarding setup
              </p>
            </div>
          </div>

          <div style={{ width: '100%' }}>
            <Select
              label="Assigned CSM"
              value={csmUserId}
              onChange={(e) => setCsmUserId(e.target.value)}
              helperText="CSM will receive setup update capabilities for this portal."
            >
              <option value="">Assign later</option>
              {csms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ? `${c.name} (${c.email})` : c.email}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Section 3: Enabled Features */}
        <div className="ui-stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-4)', width: '100%' }}>
            <div className="ui-stat-icon-wrapper ui-stat-icon-amber" style={{ width: '36px', height: '36px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                Portal Module Configuration
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                Select modules to activate for this client portal
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-3)', width: '100%' }}>
            {Object.entries(features).map(([key, enabled]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  backgroundColor: enabled ? 'var(--color-primary-muted)' : 'var(--color-bg-input)',
                  borderRadius: 'var(--radius-md)',
                  border: enabled ? '1px solid var(--color-primary-border)' : '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleFeature(key)}
                  style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <p
          aria-live="polite"
          style={{
            textAlign: 'right',
            fontSize: 'var(--font-size-xs)',
            color: loading ? 'var(--color-status-warning-text)' : 'var(--color-text-muted)',
            margin: '0 0 var(--space-3)',
          }}
        >
          {loading
            ? 'Creating the portal, tracking sheet and invite. This takes about 15 seconds. Please keep this page open.'
            : 'Creating a client takes about 15 seconds while the portal, tracking sheet and invite are set up.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-8)' }}>
          <Link href="/admin/clients" style={{ textDecoration: 'none' }}>
            <button type="button" className="ui-filter-clear-btn">
              Cancel
            </button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ padding: '10px 20px', fontWeight: 600, borderRadius: 'var(--radius-md)' }}
          >
            {loading ? 'Provisioning...' : 'Provision Client Portal'}
          </Button>
        </div>
      </form>

      {/* Success Modal with Magic Link */}
      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => router.push('/admin/clients')}
        title="Client Portal Provisioned"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', justifyContent: 'flex-end' }}>
            <Button
              variant="outline"
              onClick={() => {
                if (magicLink) {
                  navigator.clipboard.writeText(magicLink);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }
              }}
            >
              {isCopied ? '✓ Link Copied!' : 'Copy Invitation Link'}
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push('/admin/clients')}
            >
              Done
            </Button>
          </div>
        }
      >
        <div>
          <h3 style={{ margin: '0 0 var(--space-3)', fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
            {createdTenant?.name}
          </h3>

          {/* Invite email: say what actually happened. */}
          <div
            role="status"
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--space-3)',
              wordBreak: 'break-word',
              backgroundColor: emailDelivered ? 'var(--color-status-done-bg)' : 'var(--color-status-warning-bg)',
              border: `1px solid ${emailDelivered ? 'var(--color-status-done-border)' : 'var(--color-status-warning-border)'}`,
              color: emailDelivered ? 'var(--color-status-done-text)' : 'var(--color-status-warning-text)',
            }}
          >
            {emailDelivered
              ? `Invite emailed to ${invitedEmail}`
              : 'The invite email could not be sent. Copy this link and send it to the client yourself.'}
          </div>

          {/* Tracking sheet */}
          {sheet && (
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                marginBottom: 'var(--space-3)',
                wordBreak: 'break-word',
                backgroundColor: sheet.ok ? 'var(--color-status-done-bg)' : 'var(--color-status-warning-bg)',
                border: `1px solid ${sheet.ok ? 'var(--color-status-done-border)' : 'var(--color-status-warning-border)'}`,
                color: sheet.ok ? 'var(--color-status-done-text)' : 'var(--color-status-warning-text)',
              }}
            >
              {sheet.ok ? (
                <>
                  Tracking sheet created.
                  {sheet.url && (
                    <>
                      {' '}
                      <a href={sheet.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                        Open sheet
                      </a>
                    </>
                  )}
                </>
              ) : (
                `Tracking sheet was not created${sheet.error ? `: ${sheet.error}` : '.'} You can add it later from the client's page.`
              )}
            </div>
          )}

          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-input)',
              border: '1px solid var(--color-primary-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <span style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              Invitation link (single use, expires in 72 hours):
            </span>
            <span style={{ wordBreak: 'break-all', color: 'var(--color-primary-text)', fontFamily: 'var(--font-family-mono)' }}>
              {magicLink}
            </span>
          </div>

          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            {emailDelivered
              ? 'The same link is in the email. Keep a copy here in case the client cannot find it.'
              : 'The client opens the link to set up their sign-in.'}
          </p>
        </div>
      </Modal>
    </div>
  );
}
