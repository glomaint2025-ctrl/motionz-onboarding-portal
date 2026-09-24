'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Input, Button, Modal, StatusBadge } from '@/components/ui';

export default function AddClientPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [csmUserId, setCsmUserId] = useState('user-csm-1');
  const [features, setFeatures] = useState<Record<string, boolean>>({
    onboarding: true,
    leads: true,
    tracking: true,
    contracts: true,
    orders: true,
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
          csm_user_id: csmUserId,
          feature_overrides: features,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to provision client portal.');
      } else {
        setCreatedTenant(data.tenant);
        setMagicLink(data.magicLinkUrl);
        setIsSuccessModalOpen(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Link href="/admin/clients" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
          Back to Client Roster
        </Link>
        <h1 style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          Provision New Client
        </h1>
        <p>Create a new client company tenant, duplicate the Master Portal Template, assign a CSM, and generate an invitation.</p>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-status-danger-bg)',
            border: '1px solid var(--color-status-danger-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-status-danger-text)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-5)',
          }}
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Section 1: Company & Contact Information */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader
            title="Company Information"
            subtitle="Primary client business entity and main administrative contact"
          />
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
            helperText="An expiring single-use magic link invitation will be generated for this email."
          />
          <Input
            label="Business Phone Number"
            placeholder="e.g. (555) 345-6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Card>

        {/* Section 2: CSM Assignment */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader
            title="Customer Success Assignment"
            subtitle="Assign an internal Motionz CSM to guide onboarding setup"
          />
          <div className="ui-form-group">
            <label className="ui-label">Assigned CSM</label>
            <select
              className="ui-select"
              value={csmUserId}
              onChange={(e) => setCsmUserId(e.target.value)}
            >
              <option value="user-csm-1">Motionz CSM (csm@motionz.ai)</option>
            </select>
            <span className="ui-helper-text">CSM will receive setup update capabilities for this portal.</span>
          </div>
        </Card>

        {/* Section 3: Enabled Features */}
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader
            title="Portal Module Configuration"
            subtitle="Select modules to enable for this client portal"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            {Object.entries(features).map(([key, enabled]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleFeature(key)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>
                  {key.replace('_', ' ')}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <Link href="/admin/clients">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button type="submit" variant="primary" disabled={loading}>
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
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="secondary"
              onClick={() => {
                if (magicLink) navigator.clipboard.writeText(magicLink);
              }}
            >
              Copy Invitation Link
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
          <StatusBadge status="Tenant Active" variant="done" />
          <h3 style={{ margin: 'var(--space-3) 0 var(--space-1)' }}>
            {createdTenant?.name}
          </h3>
          <p style={{ marginBottom: 'var(--space-4)' }}>
            Portal cloned from Master Template with the 5 confirmed setup steps.
          </p>

          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <span style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>
              Single-Use Expiring Invitation Link (72 Hours):
            </span>
            <span style={{ wordBreak: 'break-all', color: 'var(--color-primary)' }}>
              {magicLink}
            </span>
          </div>

          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Deliver this link to the client. Upon first click, it will verify and establish an authenticated session.
          </p>
        </div>
      </Modal>
    </div>
  );
}
