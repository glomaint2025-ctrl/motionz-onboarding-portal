'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input, Select, Button, Modal, buttonClasses } from '@/components/ui';
import { PORTAL_MODULES } from '@/lib/portal-modules';
import { Notice, copyText } from '@/components/admin/Notice';

export default function AddClientPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [csmUserId, setCsmUserId] = useState('');
  const [csms, setCsms] = useState<{ id: string; name?: string; email: string }[]>([]);

  const [csmLoadError, setCsmLoadError] = useState('');

  const loadCsms = () => {
    setCsmLoadError('');
    fetch('/api/admin/csms')
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (ok && data.success && Array.isArray(data.csms)) {
          setCsms(data.csms);
          if (data.csms.length === 1) setCsmUserId(data.csms[0].id);
        } else {
          setCsmLoadError(data.error || 'Could not load the list of CSMs.');
        }
      })
      .catch(() => setCsmLoadError('Could not load the list of CSMs.'));
  };

  useEffect(() => {
    loadCsms();
  }, []);

  // Every portal section starts switched on; the list itself comes from PORTAL_MODULES.
  const [features, setFeatures] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PORTAL_MODULES.map((m) => [m.key, true]))
  );

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdTenant, setCreatedTenant] = useState<any | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [emailDelivered, setEmailDelivered] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [sheet, setSheet] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: prev[key] === false }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'The client could not be added. Please try again.');
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
    } catch {
      setErrorMessage('Could not reach the server. The client may not have been added. Check the Clients list before trying again.');
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
        <Link href="/admin/clients">Clients</Link>
        <span className="ui-breadcrumb-separator">&gt;</span>
        <span className="ui-breadcrumb-current">Add client</span>
      </div>

      {/* 2. Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
          Add client
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
          Set up a new client’s portal with the standard setup steps, choose their CSM, and email them an invitation.
        </p>
      </div>

      {errorMessage && <Notice style={{ marginBottom: 'var(--space-5)' }}>{errorMessage}</Notice>}

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
                Company details
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                The company and the main person we deal with there
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%' }}>
            <Input
              label="Company name"
              placeholder="e.g. Apex Roofing Pro"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={255}
              required
            />
            <Input
              label="Contact name"
              placeholder="e.g. Michael Henderson"
              autoComplete="off"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              maxLength={255}
              required
            />
            <Input
              label="Contact email"
              type="email"
              autoComplete="off"
              maxLength={254}
              placeholder="e.g. michael@apexroofing.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              helperText="The invitation is emailed to this address when you add the client."
            />
            <Input
              label="Business phone (optional)"
              type="tel"
              autoComplete="off"
              maxLength={30}
              placeholder="e.g. +1 555 234 5678"
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
                Customer Success Manager
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                The Motionz team member who will look after this client
              </p>
            </div>
          </div>

          <div style={{ width: '100%' }}>
            {csmLoadError && (
              <Notice onRetry={loadCsms} style={{ marginBottom: 'var(--space-3)' }}>
                {csmLoadError} You can still add the client and assign a CSM later.
              </Notice>
            )}
            <Select
              label="Assigned CSM"
              value={csmUserId}
              onChange={(e) => setCsmUserId(e.target.value)}
              helperText="The CSM can update this client’s setup steps."
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
                Portal sections
              </h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                Choose which parts of the portal this client can see
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-3)', width: '100%' }}>
            {PORTAL_MODULES.map(({ key, label }) => {
              const enabled = features[key] !== false;
              return (
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
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {label}
                </span>
              </label>
              );
            })}
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
            ? 'Setting up the portal, tracking sheet and invitation. Please keep this page open.'
            : 'Adding a client can take a little while, because the portal, tracking sheet and invitation are all set up together.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-8)' }}>
          <Link
            href="/admin/clients"
            className={buttonClasses({ variant: 'secondary' })}
            aria-disabled={loading || undefined}
            style={loading ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
          >
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Adding client...' : 'Add client'}
          </Button>
        </div>
      </form>

      {/* Success: the one-time invitation link is shown here, so a stray click must not close it. */}
      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => router.push('/admin/clients')}
        title="Client added"
        dismissOnOverlay={false}
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="outline"
              disabled={!magicLink}
              onClick={async () => {
                if (!magicLink) return;
                const ok = await copyText(magicLink);
                setCopyState(ok ? 'copied' : 'failed');
                if (ok) setTimeout(() => setCopyState('idle'), 2500);
              }}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy invitation link'}
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
              ? `Invitation emailed to ${invitedEmail}`
              : 'The invitation email could not be sent. Copy the link below and send it to the client yourself.'}
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
              Invitation link (works once, expires in 72 hours):
            </span>
            <span style={{ wordBreak: 'break-all', color: 'var(--color-primary-text)', fontFamily: 'var(--font-family-mono)', userSelect: 'all' }}>
              {magicLink || 'No link was returned. Open the client’s page and use Invite to create one.'}
            </span>
          </div>
          {copyState === 'failed' && (
            <Notice style={{ marginBottom: 'var(--space-3)' }}>Could not copy automatically. Select the link above and copy it by hand.</Notice>
          )}

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
