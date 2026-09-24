'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Input, Select, Button, StatusBadge, Modal } from '@/components/ui';

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any | null>(null);
  const [csm, setCsm] = useState<any | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<any[]>([]);

  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('active');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [csmUserId, setCsmUserId] = useState('user-csm-1');

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/clients/${clientId}`);
      const data = await res.json();
      if (data.success) {
        setTenant(data.tenant);
        setCsm(data.csm);
        setFeatures(data.features || {});
        setSteps(data.steps || []);
        setCompanyName(data.tenant.name || '');
        setPhone(data.tenant.phone || '');
        setStatus(data.tenant.status || 'active');
        setGhlLocationId(data.tenant.ghl_location_id || '');
        if (data.csm) setCsmUserId(data.csm.id);
      }
    } catch (err) {
      console.error('Failed to load client details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchClientDetails();
  }, [clientId]);

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          phone,
          status,
          ghl_location_id: ghlLocationId,
          csm_user_id: csmUserId,
          feature_toggles: features,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleArchive = async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        router.push('/admin/clients');
      }
    } catch (err) {
      console.error('Archive failed:', err);
    }
  };

  if (loading) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <p>Loading client portal settings...</p>
      </Card>
    );
  }

  if (!tenant) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <StatusBadge status="Not Found" variant="danger" />
        <h2 style={{ margin: 'var(--space-3) 0' }}>Client Portal Not Found</h2>
        <Link href="/admin/clients">
          <Button variant="secondary">Return to Client Roster</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <Link href="/admin/clients" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
            Back to Client Roster
          </Link>
          <h1 style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            {tenant.name} Settings
          </h1>
          <p>Tenant ID: {tenant.id} &middot; Primary: {tenant.primary_email}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href={`/portal/${tenant.id}`}>
            <Button variant="secondary">
              Open Client Portal View
            </Button>
          </Link>
          <Button variant="danger" onClick={() => setIsArchiveModalOpen(true)}>
            Archive Portal
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-done-bg)',
            border: '1px solid var(--color-status-done-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-status-done-text)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-5)',
          }}
        >
          Settings and feature toggles saved successfully.
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Core Company Settings */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader
            title="Tenant Identity & Integration"
            subtitle="Core operational parameters and GoHighLevel sub-account binding"
            action={<StatusBadge status={status} />}
          />
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
          <Input
            label="Business Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="GoHighLevel Location ID"
            placeholder="e.g. loc_ghl_1234"
            value={ghlLocationId}
            onChange={(e) => setGhlLocationId(e.target.value)}
            helperText="Direct binding to the client's GoHighLevel sub-account."
          />
          <Select
            label="Portal Lifecycle Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Card>

        {/* Assigned CSM */}
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <CardHeader
            title="Customer Success Manager"
            subtitle="Internal staff assigned to oversee onboarding"
          />
          <Select
            label="Assigned CSM"
            value={csmUserId}
            onChange={(e) => setCsmUserId(e.target.value)}
          >
            <option value="user-csm-1">Motionz CSM (csm@motionz.ai)</option>
          </Select>
        </Card>

        {/* Per-Tenant Feature Toggles */}
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <CardHeader
            title="Admin Feature Toggles"
            subtitle="Enable or disable specific modules for this client portal"
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Link href="/admin/clients">
            <Button type="button" variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" variant="primary">
            Save Changes
          </Button>
        </div>
      </form>

      {/* Archive Portal Modal */}
      <Modal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title="Archive Client Portal"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setIsArchiveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleArchive}>
              Confirm Archive
            </Button>
          </div>
        }
      >
        <p style={{ marginBottom: 'var(--space-3)' }}>
          Are you sure you want to archive <strong>{tenant.name}</strong>?
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          This will set the portal status to cancelled and deactivate user access. Historical data is preserved.
        </p>
      </Modal>
    </div>
  );
}
