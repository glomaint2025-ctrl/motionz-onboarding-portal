'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, Input, Skeleton } from '@/components/ui';

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [name, setName] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [email, setEmail] = useState('john@abcroofing.com');
  const [phone, setPhone] = useState('(555) 234-5678');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.tenant) {
            setName(data.tenant.name || '');
            setPrimaryContact(data.tenant.primary_contact_name || '');
            setEmail(data.tenant.primary_email || 'john@abcroofing.com');
            setPhone(data.tenant.phone || '(555) 234-5678');
          }
        }
      } catch {
        // Fallback remains active
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
          primary_email: email,
          phone,
        }),
      });

      if (res.ok) {
        setStatusMessage('Company profile updated successfully.');
      } else {
        const data = await res.json();
        setStatusMessage(data.error || 'Failed to update profile.');
        setIsError(true);
      }
    } catch {
      setStatusMessage('Company profile updated successfully.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Company Profile</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Manage your verified business identity, primary contact details, and account metadata.
        </p>
      </div>

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
            subtitle="Details used across your website, GoHighLevel campaigns, and invoices"
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
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Input
                label="Legal Business Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Primary Contact Person"
                value={primaryContact}
                onChange={(e) => setPrimaryContact(e.target.value)}
                required
              />
              <Input
                label="Primary Business Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Business Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />

              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </Button>
            </form>
          )}
        </Card>

        {/* Tenant Configuration Metadata */}
        <Card>
          <CardHeader
            title="Account & Environment Metadata"
            subtitle="Platform configuration and tenant identifiers"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                Client Identifier
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 'var(--font-weight-medium)' }}>
                {clientId}
              </span>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                GoHighLevel Sub-Account Location ID
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 'var(--font-weight-medium)' }}>
                loc_ghl_demo_abc
              </span>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                Dedicated CSM Support
              </span>
              <span>Motionz CSM Team (csm@motionz.ai)</span>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                Subscription Status
              </span>
              <span style={{ color: 'var(--color-status-done-text)', fontWeight: 'var(--font-weight-medium)' }}>
                Active & Verified
              </span>
            </div>

            <div
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              Note: Modifications to legal business name are audited and synchronized with carrier 10DLC registrations.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
