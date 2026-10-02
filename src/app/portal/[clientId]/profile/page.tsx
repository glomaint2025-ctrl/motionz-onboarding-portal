'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, Input, Skeleton } from '@/components/ui';

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [name, setName] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tenantStatus, setTenantStatus] = useState<string>('');
  const [ghlLocationId, setGhlLocationId] = useState<string>('');
  const [csm, setCsm] = useState<{ name?: string; email?: string } | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (isMounted) setLoadError(data.error || 'Could not load your company profile.');
          return;
        }
        if (isMounted && data.tenant) {
          setName(data.tenant.name || '');
          setPrimaryContact(data.tenant.primary_contact_name || '');
          setEmail(data.tenant.primary_email || '');
          setPhone(data.tenant.phone || '');
          setTenantStatus(data.tenant.status || '');
          const ghl = Array.isArray(data.integrations)
            ? data.integrations.find((i: any) => i.integration_type === 'ghl' && i.is_active)
            : null;
          setGhlLocationId(data.tenant.ghl_location_id || ghl?.config_data?.location_id || '');
          setCsm(data.csm || null);
          setViewerRole(data.viewer?.role || null);
        }
      } catch {
        if (isMounted) setLoadError('Could not reach the server. Check your connection and reload the page.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage('');
    setIsError(false);

    try {
      const res = await fetch(`/api/portal/${clientId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          primary_contact_name: primaryContact,
          phone,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.tenant) {
          setName(data.tenant.name || '');
          setPrimaryContact(data.tenant.primary_contact_name || '');
          setPhone(data.tenant.phone || '');
        }
        setStatusMessage('Company profile updated.');
      } else {
        setStatusMessage(data.error || 'Failed to update profile.');
        setIsError(true);
      }
    } catch {
      setStatusMessage('Could not reach the server. Your changes were not saved.');
      setIsError(true);
    } finally {
      setIsSaving(false);
    }
  };

  // Team members (client_member) can view the profile but only the account owner can edit it.
  const readOnly = viewerRole === 'client_member';
  const statusLabels: Record<string, string> = {
    active: 'Active',
    onboarding: 'Onboarding',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Company Profile</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Your business name, primary contact details, and account information.
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-blocked-bg)',
            color: 'var(--color-status-blocked-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {loadError}
        </div>
      )}

      {statusMessage && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: isError ? 'var(--color-status-blocked-bg)' : 'var(--color-status-done-bg)',
            color: isError ? 'var(--color-status-blocked-text)' : 'var(--color-status-done-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {statusMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-6)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        {/* Profile Edit Form */}
        <Card>
          <CardHeader
            title="Business Contact Information"
            subtitle={
              readOnly
                ? 'Only the account owner can change these details.'
                : 'Keep these details current so your Motionz team can reach you.'
            }
          />
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton width="140px" height="14px" style={{ marginBottom: '6px' }} />
                  <Skeleton width="100%" height="40px" borderRadius="var(--radius-md)" />
                </div>
              ))}
              <Skeleton width="160px" height="40px" borderRadius="var(--radius-md)" style={{ marginTop: 'var(--space-2)' }} />
            </div>
          ) : loadError ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Profile details are unavailable right now.
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Input
                label="Legal Business Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
                required
              />
              <Input
                label="Primary Contact Person"
                value={primaryContact}
                onChange={(e) => setPrimaryContact(e.target.value)}
                disabled={readOnly}
                required
              />
              <Input
                label="Primary Business Email"
                type="email"
                value={email}
                disabled
                helperText="Your login email. Contact your CSM to change it."
              />
              <Input
                label="Business Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={readOnly}
                placeholder={readOnly ? '' : 'e.g. +1 555 234 5678'}
              />

              {!readOnly && (
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
                </Button>
              )}
            </form>
          )}
        </Card>

        {/* Account information (real values only; unknown values are labelled as such) */}
        <Card>
          <CardHeader title="Account Information" subtitle="How your portal is set up with Motionz" />
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width="100%" height="32px" />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                  Client Identifier
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 'var(--font-weight-medium)' }}>{clientId}</span>
              </div>

              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                  GoHighLevel Location ID
                </span>
                {ghlLocationId ? (
                  <span style={{ fontFamily: 'monospace', fontWeight: 'var(--font-weight-medium)' }}>{ghlLocationId}</span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Not connected yet</span>
                )}
              </div>

              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                  Your CSM
                </span>
                {csm && (csm.name || csm.email) ? (
                  <span>
                    {csm.name || csm.email}
                    {csm.name && csm.email ? ` (${csm.email})` : ''}
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Not assigned yet</span>
                )}
              </div>

              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                  Account Status
                </span>
                {tenantStatus ? (
                  <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{statusLabels[tenantStatus] || tenantStatus}</span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Unknown</span>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
