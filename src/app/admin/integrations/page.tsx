'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, Button, StatusBadge, Skeleton, Select } from '@/components/ui';

interface Submission {
  id: string;
  submitter_email?: string;
  answers: Record<string, string>;
  submitted_at: string;
}

interface ClientOption {
  id: string;
  name: string;
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState('');
  const [notifyCsm, setNotifyCsm] = useState(true);
  const [status, setStatus] = useState<Record<string, any>>({});
  const [unmatched, setUnmatched] = useState<Submission[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [settingsRes, clientsRes] = await Promise.all([
        fetch('/api/admin/settings/notifications'),
        fetch('/api/admin/clients'),
      ]);
      const settings = await settingsRes.json();
      const clientData = await clientsRes.json();
      if (settings.success) {
        setRecipients((settings.notifications.onboarding_form_recipients || []).join(', '));
        setNotifyCsm(settings.notifications.notify_assigned_csm !== false);
        setStatus(settings.status || {});
        setUnmatched(settings.unmatchedSubmissions || []);
      }
      if (clientData.success) {
        setClients((clientData.tenants || []).map((t: any) => ({ id: t.id, name: t.name })));
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not load settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_form_recipients: recipients, notify_assigned_csm: notifyCsm }),
      });
      const data = await res.json();
      if (data.success) {
        setRecipients(data.notifications.onboarding_form_recipients.join(', '));
        setMessage({ type: 'ok', text: 'Notification settings saved.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Could not save settings.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error while saving.' });
    } finally {
      setSaving(false);
    }
  };

  const linkSubmission = async (submissionId: string) => {
    const tenantId = linkChoice[submissionId];
    const res = await fetch('/api/admin/settings/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link_submission', submissionId, tenantId }),
    });
    const data = await res.json();
    if (data.success) setUnmatched((list) => list.filter((s) => s.id !== submissionId));
    else setMessage({ type: 'error', text: data.error || 'Could not link the submission.' });
  };

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/ghl` : '/api/webhooks/ghl';

  const statusRows = [
    { label: 'Email delivery', ok: status.email, detail: status.emailSender ? `Sending as ${status.emailSender}` : 'No email provider key set' },
    { label: 'Client tracking sheets', ok: status.trackingSheets, detail: 'Google Apps Script sheet creator' },
    { label: 'GoHighLevel webhooks', ok: status.ghlWebhook, detail: webhookUrl },
  ];

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Settings & Integrations</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Notifications and connected services.</p>
      </div>

      {message && (
        <div
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            backgroundColor: message.type === 'ok' ? 'var(--color-status-done-bg)' : 'var(--color-status-danger-bg)',
            color: message.type === 'ok' ? 'var(--color-status-done-text)' : 'var(--color-status-danger-text)',
          }}
        >
          {message.text}
        </div>
      )}

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Onboarding form notifications"
          subtitle="Who gets an email with the answers when a client submits the onboarding form (for example, the media buyer). They do not need a portal account."
        />
        {loading ? (
          <Skeleton height="90px" />
        ) : (
          <>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-1)' }}>
              Email addresses (comma separated)
            </label>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              rows={2}
              placeholder="mediabuyer@motionz.ai, ops@motionz.ai"
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                marginBottom: 'var(--space-3)',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
              <input type="checkbox" checked={notifyCsm} onChange={(e) => setNotifyCsm(e.target.checked)} />
              Also email the CSM assigned to that client
            </label>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save notification settings'}
            </Button>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Unmatched onboarding submissions"
          subtitle="Forms submitted with an email that does not belong to any portal client yet. Link each one to the right client."
        />
        {loading ? (
          <Skeleton height="60px" />
        ) : unmatched.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Nothing to review.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {unmatched.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                    {s.answers['DBA Business Name'] || s.answers['full_name'] || s.submitter_email || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {s.submitter_email || 'No email'} · {new Date(s.submitted_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <Select
                    value={linkChoice[s.id] || ''}
                    onChange={(e) => setLinkChoice((c) => ({ ...c, [s.id]: e.target.value }))}
                  >
                    <option value="">Choose client...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" size="sm" onClick={() => linkSubmission(s.id)} disabled={!linkChoice[s.id]}>
                    Link
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Connected services" subtitle="Configured through Vercel environment variables." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {statusRows.map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{row.label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>{row.detail}</div>
              </div>
              {!loading && <StatusBadge status={row.ok ? 'Connected' : 'Not configured'} variant={row.ok ? 'done' : 'warning'} />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
